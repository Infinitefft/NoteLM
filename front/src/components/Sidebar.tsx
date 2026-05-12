import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

import { useChatSessionStore } from '../store/useChatSessionStore'

export default function Sidebar() {
  const navigate = useNavigate()
  const sessions = useChatSessionStore((s) => s.sessions)
  const fetchSessions = useChatSessionStore((s) => s.fetchSessions)
  const deleteSession = useChatSessionStore((s) => s.deleteSession)
  const renameSession = useChatSessionStore((s) => s.renameSession)

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const menuRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null)
      }
    }
    if (menuOpenId) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpenId])

  // 编辑模式自动聚焦
  useEffect(() => {
    if (editingId) editInputRef.current?.focus()
  }, [editingId])

  const openNewChat = () => navigate('/new')

  const toggleMenu = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuOpenId(menuOpenId === id ? null : id)
  }

  const startEdit = (id: string, currentTitle: string) => {
    setEditingId(id)
    setEditTitle(currentTitle)
    setMenuOpenId(null)
  }

  const confirmEdit = () => {
    if (editingId && editTitle.trim()) {
      renameSession(editingId, editTitle.trim())
    }
    setEditingId(null)
  }

  const cancelEdit = () => setEditingId(null)

  const handleDelete = async (id: string) => {
    await deleteSession(id)
    setConfirmDeleteId(null)
    // 如果当前正在这个会话页，跳回首页
    if (window.location.pathname.includes(id)) {
      navigate('/new')
    }
  }

  return (
    <aside className="flex w-[260px] shrink-0 flex-col bg-[color:var(--surface-muted)]">
      <header className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={openNewChat}
            className="font-[family-name:var(--font-heading)] text-xl font-semibold tracking-tight text-[color:var(--text-primary)] hover:text-[color:var(--accent-orange)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-orange)]"
          >
            NoteLM
          </button>
        </div>
        <button
          type="button"
          onClick={openNewChat}
          className="rounded-lg bg-[color:var(--accent-orange)] px-4 py-2.5 text-center text-[15px] font-medium text-[color:var(--surface)] hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-blue)]"
        >
          新聊天
        </button>
      </header>

      <div className="px-4 pb-2">
        <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
          聊天记录
        </p>
      </div>

      <nav className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4">
        {[...sessions]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((s) => (
            <div key={s.id} className="relative">
              {/* 编辑模式 */}
              {editingId === s.id ? (
                <div className="flex items-center gap-1 rounded-md bg-[color:var(--surface)] px-2 py-2 shadow-sm">
                  <input
                    ref={editInputRef}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmEdit()
                      if (e.key === 'Escape') cancelEdit()
                    }}
                    className="min-w-0 flex-1 border-none bg-transparent text-[15px] leading-snug text-[color:var(--text-primary)] outline-none"
                  />
                  <button
                    type="button"
                    onClick={confirmEdit}
                    className="shrink-0 text-[13px] font-medium text-[color:var(--accent-blue)] hover:underline"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="shrink-0 text-[13px] text-[color:var(--text-muted)] hover:underline"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <NavLink
                  to={`/chat/${s.id}`}
                  className={({ isActive }) =>
                    [
                      'group flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-[15px] leading-snug transition-colors',
                      isActive
                        ? 'bg-[color:var(--surface)] text-[color:var(--text-primary)] shadow-sm'
                        : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface)]/60',
                    ].join(' ')
                  }
                >
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  {/* 三点菜单按钮 */}
                  <button
                    type="button"
                    onClick={(e) => toggleMenu(s.id, e)}
                    className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-[color:var(--border-subtle)] group-hover:opacity-100"
                    aria-label="更多操作"
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
                      <circle cx="8" cy="3" r="1.5" />
                      <circle cx="8" cy="8" r="1.5" />
                      <circle cx="8" cy="13" r="1.5" />
                    </svg>
                  </button>
                </NavLink>
              )}

              {/* 下拉菜单 */}
              {menuOpenId === s.id && (
                <div
                  ref={menuRef}
                  className="absolute right-2 top-full z-20 mt-1 w-32 overflow-hidden rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface)] shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => startEdit(s.id, s.title)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-muted)]"
                  >
                    编辑标题
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpenId(null)
                      setConfirmDeleteId(s.id)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-muted)]"
                  >
                    删除会话
                  </button>
                </div>
              )}
            </div>
          ))}
      </nav>

      {/* 删除确认弹窗 */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-80 rounded-xl bg-[color:var(--surface)] p-6 shadow-xl">
            <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold text-[color:var(--text-primary)]">
              删除会话
            </h3>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
              确定要删除该会话吗？删除后无法恢复。
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-muted)]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDeleteId)}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
