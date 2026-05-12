import { create } from 'zustand'

import { sendMessageStream } from '../api/chatApi'
import { readSSEStream } from '../api/streamReader'
import {
  createSession as apiCreateSession,
  fetchMessages as apiFetchMessages,
  fetchSessions as apiFetchSessions,
  deleteSession as apiDeleteSession,
  updateSession as apiUpdateSession,
} from '../api/chatApi'
import type { ChatMessageDTO } from '../api/chatApi'
import type { ChatSession } from './types'

type ChatSessionState = {
  sessions: ChatSession[]
  messagesBySession: Record<string, ChatMessageDTO[]>
  drafts: Record<string, string>
  streamingBySession: Record<string, boolean>
  /** 每个会话的 AbortController，用于取消流式请求 */
  abortControllers: Record<string, AbortController>
  createSession: (title?: string) => Promise<string>
  sendMessage: (sessionId: string, content: string) => Promise<void>
  fetchMessages: (sessionId: string) => Promise<void>
  fetchSessions: () => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  renameSession: (sessionId: string, title: string) => Promise<void>
  updateSession: (session: ChatSession) => void
  getSession: (id: string) => ChatSession | undefined
  getMessages: (sessionId: string) => ChatMessageDTO[]
  setDraft: (sessionId: string, value: string) => void
  getDraft: (sessionId: string) => string
  isStreaming: (sessionId: string) => boolean
  setStreaming: (sessionId: string, value: boolean) => void
  clearDraft: (sessionId: string) => void
  /** 中止指定会话的流式输出 */
  abortStreaming: (sessionId: string) => void
}

