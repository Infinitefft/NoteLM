import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useChatSessionStore } from '../store/useChatSessionStore'
import type { ChatMessageDTO } from '../api/chatApi'

// 稳定的空数组引用，避免 selector 中 ?? [] 每次返回新数组导致无限重渲染
const EMPTY_MESSAGES: ChatMessageDTO[] = []

export default function Chat() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const setDraft = useChatSessionStore((s) => s.setDraft)
  const sendMessage = useChatSessionStore((s) => s.sendMessage)
  const fetchMessages = useChatSessionStore((s) => s.fetchMessages)
  const abortStreaming = useChatSessionStore((s) => s.abortStreaming)

  // 直接用 selector 订阅数据，而非订阅 getter 函数
  // 原先 getSession/getMessages 订阅的是函数引用（恒不变），store 更新后组件不会重渲染
  const session = useChatSessionStore((s) =>
    sessionId ? s.sessions.find((x) => x.id === sessionId) : undefined,
  )
  const messages = useChatSessionStore((s) =>
    sessionId ? (s.messagesBySession[sessionId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES,
  )

  useEffect(() => {
    if (sessionId) fetchMessages(sessionId)
  }, [sessionId, fetchMessages])

  const draft = useChatSessionStore((s) => sessionId ? (s.drafts[sessionId] ?? '') : '')
  const isStreaming = useChatSessionStore((s) => sessionId ? (s.streamingBySession[sessionId] ?? false) : false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 新消息时自动滚到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [draft])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const canSend = draft.trim().length > 0
  const handleSend = () => {
    const content = draft.trim()
    if (!content) return
    sendMessage(sessionId!, content)
  }
  // 暂停流式输出：通过 AbortController 取消请求
  const handlePause = () => {
    abortStreaming(sessionId!)
  }

  if (!sessionId || !session) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center font-[family-name:var(--font-body)]">
        <p className="text-[color:var(--text-secondary)]">未找到该会话。</p>
        <Link
          to="/"
          className="text-[color:var(--accent-blue)] underline-offset-4 hover:underline"
        >
          返回首页
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col font-[family-name:var(--font-body)]">
      <header className="shrink-0 border-b border-[color:var(--border-subtle)] px-6 py-4">
        <h1 className="font-[family-name:var(--font-heading)] text-lg font-medium text-[color:var(--text-primary)]">
          {session.title}
        </h1>
      </header>

      {/* 消息列表 */}
      <div className="scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-[15px] leading-7 whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-[color:var(--accent-orange)] text-[color:var(--surface)]'
                    : 'bg-[color:var(--surface-muted)] text-[color:var(--text-primary)]'
                }`}
              >
                {/* 流式输出时：空内容显示"正在思考…"，有内容末尾加闪烁光标 */}
                {msg.role === 'assistant' && msg.content === '' && isStreaming
                  ? '正在思考……'
                  : msg.content}
                {msg.role === 'assistant' && isStreaming && msg.content && (
                  <span className="animate-pulse">▌</span>
                )}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 底部输入区 */}
      <footer className="sticky bottom-0 z-10 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)]/95 px-4 pb-4 pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface)] px-3.5 py-2.5 shadow-sm">
          <div className="flex flex-1 items-center">
            <label className="sr-only" htmlFor="chat-input">
              输入要发送的内容
            </label>
            <textarea
              ref={textareaRef}
              id="chat-input"
              rows={1}
              value={draft}
              onChange={(e) => setDraft(sessionId, e.target.value)}
              onKeyDown={handleKeyDown}
              className="chat-input block w-full resize-none border-none bg-transparent px-0 py-0 text-[15px] leading-6 text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)]"
              placeholder="和 NoteLM 聊点什么……"
            />
          </div>

          {isStreaming ? (
            <button
              type="button"
              aria-label="暂停"
              onClick={handlePause}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--surface-muted)] text-[color:var(--text-primary)] shadow-sm ring-1 ring-[color:var(--border-subtle)] transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-blue)]"
            >
              <span className="inline-flex items-center gap-1" aria-hidden="true">
                <span className="h-4 w-1 rounded-[2px] bg-current" />
                <span className="h-4 w-1 rounded-[2px] bg-current" />
              </span>
            </button>
          ) : (
            <button
              type="button"
              aria-label="发送"
              onClick={handleSend}
              disabled={!canSend}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--accent-orange)] text-[color:var(--surface)] shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-blue)]"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M10 15.5V4.5M10 4.5L5.75 8.75M10 4.5L14.25 8.75"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
