import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { SendMessageDto, CreateSessionDto } from './chat.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /* ---------- 消息 ---------- */

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
}
