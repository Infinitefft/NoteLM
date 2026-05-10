import { createBrowserRouter, RouterProvider } from 'react-router-dom'

import Chat from '../components/Chat'
import MainLayout from '../layouts/MainLayout'

import IndexRedirect from './IndexRedirect'

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <IndexRedirect /> },
      { path: 'chat/:sessionId', element: <Chat /> },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
