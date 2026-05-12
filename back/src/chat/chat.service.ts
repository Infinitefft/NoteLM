import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService, type ChatMessage } from '../llm/llm.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /* ---------- 消息 ---------- */

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

    // 3) 判断是否首条消息，并发调 LLM：聊天 + 生成标题
    const isFirstMessage = history.length === 1;
    const chatPromise = this.llm.chat(messages);
    const titlePromise = isFirstMessage
      ? this.llm.generateTitle(content)
      : Promise.resolve<string | null>(null);

    const [assistantContent, generatedTitle] = await Promise.all([
      chatPromise,
      titlePromise,
    ]);

    // 4) 存 assistant 消息
    const assistantMsg = await this.prisma.message.create({
      data: { sessionId, role: 'ASSISTANT', content: assistantContent },
    });

    // 5) 若生成了标题，更新会话
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
