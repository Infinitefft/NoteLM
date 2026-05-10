import request from './request'

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

/* ---------- 接口 ---------- */

/** 发送聊天消息 */
export function sendMessage(params: SendMessageParams) {
  return request.post<SendMessageResponse>('/chat/send', params, {
    timeout: 120_000, // LLM 响应较慢，给 2 分钟
  })
}

/** 拉取会话的历史消息 */
export function fetchMessages(sessionId: string) {
  return request.get<ChatMessageDTO[]>('/chat/messages', {
    params: { sessionId },
  })
}

/* ---------- 会话 ---------- */

/** 创建新会话 */
export function createSession(title?: string) {
  return request.post<ChatSession>('/chat/sessions', { title })
}

/** 获取会话列表 */
export function fetchSessions() {
  return request.get<ChatSession[]>('/chat/sessions')
}

/** 获取单个会话 */
export function fetchSessionById(sessionId: string) {
  return request.get<ChatSession>(`/chat/sessions/${sessionId}`)
}
