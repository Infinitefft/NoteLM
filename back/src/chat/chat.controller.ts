import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ChatService } from './chat.service';
import { SendMessageDto, CreateSessionDto, UpdateSessionDto } from './chat.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /* ---------- 消息 ---------- */

  @Post('send-stream')
  async sendStream(@Body() dto: SendMessageDto, @Res() res: Response) {
    const { tokenStream, titlePromise, isFirstMessage } =
      await this.chatService.sendMessageStream(dto.sessionId, dto.content);

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let fullContent = '';
    let aborted = false;

    // 客户端 abort 时保存已输出的部分内容
    res.on('close', async () => {
      if (!res.writableEnded && fullContent) {
        aborted = true;
        await this.chatService.saveAssistantMessage(dto.sessionId, fullContent);
      }
    });

    // 标题生成完成后立即推送，不等流结束
    let titleResolved = false;
    const titleTask = (async () => {
      try {
        const title = await titlePromise;
        if (title && !aborted && !res.writableEnded) {
          res.write(`event: title\ndata: ${JSON.stringify({ title })}\n\n`);
          titleResolved = true;
        }
      } catch {
        // 标题生成失败不影响主流程
      }
    })();

    try {
      for await (const token of tokenStream) {
        if (aborted || res.writableEnded) break;
        fullContent += token;
        res.write(`event: token\ndata: ${JSON.stringify({ content: token })}\n\n`);
      }

      // 等标题生成完成（如果还没完成）
      await titleTask;

      // 持久化 assistant 消息
      const savedMsg = await this.chatService.saveAssistantMessage(
        dto.sessionId,
        fullContent,
      );

      // 更新会话标题
      if (isFirstMessage && titleResolved) {
        const title = await titlePromise;
        if (title) {
          await this.chatService.updateSessionTitle(dto.sessionId, title);
        }
      }

      res.write(
        `event: done\ndata: ${JSON.stringify({
          messageId: savedMsg.id,
          content: fullContent,
          sessionId: dto.sessionId,
        })}\n\n`,
      );
    } catch (err: any) {
      // 流中途出错，保存已输出的部分内容
      if (fullContent) {
        await this.chatService.saveAssistantMessage(dto.sessionId, fullContent);
      }
      if (!res.writableEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: err.message ?? '流中断' })}\n\n`,
        );
      }
    } finally {
      res.end();
    }
  }

  @Post('send')
  send(@Body() dto: SendMessageDto) {
    return this.chatService.sendMessage(dto.sessionId, dto.content);
  }

  @Get('messages')
  messages(@Query('sessionId') sessionId: string) {
    return this.chatService.getMessages(sessionId);
  }

  /* ---------- 会话 ---------- */

  @Post('sessions')
  createSession(@Body() dto: CreateSessionDto) {
    return this.chatService.createSession(dto.title);
  }

  @Get('sessions')
  sessions() {
    return this.chatService.getSessions();
  }

  @Get('sessions/:id')
  session(@Param('id') id: string) {
    return this.chatService.getSessionById(id);
  }

  @Patch('sessions/:id')
  updateSession(@Param('id') id: string, @Body() dto: UpdateSessionDto) {
    return this.chatService.updateSession(id, dto.title);
  }

  @Delete('sessions/:id')
  deleteSession(@Param('id') id: string) {
    return this.chatService.deleteSession(id);
  }
}
