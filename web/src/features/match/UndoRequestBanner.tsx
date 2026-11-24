import { Button } from '@/components/ui/Button'
import { getCharacter } from '@/domain/characters'
import type { MatchSide } from '@/domain/ruleset'
import { cn } from '@/lib/cn'
import type { MatchState } from '@/services'

interface Props {
  state: MatchState
  mySide: MatchSide | null
  isAdmin: boolean
  onRespond: (accept: boolean) => void
  onCancel: () => void
}

export function UndoRequestBanner({ state, mySide, isAdmin, onRespond, onCancel }: Props) {
  const req = state.undoRequest
  if (!req) return null

  const requesterName = state.sides[req.requesterSide].player?.displayName
  const sideLabel = req.requesterSide === 'blue' ? 'Đội Xanh' : 'Đội Đỏ'
  const charName = req.targetCharacterSlug
    ? (getCharacter(req.targetCharacterSlug)?.name ?? req.targetCharacterSlug)
    : 'Bỏ qua'
  const isOpponent = Boolean(mySide && mySide !== req.requesterSide)
  const isRequester = Boolean(mySide && mySide === req.requesterSide)

  return (
    <div
      role="status"
      className={cn(
        'panel flex flex-wrap items-center justify-between gap-3 border-gold/60 bg-gold/10 px-4 py-2.5 text-xs sm:text-sm',
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-text">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[11px] font-extrabold uppercase',
            req.requesterSide === 'blue' ? 'bg-hydro/20 text-hydro' : 'bg-danger/20 text-danger',
          )}
        >
          {sideLabel}
        </span>
        {requesterName && <strong className="text-text">{requesterName}</strong>}
        <span className="text-muted">xin lùi lại lượt</span>
        <strong className="text-gold-strong">
          #{req.targetStepNumber} ({req.targetAction.toUpperCase()} · {charName})
        </strong>
        {req.stepsToRevert > 1 && (
          <span className="text-muted">(lùi {req.stepsToRevert} bước)</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isOpponent && (
          <>
            <Button size="sm" variant="primary" onClick={() => onRespond(true)}>
              Đồng ý lùi
            </Button>
            <Button size="sm" variant="danger" onClick={() => onRespond(false)}>
              Từ chối
            </Button>
          </>
        )}

        {isRequester && (
          <>
            <span className="text-xs font-medium text-gold-strong">Đang chờ đối phương phản hồi…</span>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Hủy yêu cầu
            </Button>
          </>
        )}

        {isAdmin && !isOpponent && !isRequester && (
          <>
            <span className="text-xs text-muted">Đang chờ đối phương phản hồi</span>
            <Button size="sm" variant="primary" onClick={() => onRespond(true)}>
              Admin: Đồng ý
            </Button>
            <Button size="sm" variant="danger" onClick={() => onRespond(false)}>
              Admin: Từ chối
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
