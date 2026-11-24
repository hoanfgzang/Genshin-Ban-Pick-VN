import { getCharacter } from '@/domain/characters'
import { formatCost, formatSeconds } from '@/domain/cost'
import type { MatchSide, RuleSetConfig } from '@/domain/ruleset'
import { getWeapon } from '@/domain/weapons'
import { cn } from '@/lib/cn'
import type { MatchPickSlot, SideState } from '@/services'

interface Props {
  side: MatchSide
  sideState: SideState
  ruleset: RuleSetConfig
  isActiveTurn: boolean
  canEditWeapons: boolean
  onSelectWeaponSlot: (pick: MatchPickSlot) => void
}

export function TeamPanel({
  side,
  sideState,
  ruleset,
  isActiveTurn,
  canEditWeapons,
  onSelectWeaponSlot,
}: Props) {
  const isBlue = side === 'blue'
  const banCount = ruleset.draftSteps.filter((s) => s.side === side && s.action === 'ban').length
  const pickCount = ruleset.draftSteps.filter((s) => s.side === side && s.action === 'pick').length

  return (
    <section
      className={cn(
        'panel flex flex-col gap-3 p-3.5 transition',
        isBlue ? 'border-hydro/40' : 'border-danger/40',
        isActiveTurn && (isBlue ? 'ring-2 ring-hydro/70' : 'ring-2 ring-danger/70'),
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-line/70 pb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                isBlue ? 'bg-hydro/20 text-hydro' : 'bg-danger/20 text-danger',
              )}
            >
              {isBlue ? 'Trái · Xanh Dương' : 'Phải · Đỏ'}
            </span>
            {isActiveTurn && (
              <span className="animate-pulse rounded bg-gold/25 px-1.5 py-0.5 text-[10px] font-bold text-gold-strong">
                Đang chọn
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-sm font-bold text-text">
            {sideState.player?.displayName ?? 'Trống'}
          </div>
          {sideState.player && (
            <div className="text-[11px] text-muted">UID {sideState.player.uid}</div>
          )}
        </div>

        <div className="shrink-0 rounded-lg bg-bg/60 px-2.5 py-1.5 text-right">
          <div className="text-[10px] text-muted">Tổng Cost / Điểm Cost</div>
          <div className="text-sm font-extrabold text-gold-strong">
            {formatCost(sideState.totalCost)} · +{formatSeconds(sideState.costPenaltySeconds)}
          </div>
        </div>
      </div>

      {/* Hàng BAN */}
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Đã Ban ({sideState.bans.length}/{banCount})
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: banCount }, (_, idx) => {
            const hasBanEntry = idx < sideState.bans.length
            const slug = sideState.bans[idx]
            const char = slug ? getCharacter(slug) : null
            return (
              <div
                key={idx}
                className={cn(
                  'relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-bg/50',
                  hasBanEntry ? 'border-danger/60' : 'border-dashed border-line/70',
                )}
                title={char ? `Ban: ${char.name}` : hasBanEntry ? 'Bỏ qua Ban' : 'Ô Ban trống'}
              >
                {char ? (
                  <>
                    <img src={char.icon} alt={char.name} className="size-full object-cover opacity-55 grayscale" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-xs font-extrabold text-danger">
                      BAN
                    </span>
                  </>
                ) : (
                  <span className="text-[10px] text-muted">{hasBanEntry ? 'Bỏ qua' : `Ban ${idx + 1}`}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Danh sách PICK + ô điền Vũ khí ngay bên cạnh */}
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Đội hình Pick & Vũ khí ({sideState.picks.length}/{pickCount})
        </div>

        {Array.from({ length: pickCount }, (_, idx) => {
          const pick = sideState.picks[idx]
          if (!pick) {
            return (
              <div
                key={idx}
                className="flex h-14 items-center justify-between rounded-lg border border-dashed border-line/60 bg-bg/30 px-3 text-xs text-muted/60"
              >
                <span>Lượt Pick #{idx + 1}</span>
                <span>Chờ chọn…</span>
              </div>
            )
          }

          const char = getCharacter(pick.characterSlug)
          const weapon = pick.weaponSlug ? getWeapon(pick.weaponSlug) : null

          return (
            <div
              key={pick.slot}
              className="grid grid-cols-[1fr_1fr] items-center gap-2 rounded-lg border border-line bg-bg/60 p-1.5"
            >
              {/* Nhân vật tự động lấy C & Level từ kho */}
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className={cn(
                    'relative size-11 shrink-0 overflow-hidden rounded-md bg-gradient-to-br',
                    char?.rarity === 5 ? 'from-r5-from to-r5-to' : 'from-r4-from to-r4-to',
                  )}
                >
                  {char && <img src={char.icon} alt={char.name} className="size-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-text">
                    {char?.name ?? pick.characterSlug}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px]">
                    <span className="rounded bg-black/60 px-1 py-0.5 font-bold text-gold-strong">
                      C{pick.constellation} · Lv.{pick.level}
                    </span>
                    <span className="text-muted">+{formatCost(pick.characterCost)}</span>
                  </div>
                </div>
              </div>

              {/* Ô Vũ khí ngay bên cạnh */}
              <button
                type="button"
                disabled={!canEditWeapons}
                onClick={() => onSelectWeaponSlot(pick)}
                className={cn(
                  'flex h-11 min-w-0 items-center gap-2 rounded-md border px-2 text-left transition',
                  canEditWeapons
                    ? 'cursor-pointer hover:border-gold'
                    : 'cursor-default',
                  weapon
                    ? 'border-line bg-panel-2/80'
                    : canEditWeapons
                      ? 'border-gold/60 bg-gold/10'
                      : 'border-dashed border-line/60 bg-bg/40',
                )}
              >
                {weapon ? (
                  <>
                    <img
                      src={weapon.icon}
                      alt={weapon.name}
                      className="size-8 shrink-0 rounded bg-bg/60 object-contain"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-semibold text-text">{weapon.name}</div>
                      <div className="text-[10px] text-gold-strong">
                        R{pick.refinement} · +{formatCost(pick.weaponCost)}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full text-center text-[11px] font-medium text-muted">
                    {canEditWeapons ? '+ Chọn vũ khí' : 'Chưa gắn vũ khí'}
                  </div>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
