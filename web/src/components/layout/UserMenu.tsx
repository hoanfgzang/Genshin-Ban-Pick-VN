import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { buttonClass } from '@/components/ui/buttonStyles'
import { useAuthStore } from '@/features/auth/authStore'
import { useInventoryStore } from '@/features/inventory/inventoryStore'

interface UserMenuProps {
  compact?: boolean
  variant?: 'desktop' | 'compact' | 'drawer'
  onNavigate?: () => void
}

export function UserMenu({ compact = false, variant, onNavigate }: UserMenuProps) {
  const mode = variant ?? (compact ? 'compact' : 'desktop')
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const resetInventory = useInventoryStore((s) => s.reset)
  const navigate = useNavigate()

  const onLogout = async () => {
    onNavigate?.()
    await logout()
    resetInventory()
    navigate('/login')
  }

  if (mode === 'drawer') {
    if (!user) {
      return (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
          <span className="text-xs text-muted">Chưa đăng nhập tài khoản</span>
          <div className="flex items-center gap-2">
            <Link
              to="/register"
              onClick={onNavigate}
              className={buttonClass('secondary', 'sm', 'h-10 px-3.5 text-xs sm:text-sm')}
            >
              Đăng ký
            </Link>
            <Link
              to="/login"
              onClick={onNavigate}
              className={buttonClass('primary', 'sm', 'h-10 px-3.5 text-xs sm:text-sm')}
            >
              Đăng nhập
            </Link>
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
        <Link
          to="/profile"
          onClick={onNavigate}
          className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-panel-2"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-strong to-gold text-sm font-bold text-bg">
            {user.displayName[0]?.toUpperCase() ?? 'U'}
          </span>
          <div className="flex min-w-0 flex-col leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="max-w-44 truncate text-sm font-semibold text-text">
                {user.displayName}
              </span>
              {user.role === 'admin' && (
                <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-bold text-gold-strong">
                  {user.isSuperAdmin ? 'Chủ hệ thống' : 'Admin'}
                </span>
              )}
              {user.isGuest && (
                <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted">
                  Khách
                </span>
              )}
            </div>
            {!user.isGuest && <span className="text-xs text-muted">UID {user.uid}</span>}
          </div>
        </Link>
        <Button variant="ghost" size="sm" onClick={onLogout} className="h-10 gap-1.5 px-3 text-xs sm:text-sm">
          <LogoutIcon />
          <span>Đăng xuất</span>
        </Button>
      </div>
    )
  }

  if (!user) {
    return (
      <Link
        to="/login"
        className={buttonClass(
          'primary',
          'sm',
          mode === 'compact' ? 'h-9 px-3 text-xs shrink-0' : 'shrink-0',
        )}
      >
        Đăng nhập
      </Link>
    )
  }

  if (mode === 'compact') {
    return (
      <Link
        to="/profile"
        title={user.displayName}
        aria-label={`Tài khoản ${user.displayName}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-panel-2 sm:size-10"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-gold-strong to-gold text-xs font-bold text-bg sm:size-8">
          {user.displayName[0]?.toUpperCase() ?? 'U'}
        </span>
      </Link>
    )
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
