import { HttpException, HttpStatus } from '@nestjs/common';

/** LLM 请求频率超限 */
export class RateLimitException extends HttpException {
  constructor() {
    super('请求太频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
  }
}

/** LLM 服务端错误 */
export class LlmServiceException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
