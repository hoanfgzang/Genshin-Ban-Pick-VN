import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-gold-strong to-gold text-bg font-semibold shadow-md shadow-gold/10 hover:brightness-110',
  secondary: 'border border-line bg-panel-2 text-text hover:border-gold/60 hover:bg-panel-2/80',
  ghost: 'text-muted hover:bg-panel-2 hover:text-text',
  danger: 'border border-danger/50 bg-danger/10 text-danger hover:bg-danger/20',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

/** Class của nút — dùng được cho cả <button> và <Link>. */
export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex cursor-pointer items-center justify-center rounded-lg transition select-none',
    'disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  )
}
