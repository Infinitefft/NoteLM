import { create } from 'zustand'

import type { ChatSession } from './types'

function generateId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
}

type ChatSessionState = {
  sessions: ChatSession[]
  drafts: Record<string, string>
  streamingBySession: Record<string, boolean>
  createSession: (title?: string) => string
  getSession: (id: string) => ChatSession | undefined
  setDraft: (sessionId: string, value: string) => void
  getDraft: (sessionId: string) => string
  isStreaming: (sessionId: string) => boolean
  setStreaming: (sessionId: string, value: boolean) => void
  clearDraft: (sessionId: string) => void
}

export const useChatSessionStore = create<ChatSessionState>((set, get) => ({
  sessions: [
    { id: 'demo-1', title: '示例：项目规划', updatedAt: Date.now() - 86400000 },
    { id: 'demo-2', title: '示例：读书笔记', updatedAt: Date.now() - 3600000 },
  ],
  drafts: {},
  streamingBySession: {},
  createSession: (title = '新对话') => {
    const id = generateId()
    const session: ChatSession = { id, title, updatedAt: Date.now() }
    set((s) => ({ sessions: [session, ...s.sessions], drafts: { ...s.drafts, [id]: '' } }))
    return id
  },
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
