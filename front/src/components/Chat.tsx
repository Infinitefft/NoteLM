import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useChatSessionStore } from '../store/useChatSessionStore'
import { sendMessage } from '../api/chatApi';

export default function Chat() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const getSession = useChatSessionStore((s) => s.getSession)
  const setDraft = useChatSessionStore((s) => s.setDraft)
  const setStreaming = useChatSessionStore((s) => s.setStreaming)
  const clearDraft = useChatSessionStore((s) => s.clearDraft)
  const updateSession = useChatSessionStore((s) => s.updateSession)

  const session = sessionId ? getSession(sessionId) : undefined

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

  const draft = useChatSessionStore((s) => s.drafts[sessionId] ?? '')
  const isStreaming = useChatSessionStore((s) => s.streamingBySession[sessionId] ?? false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
  const handleSend = async () => {
    const content = draft.trim()
    if (!content) return
    clearDraft(sessionId)
    setStreaming(sessionId, true)
    try {
      const res = await sendMessage({ sessionId, content })
      if (res.session) updateSession(res.session)
    } catch (err) {
      console.error('sendMessage error:', err)
    } finally {
      setStreaming(sessionId, false)
    }
  }
  const handlePause = () => {
    setStreaming(sessionId, false)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col font-[family-name:var(--font-body)]">
      <header className="shrink-0 border-b border-[color:var(--border-subtle)] px-6 py-4">
        <h1 className="font-[family-name:var(--font-heading)] text-lg font-medium text-[color:var(--text-primary)]">
          {session.title}
        </h1>
        <p className="mt-1 text-sm text-[color:var(--text-muted)]">中间区域：聊天内容（布局占位）</p>
      </header>

      {/* 消息区域占位 */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 py-6 text-center text-[color:var(--text-secondary)]">
        <p>在此与 AI 对话。</p>
        <p className="text-sm text-[color:var(--text-muted)]">上方为消息列表区域，稍后接入。</p>
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