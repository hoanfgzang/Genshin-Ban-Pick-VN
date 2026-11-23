import { cn } from '@/lib/cn'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: string
  title?: string
}

interface SegmentedProps<T extends string | number> {
  value: T | null
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
  label: string
  disabled?: boolean
  className?: string
  size?: 'sm' | 'md'
}

/** Nhóm nút chọn một (radiogroup), dùng cho C0–C6, Level, chế độ… */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
  className,
  size = 'md',
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-lg border border-line bg-bg/60 p-1', className)}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.title}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex-1 cursor-pointer rounded-md font-medium whitespace-nowrap transition',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3 text-sm',
              active
                ? 'bg-gradient-to-b from-gold-strong to-gold text-bg shadow'
                : 'text-muted hover:bg-panel-2 hover:text-text',
              'disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
