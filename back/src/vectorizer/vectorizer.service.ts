import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const COLLECTION_NAME = 'noteLM';
const EMBED_BATCH_SIZE = 64;
/** Chroma 0.6.x v2 API 基础路径 */
const CHROMA_API_BASE = '/api/v2/tenants/default_tenant/databases/default_database';

@Injectable()
export class VectorizerService {
  private readonly logger = new Logger(VectorizerService.name);
  private readonly chromaBaseUrl: string;
  private readonly llmBaseUrl: string;
  private readonly llmApiKey: string;
  private readonly embeddingModel: string;

  /** Chroma collection id 缓存（避免每次查询） */
  private collectionId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.chromaBaseUrl = this.config
      .get<string>('CHROMA_URL', 'http://localhost:8000')
      .replace(/\/$/, '');
    this.llmBaseUrl = this.config
      .get<string>('LLM_BASE_URL', '')
      .replace(/\/$/, '');
    this.llmApiKey = this.config.get<string>('LLM_API_KEY', '');
    this.embeddingModel = this.config.get<string>('EMBEDDING_MODEL', 'embedding-3');
  }

  /* ---------- 公共方法 ---------- */

  /**
   * 将解析后的 chunks 向量化并存入 Chroma。
   * 状态流转：VECTORIZING → READY / FAILED
   */
  async vectorize(
    ragDocumentId: string,
    sessionId: string,
    originalName: string,
    chunks: { pageContent: string; metadata: Record<string, any> }[],
  ): Promise<void> {
    if (chunks.length === 0) {
      this.logger.warn(`文档无 chunks，跳过向量化: ${ragDocumentId}`);
      await this.prisma.ragDocument.update({
        where: { id: ragDocumentId },
        data: { status: 'READY', chromaSyncedAt: new Date() },
      });
      return;
    }

    // 确认状态为 VECTORIZING
    await this.prisma.ragDocument.update({
      where: { id: ragDocumentId },
      data: { status: 'VECTORIZING' },
    });

    try {
      // 1. 获取 collection
      const colId = await this.getOrCreateCollection();

      // 2. 批量 embed
      const texts = chunks.map((c) => c.pageContent);
      const embeddings = await this.embedTexts(texts);

      // 3. 构造插入数据
      const ids = chunks.map((_, i) => `${ragDocumentId}_${i}`);
      const metadatas = chunks.map((c, i) => ({
        sessionId,
        ragDocumentId,
        originalName,
        chunkIndex: i,
        ...c.metadata,
      }));

      // 4. 写入 Chroma
      await this.chromaFetch(`${CHROMA_API_BASE}/collections/${colId}/add`, {
        ids,
        embeddings,
        documents: texts,
        metadatas,
      });

      // 5. 更新状态
      await this.prisma.ragDocument.update({
        where: { id: ragDocumentId },
        data: { status: 'READY', chromaSyncedAt: new Date() },
      });

      this.logger.log(
        `向量化完成: ${originalName} (${chunks.length} chunks → Chroma)`,
      );
    } catch (err: any) {
      this.logger.error(`向量化失败: ${ragDocumentId}`, err.message);
      await this.prisma.ragDocument.update({
        where: { id: ragDocumentId },
        data: { status: 'FAILED', failureReason: err.message ?? '向量化失败' },
      });
      throw err;
    }
  }

  /**
   * 查询与 queryText 最相似的 chunks（RAG 用）。
   */
  async query(
    sessionId: string,
    queryText: string,
    topK = 5,
  ): Promise<{ pageContent: string; metadata: Record<string, any>; score: number }[]> {
    const colId = await this.getOrCreateCollection();
    const [queryEmb] = await this.embedTexts([queryText]);

    const result = await this.chromaFetch(`${CHROMA_API_BASE}/collections/${colId}/query`, {
      query_embeddings: [queryEmb],
      n_results: topK,
      where: { sessionId },
      include: ['documents', 'metadatas', 'distances'],
    });

    const docs: string[][] = result.documents ?? [];
    const metas: Record<string, any>[][] = result.metadatas ?? [];
    const dists: number[][] = result.distances ?? [];

    return (docs[0] ?? []).map((doc, i) => ({
      pageContent: doc,
      metadata: metas[0]?.[i] ?? {},
      score: dists[0]?.[i] ?? 0,
    }));
  }

  /**
   * 删除指定文档的所有 chunks。
   */
  async deleteByDocument(ragDocumentId: string): Promise<void> {
    const colId = await this.getCollectionId();
    if (!colId) return;

    await this.chromaFetch(`${CHROMA_API_BASE}/collections/${colId}/delete`, {
      where: { ragDocumentId },
    });
    this.logger.log(`已删除文档向量: ${ragDocumentId}`);
  }

  /**
   * 删除指定 session 的所有 chunks。
   */
  async deleteBySession(sessionId: string): Promise<void> {
    const colId = await this.getCollectionId();
    if (!colId) return;

    await this.chromaFetch(`${CHROMA_API_BASE}/collections/${colId}/delete`, {
      where: { sessionId },
    });
    this.logger.log(`已删除 session 向量: ${sessionId}`);
  }

  /* ---------- Chroma 操作 ---------- */

  /** 获取 collection id（带缓存） */
  private async getCollectionId(): Promise<string | null> {
    if (this.collectionId) return this.collectionId;

    try {
      const res = await fetch(
        `${this.chromaBaseUrl}${CHROMA_API_BASE}/collections/${COLLECTION_NAME}`,
      );
      if (res.ok) {
        const col = await res.json();
        this.collectionId = col.id;
        return col.id;
      }
    } catch {
      // Chroma 不可达
    }
    return null;
  }

  /** 获取或创建 collection，返回 id */
  private async getOrCreateCollection(): Promise<string> {
    const existing = await this.getCollectionId();
    if (existing) return existing;

    try {
      const col = await this.chromaFetch(`${CHROMA_API_BASE}/collections`, {
        name: COLLECTION_NAME,
        metadata: { 'hnsw:space': 'cosine' },
      });
      this.collectionId = col.id;
      this.logger.log(`Chroma collection 已创建: ${COLLECTION_NAME}`);
      return col.id;
    } catch {
      // 可能已存在（并发创建），再尝试获取
      const existing = await this.getCollectionId();
      if (existing) return existing;
      throw new Error('无法获取或创建 Chroma collection');
    }
  }

  /** 封装 Chroma REST API 请求 */
  private async chromaFetch(path: string, body: any): Promise<any> {
    const res = await fetch(`${this.chromaBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chroma API 错误 (${res.status}): ${text}`);
    }

    // 201 (add) 可能返回空 body
    const contentType = res.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return res.json();
    }
    return null;
  }

  /* ---------- Embedding ---------- */

  /**
   * 调用智谱 Embedding API，返回向量数组。
   * 分批处理，每批 ≤ EMBED_BATCH_SIZE。
   */
  private async embedTexts(texts: string[]): Promise<number[][]> {
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      const batchEmb = await this.callEmbeddingApi(batch);
      allEmbeddings.push(...batchEmb);
    }

    return allEmbeddings;
  }

  /** 原始 HTTP 调用智谱 embedding API */
  private async callEmbeddingApi(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.llmBaseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.llmApiKey}`,
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: texts,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Embedding API 错误 (${res.status}): ${text}`);
    }

    const json = await res.json();
    // 按 index 排序确保顺序正确
    const sorted = (json.data as any[]).sort(
      (a, b) => a.index - b.index,
    );
    return sorted.map((d) => d.embedding as number[]);
  }
}
