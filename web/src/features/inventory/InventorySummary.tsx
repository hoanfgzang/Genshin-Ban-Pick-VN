import { CHARACTERS, EFFECTIVE_CHARACTER_COUNT } from '@/domain/characters'
import type { Inventory } from '@/domain/inventory'
import type { User } from '@/services'
import type { SaveState } from './inventoryStore'

interface Props {
  user: User
  inventory: Inventory
  saveState: SaveState
}

export function InventorySummary({ user, inventory, saveState }: Props) {
  const owned = Object.values(inventory.characters)
  const bySlug = new Map(CHARACTERS.map((c) => [c.slug, c]))
  const five = owned.filter((o) => bySlug.get(o.slug)?.rarity === 5).length
  const totalC = owned.reduce((s, o) => s + o.constellation, 0)
  const lv = (n: number) => owned.filter((o) => o.level === n).length
  const pct = EFFECTIVE_CHARACTER_COUNT
    ? Math.min(100, Math.round((owned.length / EFFECTIVE_CHARACTER_COUNT) * 100))
    : 0

  const stats = [
    { label: '5★', value: five },
    { label: '4★', value: owned.length - five },
    { label: 'Tổng cung mệnh', value: totalC },
    { label: 'Lv 90', value: lv(90) },
    { label: 'Lv 95', value: lv(95) },
    { label: 'Lv 100', value: lv(100) },
  ]

  return (
    <section className="panel flex flex-col gap-5 p-5 md:flex-row md:items-center" aria-label="Tổng quan kho">
      <div className="flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-strong to-gold text-2xl font-extrabold text-bg">
          {user.displayName[0]?.toUpperCase() ?? 'U'}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-bold">{user.displayName}</h1>
            {user.role === 'admin' && (
              <span className="rounded bg-gold/20 px-2 py-0.5 text-xs font-bold text-gold-strong">
                Admin
              </span>
            )}
          </div>
          <p className="text-sm text-muted">
            {user.isGuest
              ? 'Chế độ Khách · lưu trên trình duyệt'
              : `UID: ${user.uid}${user.email ? ` · ${user.email}` : ''}`}
          </p>
          <SaveIndicator state={saveState} />
        </div>
      </div>

      <div className="flex-1 md:px-4">
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="text-muted">Đã sở hữu</span>
          <span>
            <strong className="text-lg text-gold-strong">{owned.length}</strong>
            <span className="text-muted"> / {EFFECTIVE_CHARACTER_COUNT}</span>
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-bg" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tỉ lệ sở hữu">
          <div className="h-full rounded-full bg-gradient-to-r from-gold to-gold-strong transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6 md:w-auto">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-bg/50 px-2 py-2 text-center sm:px-3">
            <dt className="text-[11px] leading-tight text-muted">{s.label}</dt>
            <dd className="text-lg font-bold">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { text: string; cls: string } | null> = {
    idle: null,
    saving: { text: 'Đang lưu…', cls: 'text-muted' },
    saved: { text: 'Đã lưu ✓', cls: 'text-success' },
    error: { text: 'Lưu thất bại!', cls: 'text-danger' },
  }
  const v = map[state]
  return (
    <p className={`mt-0.5 h-4 text-xs ${v?.cls ?? ''}`} role="status" aria-live="polite">
      {v?.text}
    </p>
  )
}
