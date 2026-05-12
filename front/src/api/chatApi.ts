import axios from './config'

import type { ChatSession } from '../store/types'

/* ---------- 类型 ---------- */

export type ChatMessageDTO = {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export type SendMessageResponse = {
  message: ChatMessageDTO
  session: ChatSession | null
}

export type SendMessageParams = {
  sessionId: string
  content: string
}

/** SSE 流事件类型 */
export type StreamEvent =
  | { type: 'token'; content: string }
  | { type: 'title'; title: string }
  | { type: 'done'; messageId: string; content: string; sessionId: string }
  | { type: 'error'; message: string }

/* ---------- 接口 ---------- */

/** 发送聊天消息 */
export function sendMessage(params: SendMessageParams) {
  return axios.post<SendMessageResponse>('/chat/send', params, {
    timeout: 120_000,
  })
}

/** 拉取会话的历史消息 */
export function fetchMessages(sessionId: string) {
  return axios.get<ChatMessageDTO[]>('/chat/messages', {
    params: { sessionId },
  })
}

/* ---------- 会话 ---------- */

/** 创建新会话 */
export function createSession(title?: string) {
  return axios.post<ChatSession>('/chat/sessions', { title })
}

/** 获取会话列表 */
export function fetchSessions() {
  return axios.get<ChatSession[]>('/chat/sessions')
}

/** 获取单个会话 */
export function fetchSessionById(sessionId: string) {
  return axios.get<ChatSession>(`/chat/sessions/${sessionId}`)
}

/** 更新会话标题 */
export function updateSession(sessionId: string, title: string) {
  return axios.patch<ChatSession>(`/chat/sessions/${sessionId}`, { title })
}

/** 删除会话 */
export function deleteSession(sessionId: string) {
  return axios.delete<{ success: boolean }>(`/chat/sessions/${sessionId}`)
}

/* ---------- 流式发送 ---------- */

const API_BASE = '/api'

/**
 * 流式发送消息，使用原生 fetch 读取 ReadableStream。
 * axios 不支持流式读取 response.body，因此这里直接用 fetch。
 * @param signal 用于 AbortController 取消请求
 */
export function sendMessageStream(
  params: SendMessageParams,
  signal?: AbortSignal,
): Promise<Response> {
  // 连接超时 30s：服务器完全不可达时快速失败
  const controller = new AbortController()
  const connectionTimeout = setTimeout(() => controller.abort(), 30_000)

  // 如果外部也传了 signal，关联到同一个 controller
  if (signal) {
    signal.addEventListener('abort', () => {
      controller.abort()
      clearTimeout(connectionTimeout)
    })
  }

  return fetch(`${API_BASE}/chat/send-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: controller.signal,
  }).finally(() => clearTimeout(connectionTimeout))
}
