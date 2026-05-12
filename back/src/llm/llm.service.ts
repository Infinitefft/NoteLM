import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { LlmServiceException, RateLimitException } from '../common/exceptions';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

@Injectable()
export class LlmService {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      baseURL: this.config.get<string>('LLM_BASE_URL'),
      apiKey: this.config.get<string>('LLM_API_KEY'),
    });
    this.model = this.config.get<string>('LLM_MODEL', 'GLM-5');
  }

  /**
   * 发送消息到 LLM 并返回完整回复文本。
   * messages 已拼好（含 system prompt / RAG context / 历史），直接透传。
   */
  async chat(messages: ChatMessage[]): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages,
    });
    return res.choices[0]?.message?.content || '';
  }

  /**
   * 流式发送消息到 LLM，逐 token yield。
   * 用于 SSE 流式输出场景。
   */
  async *chatStream(messages: ChatMessage[]): AsyncGenerator<string> {
    let stream;
    try {
      stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        stream: true,
      });
    } catch (err: any) {
      if (err.status === 429) throw new RateLimitException();
      throw new LlmServiceException(err.message);
    }

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  /**
   * 根据用户首条消息生成会话标题（≤20 字）。
   */
  async generateTitle(userContent: string): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: 'GLM-4.7',
      messages: [
        {
          role: 'system',
          content:
            '你是一个标题生成器。根据用户的第一条消息，生成一个简短的对话标题，不超过20个字，不要加引号，直接输出标题文本。',
        },
        { role: 'user', content: userContent },
      ],
    });
    return res.choices[0]?.message?.content?.trim() || '新对话';
  }
}
