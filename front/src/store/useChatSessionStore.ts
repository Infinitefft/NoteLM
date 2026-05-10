import { create } from 'zustand'

import { createSession as apiCreateSession } from '../api/chatApi'
import type { ChatSession } from './types'

type ChatSessionState = {
  sessions: ChatSession[]
  drafts: Record<string, string>
  streamingBySession: Record<string, boolean>
  createSession: (title?: string) => Promise<string>
  updateSession: (session: ChatSession) => void
  getSession: (id: string) => ChatSession | undefined
  setDraft: (sessionId: string, value: string) => void
  getDraft: (sessionId: string) => string
  isStreaming: (sessionId: string) => boolean
  setStreaming: (sessionId: string, value: boolean) => void
  clearDraft: (sessionId: string) => void
}

export const useChatSessionStore = create<ChatSessionState>((set, get) => ({
  sessions: [],
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
  updateSession: (session) =>
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === session.id ? session : x)),
    })),
  getSession: (id) => get().sessions.find((x) => x.id === id),
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