export const useChatSessionStore = create<ChatSessionState>((set, get) => ({
  sessions: [],
  messagesBySession: {},
  drafts: {},
  streamingBySession: {},
  abortControllers: {},

  createSession: async (title = '新对话') => {
    const session = await apiCreateSession(title)
    set((s) => ({
      sessions: [session, ...s.sessions],
      drafts: { ...s.drafts, [session.id]: '' },
    }))
    return session.id
  },

  sendMessage: async (sessionId, content) => {
    const { clearDraft, updateSession } = get()

    // 乐观写入用户消息
    const userMsg: ChatMessageDTO = {
      id: `temp-${Date.now()}`,
      sessionId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    }

    // 空 assistant 占位消息，流式填充内容
    const assistantMsg: ChatMessageDTO = {
      id: `temp-assistant-${Date.now()}`,
      sessionId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    }

    set((s) => ({
      messagesBySession: {
        ...s.messagesBySession,
        [sessionId]: [...(s.messagesBySession[sessionId] ?? []), userMsg, assistantMsg],
      },
    }))

    clearDraft(sessionId)
    set((s) => ({
      streamingBySession: { ...s.streamingBySession, [sessionId]: true },
    }))

    // 创建 AbortController 并存入 store，供 abortStreaming 调用
    const controller = new AbortController()
    set((s) => ({
      abortControllers: { ...s.abortControllers, [sessionId]: controller },
    }))

    let accumulated = ''
    let flushTimer: ReturnType<typeof setInterval> | null = null
    let pendingTokens = ''

    // 输出限流：每 30ms 批量合并 pending tokens 并刷新 UI
    const startFlushTimer = () => {
      if (flushTimer) return
      flushTimer = setInterval(() => {
        if (!pendingTokens) return
        const toFlush = pendingTokens
        pendingTokens = ''
        accumulated += toFlush
        set((s) => {
          const msgs = s.messagesBySession[sessionId] ?? []
          const updated = msgs.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: accumulated } : m,
          )
          return {
            messagesBySession: {
              ...s.messagesBySession,
              [sessionId]: updated,
            },
          }
        })
      }, 30)
    }

    const stopFlushTimer = () => {
      if (flushTimer) {
        clearInterval(flushTimer)
        flushTimer = null
      }
    }

    try {
      const response = await sendMessageStream(
        { sessionId, content },
        controller.signal,
      )

      // 处理非 2xx 的 HTTP 错误（fetch 不会因 4xx/5xx 抛异常）
      if (!response.ok) {
        const status = response.status
        if (status === 429) console.error('[Stream] 请求太频繁 (429)')
        else if (status >= 500) console.error('[Stream] 服务器错误 (' + status + ')')
        else console.error('[Stream] HTTP 错误: ' + status)
        throw new Error('HTTP ' + status)
      }

      for await (const event of readSSEStream(response)) {
        if (controller.signal.aborted) break

        switch (event.type) {
          case 'token':
            startFlushTimer()
            pendingTokens += event.content
            break
          case 'title':
            updateSession({ id: sessionId, title: event.title, updatedAt: Date.now() })
            break
          case 'done':
            // 最终刷新：清空 pending tokens
            stopFlushTimer()
            if (pendingTokens) {
              accumulated += pendingTokens
              pendingTokens = ''
            }
            // 用服务端返回的真实消息替换临时占位
            set((s) => {
              const msgs = s.messagesBySession[sessionId] ?? []
              const updated = msgs.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, id: event.messageId, content: event.content }
                  : m,
              )
              return {
                messagesBySession: {
                  ...s.messagesBySession,
                  [sessionId]: updated,
                },
              }
            })
            break
          case 'error':
            console.error('[Stream] 服务端错误:', event.message)
            break
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // 用户主动中止，保留已输出的部分内容
        stopFlushTimer()
        if (pendingTokens) accumulated += pendingTokens
        set((s) => {
          const msgs = s.messagesBySession[sessionId] ?? []
          const updated = msgs.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: accumulated } : m,
          )
          return {
            messagesBySession: {
              ...s.messagesBySession,
              [sessionId]: updated,
            },
          }
        })
        console.log('[Stream] 用户中止，已保留部分内容')
      } else if (err.message === 'FIRST_BYTE_TIMEOUT') {
        // 首字节超时：LLM 响应过慢，移除空 assistant 消息
        console.error('[Stream] 首字节超时，LLM 响应过慢')
        set((s) => {
          const msgs = s.messagesBySession[sessionId] ?? []
          return {
            messagesBySession: {
              ...s.messagesBySession,
              [sessionId]: msgs.filter((m) => m.id !== assistantMsg.id),
            },
          }
        })
      } else {
        // 其他错误：移除空 assistant 消息
        console.error('[Stream] 请求失败:', err.message)
        set((s) => {
          const msgs = s.messagesBySession[sessionId] ?? []
          return {
            messagesBySession: {
              ...s.messagesBySession,
              [sessionId]: msgs.filter((m) => m.id !== assistantMsg.id),
            },
          }
        })
      }
    } finally {
      stopFlushTimer()
      set((s) => ({
        streamingBySession: { ...s.streamingBySession, [sessionId]: false },
      }))
      set((s) => {
        const { [sessionId]: _, ...rest } = s.abortControllers
        return { abortControllers: rest }
      })
    }
  },

  fetchMessages: async (sessionId) => {
    // 流式输出进行中时跳过拉取，避免覆盖乐观写入的消息
    if (get().streamingBySession[sessionId]) return
    const messages = await apiFetchMessages(sessionId)
    set((s) => ({
      messagesBySession: { ...s.messagesBySession, [sessionId]: messages },
    }))
  },

  fetchSessions: async () => {
    const sessions = await apiFetchSessions()
    set({ sessions })
  },

  deleteSession: async (sessionId) => {
    await apiDeleteSession(sessionId)
    set((s) => {
      const { [sessionId]: _msgs, ...restMsgs } = s.messagesBySession
      const { [sessionId]: _draft, ...restDrafts } = s.drafts
      const { [sessionId]: _stream, ...restStreaming } = s.streamingBySession
      return {
        sessions: s.sessions.filter((x) => x.id !== sessionId),
        messagesBySession: restMsgs,
        drafts: restDrafts,
        streamingBySession: restStreaming,
      }
    })
  },

  renameSession: async (sessionId, title) => {
    const updated = await apiUpdateSession(sessionId, title)
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === sessionId ? updated : x)),
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
  abortStreaming: (sessionId) => {
    const controller = get().abortControllers[sessionId]
    if (controller) controller.abort()
  },
}))
