import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService, type ChatMessage } from '../llm/llm.service';
import { RagService } from '../vectorizer/rag.service';
import { VectorizerService } from '../vectorizer/vectorizer.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly rag: RagService,
    private readonly vectorizer: VectorizerService,
  ) {}

  /* ---------- 消息 ---------- */

  /**
   * 流式发送消息：存用户消息 → 拼历史 → 返回 token 流和标题 Promise。
   * assistant 消息不在此处持久化，由 controller 在流结束后调用 saveAssistantMessage。
   */
  async sendMessageStream(sessionId: string, content: string) {
    // 1) 存用户消息
    await this.prisma.message.create({
      data: { sessionId, role: 'USER', content },
    });

    // 2) 拉历史，拼 messages
    const history = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    const messages: ChatMessage[] = history.map((m) => ({
      role: m.role === 'USER' ? 'user' : 'assistant',
      content: m.content,
    }));

    // 3) RAG 检索：在历史消息前注入上下文
    const ragContext = await this.rag.retrieve(sessionId, content);
    if (ragContext) {
      messages.unshift({ role: 'system', content: ragContext });
    }

    // 4) 流式调用 LLM，标题生成并行
    const isFirstMessage = history.length === 1;
    const tokenStream = this.llm.chatStream(messages);
    const titlePromise = isFirstMessage
      ? this.llm.generateTitle(content)
      : Promise.resolve<string | null>(null);

    return { tokenStream, titlePromise, isFirstMessage };
  }

  /** 流结束后持久化 assistant 消息到数据库 */
  async saveAssistantMessage(sessionId: string, content: string) {
    return this.prisma.message.create({
      data: { sessionId, role: 'ASSISTANT', content },
    });
  }

  /** 更新会话标题 */
  async updateSessionTitle(sessionId: string, title: string) {
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: { title },
    });
    return this.toSessionDTO(session);
  }

  async sendMessage(sessionId: string, content: string) {
    // 1) 存用户消息
    const userMsg = await this.prisma.message.create({
      data: { sessionId, role: 'USER', content },
    });

    // 2) 拉历史，拼 messages（RAG context 后续在此注入）
    const history = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    const messages: ChatMessage[] = history.map((m) => ({
      role: m.role === 'USER' ? 'user' : 'assistant',
      content: m.content,
    }));

    // 3) RAG 检索：在历史消息前注入上下文
    const ragContext = await this.rag.retrieve(sessionId, content);
    if (ragContext) {
      messages.unshift({ role: 'system', content: ragContext });
    }

    // 4) 判断是否首条消息，并发调 LLM：聊天 + 生成标题
    const isFirstMessage = history.length === 1;
    const chatPromise = this.llm.chat(messages);
    const titlePromise = isFirstMessage
      ? this.llm.generateTitle(content)
      : Promise.resolve<string | null>(null);

    const [assistantContent, generatedTitle] = await Promise.all([
      chatPromise,
      titlePromise,
    ]);

    // 5) 存 assistant 消息
    const assistantMsg = await this.prisma.message.create({
      data: { sessionId, role: 'ASSISTANT', content: assistantContent },
    });

    // 6) 若生成了标题，更新会话
    let updatedSession = null;
    if (generatedTitle) {
      const session = await this.prisma.session.update({
        where: { id: sessionId },
        data: { title: generatedTitle },
      });
      updatedSession = this.toSessionDTO(session);
    }

    return {
      message: this.toMessageDTO(assistantMsg),
      session: updatedSession,
    };
  }

  async getMessages(sessionId: string) {
    const messages = await this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
    return messages.map(this.toMessageDTO);
  }

  /* ---------- 会话 ---------- */

  async createSession(title?: string) {
    const session = await this.prisma.session.create({
      data: { title: title ?? '新对话' },
    });
    return this.toSessionDTO(session);
  }

  async getSessions() {
    const sessions = await this.prisma.session.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return sessions.map(this.toSessionDTO);
  }

  async getSessionById(id: string) {
    const session = await this.prisma.session.findUnique({ where: { id } });
    return session ? this.toSessionDTO(session) : null;
  }
  

  async updateSession(id: string, title: string) {
    const session = await this.prisma.session.update({
      where: { id },
      data: { title },
    });
    return this.toSessionDTO(session);
  }

  async deleteSession(id: string) {
    // 级联删除消息
    await this.prisma.message.deleteMany({ where: { sessionId: id } });
    await this.prisma.session.delete({ where: { id } });
    // 清理 Chroma 中的向量
    await this.vectorizer.deleteBySession(id).catch(() => {});
    return { success: true };
  }

  /* ---------- 映射 ---------- */

  private toMessageDTO(message: {
    id: string;
    sessionId: string;
    role: string;
    content: string;
    createdAt: Date;
  }) {
    return {
      id: message.id,
      sessionId: message.sessionId,
      role: message.role.toLowerCase() as 'user' | 'assistant',
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private toSessionDTO(session: {
    id: string;
    title: string | null;
    updatedAt: Date;
  }) {
    return {
      id: session.id,
      title: session.title ?? '新对话',
      updatedAt: session.updatedAt.getTime(),
    };
  }
}
