import { Outlet } from 'react-router-dom'

import Sidebar from '../components/Sidebar'

export default function MainLayout() {
  return (
    <div className="flex min-h-[100svh] w-full bg-[color:var(--surface)] text-[color:var(--text-primary)]">
      <Sidebar />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)]">
        <Outlet />
      </main>
    </div>
  )
}
