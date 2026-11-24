import { Link, NavLink, Outlet, useMatch } from 'react-router'
import { Toaster } from '@/components/ui/Toaster'
import { BRAND } from '@/config/brand'
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
  const isMatchPage = Boolean(useMatch('/match/:code'))

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2.5 px-3 sm:gap-4 sm:px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <img src={BRAND.logo} alt="" className="size-8 sm:size-9" />
            <span className="hidden font-extrabold tracking-wide text-gold-strong sm:inline">
              {BRAND.name}
            </span>
          </Link>

          <nav
            className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Điều hướng chính"
          >
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'shrink-0 rounded-md px-2.5 py-2 text-xs font-medium whitespace-nowrap transition sm:px-3 sm:text-sm',
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
      </header>

      <main
        className={cn(
          'mx-auto w-full flex-1',
          isMatchPage ? 'max-w-[1760px] px-2.5 py-3 sm:px-5' : 'max-w-7xl px-4 py-6',
        )}
      >
        <Outlet />
      </main>

      <footer className="border-t border-line/50 py-4 text-center text-xs text-muted">
        {BRAND.name} · Dự án cộng đồng, không liên kết với HoYoverse.
      </footer>
      <Toaster />
    </div>
  )
}
