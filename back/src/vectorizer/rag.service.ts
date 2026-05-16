import { Injectable, Logger } from '@nestjs/common';
import { VectorizerService } from './vectorizer.service';
import { LlmService, type ChatMessage } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';

/** RAG 检索结果 */
export type RagResult = {
  pageContent: string;
  metadata: Record<string, any>;
  score: number;
};

/** 粗排 + 精排后的候选 */
type Candidate = RagResult & { rerankScore?: number };

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  /** RAG Gate: cosine distance 阈值，低于此值才认为相关 */
  private static readonly GATE_THRESHOLD = 0.6;
  /** 粗排召回数 */
  private static readonly COARSE_TOP_K = 20;
  /** 精排后保留数 */
  private static readonly FINAL_TOP_K = 5;
  /** 精排最低分 */
  private static readonly MIN_RERANK_SCORE = 3;

  constructor(
    private readonly vectorizer: VectorizerService,
    private readonly llm: LlmService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 完整 RAG 检索管线，返回上下文字符串或 null。
   */
  async retrieve(sessionId: string, question: string): Promise<string | null> {
    try {
      // Step 1: 前置检查 — session 是否有已入库文档
      const docCount = await this.prisma.ragDocument.count({
        where: { sessionId, status: 'READY' },
      });
      if (docCount === 0) {
        this.logger.log('RAG 跳过: session 无已入库文档');
        return null;
      }

      // Step 2: RAG Gate — embedding 快速判断相关性
      const gateResult = await this.vectorizer.query(sessionId, question, 3);
      if (gateResult.length === 0 || gateResult[0].score >= RagService.GATE_THRESHOLD) {
        this.logger.log(`RAG Gate 拦截: best distance=${gateResult[0]?.score?.toFixed(4) ?? 'N/A'}`);
        return null;
      }

      // Step 3: HyDE — 生成假设性答案
      let hydeAnswer: string | null = null;
      try {
        hydeAnswer = await this.generateHyde(question);
        this.logger.log('HyDE 生成成功');
      } catch (err: any) {
        this.logger.warn(`HyDE 生成失败，退回原始问题: ${err.message}`);
      }

      // Step 4: 粗排 — 用 HyDE embedding 检索
      const queryText = hydeAnswer ?? question;
      const coarseResults = await this.vectorizer.query(
        sessionId,
        queryText,
        RagService.COARSE_TOP_K,
      );
      if (coarseResults.length === 0) {
        this.logger.log('粗排无结果');
        return null;
      }
      this.logger.log(`粗排召回 ${coarseResults.length} 条`);

      // Step 5: 精排 — LLM 打分
      let finalResults: Candidate[];
      try {
        finalResults = await this.rerank(question, coarseResults);
      } catch (err: any) {
        this.logger.warn(`精排失败，退回粗排: ${err.message}`);
        finalResults = coarseResults.slice(0, RagService.FINAL_TOP_K);
      }

      if (finalResults.length === 0) {
        this.logger.log('精排后无合格结果');
        return null;
      }

      // Step 6: 构建上下文
      return this.buildContext(finalResults);
    } catch (err: any) {
      this.logger.error(`RAG 检索异常: ${err.message}`);
      return null;
    }
  }

  /* ---------- HyDE ---------- */

  /** 用 LLM 生成假设性答案，用于改善检索质量 */
  private async generateHyde(question: string): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '请针对用户的问题，写一段详细的回答。你不需要知道确切事实，只需要写出一个可能的、信息丰富的回答即可。直接输出回答内容，不要加前缀说明。',
      },
      { role: 'user', content: question },
    ];

    const answer = await this.llm.chat(messages);
    if (!answer || answer.trim().length === 0) {
      throw new Error('HyDE 返回空');
    }
    return answer.trim();
  }

  /* ---------- Rerank ---------- */

  /** LLM 精排：对每个候选 chunk 打 1-5 分 */
  private async rerank(question: string, candidates: Candidate[]): Promise<Candidate[]> {
    if (candidates.length === 0) return [];

    // 构建 chunk 列表文本
    const chunkList = candidates
      .map((c, i) => `[${i + 1}] ${c.pageContent}`)
      .join('\n\n');

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是一个相关性评分专家。请评估以下每段文本与用户问题的相关性，给出1-5的分数：
        - 5分：高度相关，直接回答了问题
        - 4分：较为相关，包含有用信息
        - 3分：有一定相关性，但信息有限
        - 2分：关联较弱
        - 1分：无关

        请严格按以下格式输出，每行一个，不要输出其他内容：
        [1] 分数
        [2] 分数
        ...`,
      },
      {
        role: 'user',
        content: `用户问题：${question}\n\n待评估文本：\n${chunkList}`,
      },
    ];

    const response = await this.llm.chat(messages);

    // 解析打分结果
    const scores = this.parseRerankScores(response, candidates.length);

    // 将分数附加到候选上
    const scored = candidates.map((c, i) => ({
      ...c,
      rerankScore: scores[i] ?? 0,
    }));

    // 过滤低分 + 排序 + 截断
    return scored
      .filter((c) => (c.rerankScore ?? 0) >= RagService.MIN_RERANK_SCORE)
      .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0))
      .slice(0, RagService.FINAL_TOP_K);
  }

  /** 解析 LLM 输出的打分结果 */
  private parseRerankScores(text: string, expectedCount: number): number[] {
    const scores: number[] = [];
    const regex = /\[(\d+)\]\s*(\d)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const idx = parseInt(match[1], 10) - 1; // 转为 0-based
      const score = parseInt(match[2], 10);
      if (idx >= 0 && idx < expectedCount && score >= 1 && score <= 5) {
        scores[idx] = score;
      }
    }

    // 填充缺失的分数为 0
    for (let i = 0; i < expectedCount; i++) {
      if (scores[i] === undefined) scores[i] = 0;
    }

    return scores;
  }

  /* ---------- 上下文构建 ---------- */

  /** 将精排结果格式化为上下文字符串 */
  private buildContext(results: Candidate[]): string {
    const refs = results
      .map((r, i) => {
        const source = r.metadata?.originalName ?? '未知文档';
        return `[${i + 1}]（来源：${source}）\n${r.pageContent}`;
      })
      .join('\n\n');

    return `以下是与用户问题相关的参考资料，请优先依据这些资料回答，如果资料中没有相关信息，可以结合自身知识回答。

---参考资料---
${refs}
---结束---`;
  }
}
