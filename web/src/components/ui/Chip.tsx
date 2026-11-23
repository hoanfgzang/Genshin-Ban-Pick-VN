import { cn } from '@/lib/cn'
import type { ComponentProps } from 'react'

interface ChipProps extends ComponentProps<'button'> {
  active: boolean
}

/** Nút bật/tắt dạng viên thuốc, dùng cho bộ lọc. */
export function Chip({ active, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition',
        active
          ? 'border-gold bg-gold/15 text-gold-strong'
          : 'border-line bg-bg/40 text-muted hover:border-gold/50 hover:text-text',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
