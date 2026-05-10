import { Navigate, createBrowserRouter, RouterProvider } from 'react-router-dom'

import Chat from '../components/Chat'
import NewChat from '../components/NewChat'
import MainLayout from '../layouts/MainLayout'

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Navigate to="/new" replace /> },
      { path: 'new', element: <NewChat /> },
      { path: 'chat/:sessionId', element: <Chat /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
