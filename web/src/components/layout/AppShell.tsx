import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router'
import { Toaster } from '@/components/ui/Toaster'
import { BRAND } from '@/config/brand'
import { useAuthStore } from '@/features/auth/authStore'
import { cn } from '@/lib/cn'
import { UserMenu } from './UserMenu'

interface NavItem {
  to: string
  label: string
}

const NAV: NavItem[] = [
  { to: '/', label: 'Trang chủ' },
  { to: '/profile', label: 'Kho nhân vật' },
  { to: '/rules', label: 'Bộ luật' },
  { to: '/lobby', label: 'Tạo trận' },
]

export function AppShell() {
  const location = useLocation()
  const isMatchPage = Boolean(useMatch('/match/:code'))
  const user = useAuthStore((s) => s.user)
  const navItems = user?.isSuperAdmin
    ? [...NAV, { to: '/admin/users', label: 'Quản lý tài khoản' }]
    : NAV

  const routeKey = location.key || location.pathname
  const [openAtKey, setOpenAtKey] = useState<string | null>(null)
  const [isCondensed, setIsCondensed] = useState(false)

  const menuOpen = openAtKey === routeKey
  const toggleMenu = () => setOpenAtKey((cur) => (cur === routeKey ? null : routeKey))
  const closeMenu = () => setOpenAtKey(null)

  useEffect(() => {
    const onScroll = () => {
      setIsCondensed(window.scrollY > 40)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenAtKey(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const activeNavItem = navItems.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  )
  const activeLabel =
    activeNavItem?.label ??
    (isMatchPage
      ? 'Phòng đấu'
      : location.pathname.startsWith('/login')
        ? 'Đăng nhập'
        : location.pathname.startsWith('/register')
          ? 'Đăng ký'
          : 'Trang chủ')

  const mobileContainerCls = isMatchPage
    ? 'mx-auto w-full max-w-[1680px] px-3 sm:px-5'
    : 'mx-auto w-full max-w-7xl px-4 sm:px-6'

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className={cn(
          'sticky top-0 z-30 h-12 sm:h-14 xl:h-16',
          isCondensed && !menuOpen
            ? 'pointer-events-none xl:pointer-events-auto xl:border-b xl:border-line/70 xl:bg-bg/80 xl:backdrop-blur'
            : 'border-b border-line/70 bg-bg/80 backdrop-blur',
        )}
      >
        {/* Desktop (>= xl): exact original HEAD horizontal bar */}
        <div className="mx-auto hidden h-16 max-w-7xl items-center gap-4 px-4 xl:flex">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <img src={BRAND.logo} alt="" className="size-9" />
            <span className="font-extrabold tracking-wide text-gold-strong">{BRAND.name}</span>
          </Link>

          <nav
            className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Điều hướng chính"
          >
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'shrink-0 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition',
                    isActive ? 'bg-gold/10 text-gold-strong' : 'text-muted hover:text-text',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <UserMenu />
        </div>

        {/* Mobile & iPad (< xl): single-tab compact bar / right-docked scroll pill + clean sheet */}
        <div className="h-full xl:hidden">
          {isCondensed && !menuOpen ? (
            <div className={cn(mobileContainerCls, 'flex h-full items-center justify-end')}>
              <div className="pointer-events-auto inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 shadow-md sm:h-10">
                <Link to="/" className="flex shrink-0 items-center" aria-label={BRAND.name}>
                  <img src={BRAND.logo} alt="" className="size-5" />
                </Link>
                <span className="max-w-28 truncate text-xs font-medium text-muted">
                  {activeLabel}
                </span>
                <span className="h-4 w-px bg-line/80" aria-hidden="true" />
                <button
                  type="button"
                  onClick={toggleMenu}
                  aria-expanded={false}
                  aria-controls="mobile-nav-drawer"
                  aria-label="Hiển thị đầy đủ tất cả tab"
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 text-xs font-semibold text-gold-strong transition-colors hover:text-text"
                >
                  <MenuGridIcon />
                  <span>Tất cả tab</span>
                  <span aria-hidden="true">▾</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                mobileContainerCls,
                'pointer-events-auto flex h-full items-center justify-between gap-2',
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <Link to="/" className="flex shrink-0 items-center gap-2">
                  <img src={BRAND.logo} alt="" className="size-7" />
                  <span className="hidden text-sm font-extrabold tracking-wide text-gold-strong md:inline">
                    {BRAND.name}
                  </span>
                </Link>
                <span className="text-line" aria-hidden="true">
                  /
                </span>
                <span className="truncate text-sm font-semibold text-text">{activeLabel}</span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMenu}
                  aria-expanded={menuOpen}
                  aria-controls="mobile-nav-drawer"
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-3 text-xs font-medium text-text transition hover:border-gold/60 sm:h-10 sm:text-sm"
                >
                  <MenuGridIcon />
                  <span>{menuOpen ? 'Thu gọn ▴' : 'Tất cả tab ▾'}</span>
                </button>
                <UserMenu compact />
              </div>
            </div>
          )}

          {menuOpen && (
            <>
              <div
                aria-hidden="true"
                onClick={closeMenu}
                className="pointer-events-auto fixed inset-0 top-12 z-20 bg-black/65 sm:top-14 xl:hidden"
              />
              <div
                id="mobile-nav-drawer"
                className="pointer-events-auto relative z-30 border-b border-line bg-panel xl:hidden"
              >
                <div className={cn(mobileContainerCls, 'flex flex-col gap-3 py-3 sm:py-4')}>
                  <nav
                    aria-label="Tất cả tab điều hướng"
                    className="flex flex-col divide-y divide-line/40 sm:grid sm:grid-cols-4 sm:gap-2 sm:divide-y-0"
                  >
                    {navItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        onClick={closeMenu}
                        className={({ isActive }) =>
                          cn(
                            'flex min-h-11 items-center border-l-2 px-3 text-sm font-medium transition-colors sm:justify-center sm:rounded-lg sm:border sm:border-l',
                            isActive
                              ? 'border-gold bg-gold/10 font-semibold text-gold-strong sm:border-gold'
                              : 'border-transparent text-muted hover:text-text sm:border-line/70 sm:bg-bg/50 sm:hover:border-gold/40',
                          )
                        }
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </nav>
                  <UserMenu variant="drawer" onNavigate={closeMenu} />
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      <main
        className={cn(
          'mx-auto w-full flex-1',
          isMatchPage
            ? 'max-w-[1760px] px-2.5 py-2.5 sm:px-4 xl:px-5 xl:py-3'
            : 'max-w-7xl px-3.5 py-4 sm:px-4 sm:py-6',
        )}
      >
        <Outlet />
      </main>

      <footer className="border-t border-line/50 py-4 text-center text-xs text-muted">
        {BRAND.name} · Web chan nhau trên mọi luật.
      </footer>
      <Toaster />
    </div>
  )
}

function MenuGridIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}
