import { create } from 'zustand'

import { createSession as apiCreateSession, sendMessage as apiSendMessage, fetchMessages as apiFetchMessages } from '../api/chatApi'
import type { ChatMessageDTO } from '../api/chatApi'
import type { ChatSession } from './types'

type ChatSessionState = {
  sessions: ChatSession[]
  messagesBySession: Record<string, ChatMessageDTO[]>
  drafts: Record<string, string>
  streamingBySession: Record<string, boolean>
  createSession: (title?: string) => Promise<string>
  sendMessage: (sessionId: string, content: string) => Promise<void>
  fetchMessages: (sessionId: string) => Promise<void>
  updateSession: (session: ChatSession) => void
  getSession: (id: string) => ChatSession | undefined
  getMessages: (sessionId: string) => ChatMessageDTO[]
  setDraft: (sessionId: string, value: string) => void
  getDraft: (sessionId: string) => string
  isStreaming: (sessionId: string) => boolean
  setStreaming: (sessionId: string, value: boolean) => void
  clearDraft: (sessionId: string) => void
}

export const useChatSessionStore = create<ChatSessionState>((set, get) => ({
  sessions: [],
  messagesBySession: {},
  drafts: {},
  streamingBySession: {},

  createSession: async (title = '新对话') => {
    const session = await apiCreateSession(title)
    set((s) => ({
      sessions: [session, ...s.sessions],
      drafts: { ...s.drafts, [session.id]: '' },
    }))
    return session.id
  },

  sendMessage: async (sessionId, content) => {
    const { setStreaming, clearDraft, updateSession } = get()
    // 乐观写入用户消息
    const userMsg: ChatMessageDTO = {
      id: `temp-${Date.now()}`,
      sessionId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    }
    set((s) => ({
      messagesBySession: {
        ...s.messagesBySession,
        [sessionId]: [...(s.messagesBySession[sessionId] ?? []), userMsg],
      },
    }))
    clearDraft(sessionId)
    setStreaming(sessionId, true)
    try {
      const res = await apiSendMessage({ sessionId, content })
      // 追加 assistant 回复，用户消息保留乐观写入的临时版本
      set((s) => {
        const current = s.messagesBySession[sessionId] ?? []
        return {
          messagesBySession: {
            ...s.messagesBySession,
            [sessionId]: [...current, res.message],
          },
        }
      })
      if (res.session) updateSession(res.session)
    } finally {
      setStreaming(sessionId, false)
    }
  },

  fetchMessages: async (sessionId) => {
    const messages = await apiFetchMessages(sessionId)
    set((s) => ({
      messagesBySession: { ...s.messagesBySession, [sessionId]: messages },
    }))
  },

  updateSession: (session) =>
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === session.id ? session : x)),
    })),

  getSession: (id) => get().sessions.find((x) => x.id === id),
  getMessages: (sessionId) => get().messagesBySession[sessionId] ?? [],
  setDraft: (sessionId, value) =>
    set((s) => ({ drafts: { ...s.drafts, [sessionId]: value } })),
  getDraft: (sessionId) => get().drafts[sessionId] ?? '',
  isStreaming: (sessionId) => get().streamingBySession[sessionId] ?? false,
  setStreaming: (sessionId, value) =>
    set((s) => ({
      streamingBySession: { ...s.streamingBySession, [sessionId]: value },
    })),
  clearDraft: (sessionId) =>
    set((s) => ({ drafts: { ...s.drafts, [sessionId]: '' } })),
}))
