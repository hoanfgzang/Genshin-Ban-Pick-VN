import { Link, NavLink, Outlet } from 'react-router'
import { BRAND } from '@/config/brand'
import { cn } from '@/lib/cn'
import { Toaster } from '@/components/ui/Toaster'
import { UserMenu } from './UserMenu'

interface NavItem {
  to: string
  label: string
  soon?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Trang chủ' },
  { to: '/profile', label: 'Kho nhân vật' },
  { to: '/rules', label: 'Bộ luật', soon: true },
  { to: '/lobby', label: 'Tạo trận', soon: true },
]

export function AppShell() {
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
            {NAV.map((item) =>
              item.soon ? (
                <span
                  key={item.to}
                  className="hidden shrink-0 cursor-not-allowed items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted/60 md:flex"
                  title="Sắp ra mắt"
                  aria-disabled="true"
                >
                  {item.label}
                  <span className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted">Sắp có</span>
                </span>
              ) : (
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
              ),
            )}
          </nav>

          <UserMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-line/50 py-4 text-center text-xs text-muted">
        {BRAND.name} · Dự án cộng đồng, không liên kết với HoYoverse.
      </footer>
      <Toaster />
    </div>
  )
}
