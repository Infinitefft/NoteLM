import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CheckFileDto, MergeChunksDto } from './file.dto';
import { DocumentParserService } from './document.parser';

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);
  private readonly storageRoot: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly documentParser: DocumentParserService,
  ) {
    this.storageRoot = this.config.get<string>('RAG_STORAGE_ROOT', './data/rag/uploads');
    // 启动时确保目录存在
    fs.mkdir(this.storageRoot, { recursive: true }).catch(() => {});
    fs.mkdir(path.join(this.storageRoot, 'tmp'), { recursive: true }).catch(() => {});
  }

  /* ---------- check ---------- */

  async check(dto: CheckFileDto) {
    // 1. 按 md5Hex 查 DB：若已有 READY 文档则秒传
    const existing = await this.prisma.ragDocument.findFirst({
      where: { md5Hex: dto.fileHash, status: 'READY' },
    });
    if (existing) {
      return { exists: true, uploadedChunks: [] };
    }

    // 2. 检查临时目录下已有的分片
    const tmpDir = path.join(this.storageRoot, 'tmp', dto.fileHash);
    let uploadedChunks: number[] = [];
    try {
      const files = await fs.readdir(tmpDir);
      uploadedChunks = files
        .map((f) => parseInt(f, 10))
        .filter((n) => !isNaN(n))
        .sort((a, b) => a - b);
    } catch {
      // 目录不存在，返回空数组
    }

    return { exists: false, uploadedChunks };
  }

  /* ---------- uploadChunk ---------- */

  async uploadChunk(
    fileHash: string,
    chunkIndex: number,
    chunkBuffer: Buffer,
  ) {
    const tmpDir = path.join(this.storageRoot, 'tmp', fileHash);
    await fs.mkdir(tmpDir, { recursive: true });
    const chunkPath = path.join(tmpDir, String(chunkIndex));
    await fs.writeFile(chunkPath, chunkBuffer);
    return { chunkIndex };
  }

  /* ---------- merge ---------- */

  async merge(dto: MergeChunksDto) {
    const { fileHash, fileName, fileSize, sessionId, totalChunks } = dto;
    const tmpDir = path.join(this.storageRoot, 'tmp', fileHash);

    // 1. 检查分片是否齐全
    let chunkFiles: string[];
    try {
      chunkFiles = await fs.readdir(tmpDir);
    } catch {
      throw new Error('分片目录不存在，请重新上传');
    }

    if (chunkFiles.length < totalChunks) {
      throw new Error(`分片不完整：期望 ${totalChunks}，实际 ${chunkFiles.length}`);
    }

    // 2. 按 index 排序合并
    const sorted = chunkFiles
      .map((f) => ({ name: f, index: parseInt(f, 10) }))
      .filter((x) => !isNaN(x.index))
      .sort((a, b) => a.index - b.index);

    const storageName = `${fileHash}_${fileName}`;
    const finalPath = path.join(this.storageRoot, storageName);

    const writeStream = (await import('node:fs')).createWriteStream(finalPath);
    for (const chunk of sorted) {
      const chunkPath = path.join(tmpDir, chunk.name);
      const data = await fs.readFile(chunkPath);
      writeStream.write(data);
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on('error', reject);
    });

    // 3. 清理临时目录
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch (e) {
      this.logger.warn('清理临时分片失败:', e);
    }

    // 4. 确定文件类型
    const kind = this.inferKind(fileName);
    const mimeType = this.inferMimeType(fileName);

    // 5. 写 DB
    const doc = await this.prisma.ragDocument.create({
      data: {
        sessionId: sessionId,
        originalName: fileName,
        kind,
        mimeType,
        md5Hex: fileHash,
        byteSize: BigInt(fileSize),
        storagePath: storageName,
        status: 'PENDING',
      },
    });

    // 合并成功后异步触发文档解析（不阻塞响应）
    this.documentParser.parse(doc.id).catch((err) => {
      this.logger.error(`异步解析失败: ${doc.id}`, err);
    });

    return {
      document: {
        id: doc.id,
        originalName: doc.originalName,
        kind: doc.kind,
        byteSize: doc.byteSize.toString(),
        status: doc.status,
        createdAt: doc.createdAt.toISOString(),
      },
    };
  }

  /* ---------- helpers ---------- */

  private inferKind(fileName: string): 'PDF' | 'MARKDOWN' | 'PLAIN_TEXT' {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.pdf') return 'PDF';
    if (ext === '.md' || ext === '.markdown') return 'MARKDOWN';
    return 'PLAIN_TEXT';
  }

  private inferMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const map: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.md': 'text/markdown',
      '.markdown': 'text/markdown',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.json': 'application/json',
    };
    return map[ext] ?? 'application/octet-stream';
  }
}
