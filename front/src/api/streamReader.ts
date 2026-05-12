import type { StreamEvent } from './chatApi'

/**
 * 解析 SSE 缓冲区，提取完整事件并返回未消费的剩余部分。
 * SSE 格式：event: xxx\ndata: yyy\n\n
 */
function parseBufferEvents(buffer: string): {
  events: StreamEvent[]
  remaining: string
} {
  const events: StreamEvent[] = []
  // SSE 事件以双换行分隔
  const parts = buffer.split('\n\n')
  // 最后一部分可能不完整
  const remaining = parts.pop() || ''

  for (const part of parts) {
    const lines = part.split('\n')
    let eventType = ''
    let data = ''
    for (const line of lines) {
      if (line.startsWith('event: ')) eventType = line.slice(7)
      else if (line.startsWith('data: ')) data = line.slice(6)
    }
    if (!eventType || !data) continue

    try {
      const parsed = JSON.parse(data)
      switch (eventType) {
        case 'token':
          events.push({ type: 'token', content: parsed.content })
          break
        case 'title':
          events.push({ type: 'title', title: parsed.title })
          break
        case 'done':
          events.push({
            type: 'done',
            messageId: parsed.messageId,
            content: parsed.content,
            sessionId: parsed.sessionId,
          })
          break
        case 'error':
          events.push({ type: 'error', message: parsed.message })
          break
      }
    } catch {
      // JSON 解析失败，跳过该事件
    }
  }

  return { events, remaining }
}

/**
 * 读取 SSE 流，逐个 yield 解析后的事件。
 *
 * 首字节超时机制：
 * - fetch 本身会在 30s 内判断服务器是否可达（连接超时，在 sendMessageStream 中处理）
 * - 首字节超时用于区分"服务器可达但 LLM 迟迟未响应"和"正常慢速输出"
 * - 超时后抛出 Error(message = 'FIRST_BYTE_TIMEOUT')，调用方可据此提示用户
 */
export async function* readSSEStream(
  response: Response,
  firstByteTimeoutMs = 20_000,
): AsyncGenerator<StreamEvent> {
  const body = response.body
  if (!body) throw new Error('Response body is null')

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    // 首字节超时：等待第一个 chunk
    const firstChunkPromise = reader.read()
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('FIRST_BYTE_TIMEOUT')),
        firstByteTimeoutMs,
      ),
    )

    const firstChunk = await Promise.race([firstChunkPromise, timeoutPromise])

    buffer += decoder.decode(firstChunk.value, { stream: true })
    let { events, remaining } = parseBufferEvents(buffer)
    buffer = remaining
    for (const event of events) yield event

    // 持续读取后续 chunk
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parsed = parseBufferEvents(buffer)
      buffer = parsed.remaining
      for (const event of parsed.events) yield event
    }

    // 处理缓冲区剩余内容
    if (buffer.trim()) {
      const parsed = parseBufferEvents(buffer)
      for (const event of parsed.events) yield event
    }
  } finally {
    reader.releaseLock()
  }
}
