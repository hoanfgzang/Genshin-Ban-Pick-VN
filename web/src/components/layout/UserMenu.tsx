import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { buttonClass } from '@/components/ui/buttonStyles'
import { useAuthStore } from '@/features/auth/authStore'
import { useInventoryStore } from '@/features/inventory/inventoryStore'

export function UserMenu() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const resetInventory = useInventoryStore((s) => s.reset)
  const navigate = useNavigate()

  if (!user) {
    return (
      <Link to="/login" className={buttonClass('primary', 'sm', 'shrink-0')}>
        Đăng nhập
      </Link>
    )
  }

  const onLogout = async () => {
    await logout()
    resetInventory()
    navigate('/login')
  }

  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <Link to="/profile" className="flex items-center gap-2 rounded-md p-1 hover:bg-panel-2 sm:px-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-gold-strong to-gold text-sm font-bold text-bg">
          {user.displayName[0]?.toUpperCase() ?? 'U'}
        </span>
        <div className="hidden flex-col leading-tight md:flex">
          <span className="max-w-32 truncate text-sm font-medium text-text">{user.displayName}</span>
          {!user.isGuest && <span className="text-[11px] text-muted">UID {user.uid}</span>}
        </div>
        {user.role === 'admin' && (
          <span className="hidden rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-bold text-gold-strong md:inline">
            {user.isSuperAdmin ? 'Chủ hệ thống' : 'Admin'}
          </span>
        )}
        {user.isGuest && (
          <span className="hidden rounded bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted md:inline">
            Khách
          </span>
        )}
      </Link>
      <Button
        variant="ghost"
        size="sm"
        onClick={onLogout}
        aria-label="Đăng xuất"
        title="Đăng xuất"
        className="px-2 sm:px-3"
      >
        <LogoutIcon />
        <span className="hidden sm:inline">Đăng xuất</span>
      </Button>
    </div>
  )
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}
