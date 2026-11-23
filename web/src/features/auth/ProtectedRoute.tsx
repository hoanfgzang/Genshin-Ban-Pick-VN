import { Navigate, Outlet, useLocation } from 'react-router'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { useAuthStore } from './authStore'

/** Chặn route khi chưa đăng nhập, chuyển về /login?redirect=… */
export function ProtectedRoute() {
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const location = useLocation()

  if (status !== 'ready') return <FullPageSpinner />
  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }
  return <Outlet />
}
