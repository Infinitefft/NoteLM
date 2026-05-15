import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import path from 'node:path';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { TextLoader } from '@langchain/classic/document_loaders/fs/text';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

/** LangChain Document 结构 */
type LCDocument = { pageContent: string; metadata: Record<string, any> };

export type ParsedDocument = {
  ragDocumentId: string;
  originalName: string;
  kind: string;
  pages: {
    pageContent: string;
    metadata: Record<string, any>;
  }[];
  chunks: {
    pageContent: string;
    metadata: Record<string, any>;
  }[];
};

@Injectable()
export class DocumentParserService {
  private readonly logger = new Logger(DocumentParserService.name);
  private readonly storageRoot: string;

  private static readonly CHUNK_SIZE = 1000;
  private static readonly CHUNK_OVERLAP = 200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.storageRoot = this.config.get<string>('RAG_STORAGE_ROOT', './data/rag/uploads');
  }

  /**
   * 解析指定 RagDocument 对应的文件，返回 LangChain Document 数组。
   * 同时更新 DB 状态：PENDING → PARSING → READY / FAILED
   */
  async parse(ragDocumentId: string): Promise<ParsedDocument | null> {
    const doc = await this.prisma.ragDocument.findUnique({ where: { id: ragDocumentId } });
    if (!doc) {
      this.logger.warn(`文档不存在: ${ragDocumentId}`);
      return null;
    }

    // 更新状态为 PARSING
    await this.prisma.ragDocument.update({
      where: { id: ragDocumentId },
      data: { status: 'PARSING' },
    });

    const filePath = path.join(this.storageRoot, doc.storagePath);

    try {
      const pages = await this.loadByKind(doc.kind as 'PDF' | 'MARKDOWN' | 'PLAIN_TEXT', filePath);
      const chunks = await this.chunkPages(pages, doc.kind);

      await this.prisma.ragDocument.update({
        where: { id: ragDocumentId },
        data: { status: 'VECTORIZING' },
      });

      this.logger.log(`文档解析完成: ${doc.originalName} (${pages.length} 页, ${chunks.length} 分片)`);

      return {
        ragDocumentId: doc.id,
        originalName: doc.originalName,
        kind: doc.kind,
        pages,
        chunks,
      };
    } catch (err: any) {
      this.logger.error(`文档解析失败: ${doc.originalName}`, err.message);

      await this.prisma.ragDocument.update({
        where: { id: ragDocumentId },
        data: { status: 'FAILED', failureReason: err.message ?? '解析失败' },
      });

      return null;
    }
  }

  /**
   * 解析所有 PENDING 状态的文档
   */
  async parseAllPending(): Promise<ParsedDocument[]> {
    const pending = await this.prisma.ragDocument.findMany({
      where: { status: 'PENDING' },
    });

    this.logger.log(`发现 ${pending.length} 个待解析文档`);

    const results: ParsedDocument[] = [];
    for (const doc of pending) {
      const parsed = await this.parse(doc.id);
      if (parsed) results.push(parsed);
    }

    return results;
  }

  /* ---------- 内部方法 ---------- */

  /**
   * 根据文件类型选择切分策略
   */
  private async chunkPages(
    pages: { pageContent: string; metadata: Record<string, any> }[],
    kind: string,
  ): Promise<{ pageContent: string; metadata: Record<string, any> }[]> {
    switch (kind) {
      case 'MARKDOWN':
        return this.chunkMarkdown(pages);
      case 'PDF':
      case 'PLAIN_TEXT':
      default:
        return this.chunkText(pages);
    }
  }

  /**
   * TXT / PDF：按段落 + 字符递归切分
   */
  private async chunkText(
    pages: { pageContent: string; metadata: Record<string, any> }[],
  ): Promise<{ pageContent: string; metadata: Record<string, any> }[]> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: DocumentParserService.CHUNK_SIZE,
      chunkOverlap: DocumentParserService.CHUNK_OVERLAP,
      separators: ['\n\n', '\n', '. ', '。', ' ', ''],
    });
    const docs = pages.map((p) => ({ pageContent: p.pageContent, metadata: p.metadata ?? {} }));
    const splitDocs = await splitter.splitDocuments(docs as any);
    return splitDocs.map((d: any) => ({
      pageContent: d.pageContent,
      metadata: d.metadata ?? {},
    }));
  }

  /**
   * Markdown：先按标题切分，超大段落二次递归切分
   */
  private async chunkMarkdown(
    pages: { pageContent: string; metadata: Record<string, any> }[],
  ): Promise<{ pageContent: string; metadata: Record<string, any> }[]> {
    const chunks: { pageContent: string; metadata: Record<string, any> }[] = [];
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: DocumentParserService.CHUNK_SIZE,
      chunkOverlap: DocumentParserService.CHUNK_OVERLAP,
      separators: ['\n\n', '\n', ' ', ''],
    });

    for (const page of pages) {
      const content = page.pageContent;
      const metadata = page.metadata ?? {};

      // 按标题切分（# ~ ######），保留标题与后续内容
      const sections = content
        .split(/(?=^#{1,6}\s)/m)
        .filter((s) => s.trim().length > 0);

      for (const section of sections) {
        if (section.length <= DocumentParserService.CHUNK_SIZE) {
          chunks.push({ pageContent: section.trim(), metadata: { ...metadata } });
        } else {
          // 超大段落二次递归切分
          const subDocs = await splitter.splitDocuments([
            { pageContent: section, metadata } as any,
          ]);
          chunks.push(
            ...subDocs.map((d: any) => ({
              pageContent: d.pageContent,
              metadata: d.metadata ?? {},
            })),
          );
        }
      }
    }

    return chunks;
  }

  private async loadByKind(
    kind: 'PDF' | 'MARKDOWN' | 'PLAIN_TEXT',
    filePath: string,
  ): Promise<{ pageContent: string; metadata: Record<string, any> }[]> {
    let docs: LCDocument[];

    switch (kind) {
      case 'PDF': {
        const loader = new PDFLoader(filePath);
        docs = await loader.load();
        break;
      }
      case 'MARKDOWN': {
        // Markdown 本质是文本，用 TextLoader 读取，后续分片时可按标题切分
        const loader = new TextLoader(filePath);
        docs = await loader.load();
        break;
      }
      case 'PLAIN_TEXT':
      default: {
        const loader = new TextLoader(filePath);
        docs = await loader.load();
        break;
      }
    }

    return docs.map((d) => ({
      pageContent: d.pageContent,
      metadata: d.metadata ?? {},
    })) as { pageContent: string; metadata: Record<string, any> }[];
  }
}
