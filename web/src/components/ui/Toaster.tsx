import { cn } from '@/lib/cn'
import { useToastStore, type ToastKind } from './toast'

const STYLE: Record<ToastKind, string> = {
  success: 'border-success/50 text-success',
  error: 'border-danger/50 text-danger',
  info: 'border-gold/50 text-gold-strong',
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={cn('panel pointer-events-auto flex items-start gap-3 px-4 py-3 text-sm', STYLE[t.kind])}
        >
          <span className="flex-1 text-text">{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="cursor-pointer text-muted hover:text-text"
            aria-label="Đóng thông báo"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
