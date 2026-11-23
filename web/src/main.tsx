import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { useAuthStore } from '@/features/auth/authStore'
import { router } from './router'
import './styles/index.css'

void useAuthStore.getState().init()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
