import { NavLink, useNavigate } from 'react-router-dom'

import { useChatSessionStore } from '../store/useChatSessionStore'

export default function Sidebar() {
  const navigate = useNavigate()
  const sessions = useChatSessionStore((s) => s.sessions)

  const openNewChat = () => {
    navigate('/new')
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
            <NavLink
              key={s.id}
              to={`/chat/${s.id}`}
              className={({ isActive }) =>
                [
                  'rounded-md px-3 py-2.5 text-left text-[15px] leading-snug transition-colors',
                  isActive
                    ? 'bg-[color:var(--surface)] text-[color:var(--text-primary)] shadow-sm'
                    : 'text-[color:var(--text-secondary)] hover:bg-[color:var(--surface)]/60',
                ].join(' ')
              }
            >
              {s.title}
            </NavLink>
          ))}
      </nav>
    </aside>
  )
}
