import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useChatSessionStore } from '../store/useChatSessionStore'

export default function NewChat() {
  const navigate = useNavigate()
  const createSession = useChatSessionStore((s) => s.createSession)
  const sendMessage = useChatSessionStore((s) => s.sendMessage)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleHeight = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  const canSend = draft.trim().length > 0

  const handleSend = async () => {
    const content = draft.trim()
    if (!content || sending) return
    setSending(true)
    try {
      const id = await createSession()
      navigate(`/chat/${id}`, { replace: true })
      // 流式输出由 Chat 页面接管，sendMessage 内部会通过 AbortController 管理
      await sendMessage(id, content)
    } catch (err) {
      console.error('NewChat send error:', err)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 font-[family-name:var(--font-body)]">
      <div className="flex w-full max-w-2xl flex-col items-center gap-6">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-[color:var(--text-primary)]">
          NoteLM
        </h1>

        {/* 居中大输入框 */}
        <div className="flex w-full items-end gap-3 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface)] px-4 py-3 shadow-md">
          <div className="flex flex-1 items-center">
            <label className="sr-only" htmlFor="new-chat-input">
              输入要发送的内容
            </label>
            <textarea
              ref={textareaRef}
              id="new-chat-input"
              rows={3}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                handleHeight()
              }}
              onKeyDown={handleKeyDown}
              className="chat-input block w-full resize-none border-none bg-transparent px-0 py-0 text-base leading-7 text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)]"
              placeholder="和 NoteLM 聊点什么……"
            />
          </div>

          <button
            type="button"
            aria-label="发送"
            onClick={handleSend}
            disabled={!canSend || sending}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-orange)] text-[color:var(--surface)] shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-blue)]"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
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
        </div>
      </div>
    </div>
  )
}
