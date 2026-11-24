import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { HomePage } from '@/pages/HomePage'
import { LobbyPage } from '@/pages/LobbyPage'
import { LoginPage } from '@/pages/LoginPage'
import { MatchPage } from '@/pages/MatchPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { RulesPage } from '@/pages/RulesPage'

export const routes = [
  { path: '/login', element: <LoginPage mode="login" /> },
  { path: '/register', element: <LoginPage mode="register" /> },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'rules', element: <RulesPage /> },
      { path: 'lobby', element: <LobbyPage /> },
      { path: 'match/:code', element: <MatchPage /> },
      {
        element: <ProtectedRoute />,
        children: [{ path: 'profile', element: <ProfilePage /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
