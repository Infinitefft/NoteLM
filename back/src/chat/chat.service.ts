import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  /* ---------- 消息 ---------- */

  async sendMessage(sessionId: string, content: string) {
    const message = await this.prisma.message.create({
      data: { sessionId, role: 'USER', content },
    });
    return this.toMessageDTO(message);
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
      data: { title: title ?? '新会话' },
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
      title: session.title ?? '新会话',
      updatedAt: session.updatedAt.getTime(),
    };
  }
}
