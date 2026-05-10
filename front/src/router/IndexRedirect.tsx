import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useChatSessionStore } from '../store/useChatSessionStore'

export default function IndexRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    const { sessions, createSession } = useChatSessionStore.getState()
    const targetId =
      sessions.length > 0
        ? [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0]!.id
        : createSession()
    navigate(`/chat/${targetId}`, { replace: true })
  }, [navigate])

  return (
    <div className="flex flex-1 items-center justify-center text-[color:var(--text-muted)]">
      正在进入会话…
    </div>
  )
}
