import * as Tabs from '@radix-ui/react-tabs'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { Toaster } from '@/components/ui/Toaster'
import { toast } from '@/components/ui/toast'
import { BRAND } from '@/config/brand'
import { CHARACTERS } from '@/domain/characters'
import { errorMessage, useAuthStore } from '@/features/auth/authStore'
import { LoginForm } from '@/features/auth/LoginForm'
import { RegisterForm } from '@/features/auth/RegisterForm'

type Mode = 'login' | 'register'

/** Chỉ cho phép chuyển hướng nội bộ (tránh open-redirect). */
function safeRedirect(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/profile'
}

// Ảnh nền: lấy các nhân vật 5★ mới nhất
const BACKDROP = CHARACTERS.filter((c) => c.rarity === 5)
  .slice(-40)
  .reverse()

export function LoginPage({ mode }: { mode: Mode }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const loginAsGuest = useAuthStore((s) => s.loginAsGuest)
  const [guestLoading, setGuestLoading] = useState(false)
  const redirect = safeRedirect(params.get('redirect'))

  if (status !== 'ready') return <FullPageSpinner />
  if (user) return <Navigate to={redirect} replace />

  const goNext = () => navigate(redirect, { replace: true })
  const onTabChange = (value: string) => {
    const qs = params.toString()
    navigate(`/${value}${qs ? `?${qs}` : ''}`, { replace: true })
  }
  const onGuest = async () => {
    setGuestLoading(true)
    try {
      await loginAsGuest()
      toast.info('Bạn đang dùng chế độ Khách — kho lưu trên trình duyệt và có thể xem Bộ luật / theo dõi trận.')
      goNext()
    } catch (err) {
      toast.error(errorMessage(err))
      setGuestLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      {/* Nền collage avatar */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 grid grid-cols-6 gap-3 p-3 opacity-[0.13] blur-[1px] sm:grid-cols-8 lg:grid-cols-10"
      >
        {BACKDROP.map((c) => (
          <img key={c.slug} src={c.icon} alt="" className="aspect-square w-full rounded-xl object-cover" />
        ))}
      </div>
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/80 to-bg" />

      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src={BRAND.logo} alt="" className="size-16 drop-shadow-[0_0_20px_rgba(211,188,142,0.35)]" />
          <h1 className="text-2xl font-extrabold tracking-wide text-gold-strong">{BRAND.name}</h1>
          <p className="text-sm text-muted">{BRAND.tagline}</p>
        </Link>

        <div className="panel border-gold/25 p-6">
          <Tabs.Root value={mode} onValueChange={onTabChange}>
            <Tabs.List className="mb-6 grid grid-cols-2 rounded-lg bg-bg/60 p-1" aria-label="Đăng nhập hoặc đăng ký">
              {(['login', 'register'] as const).map((m) => (
                <Tabs.Trigger
                  key={m}
                  value={m}
                  className="h-9 cursor-pointer rounded-md text-sm font-semibold text-muted transition data-[state=active]:bg-panel-2 data-[state=active]:text-gold-strong data-[state=active]:shadow"
                >
                  {m === 'login' ? 'Đăng nhập' : 'Đăng ký'}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Tabs.Content value="login">
              <LoginForm onSuccess={goNext} />
            </Tabs.Content>
            <Tabs.Content value="register">
              <RegisterForm onSuccess={goNext} />
            </Tabs.Content>
          </Tabs.Root>

          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />
            hoặc
            <span className="h-px flex-1 bg-line" />
          </div>

          <Button variant="ghost" className="w-full border border-line/70" loading={guestLoading} onClick={onGuest}>
            Vào với tư cách Khách
          </Button>
        </div>

        <p className="mt-4 text-center text-xs text-muted/80">
          Đăng nhập bằng UID Genshin để lưu kho nhân vật trên máy chủ và tạo phòng Ban/Pick 1v1.
        </p>
      </div>
      <Toaster />
    </div>
  )
}
