import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import type { MatchSide } from '@/domain/ruleset'
import { cn } from '@/lib/cn'
import type { MatchPlayerInfo, MatchState, SideState, User } from '@/services'
import {
  formatWinReason,
  getLockedCharactersByUser,
  getSeriesWinsForSide,
} from './series'

interface Props {
  state: MatchState
  user: User | null
  isAdmin: boolean
  onChooseNextSide: (side: MatchSide) => void
  onSetReady: (ready: boolean) => void
  onRefreshInventory: () => void
}

export function BetweenGamesPanel({
  state,
  user,
  isAdmin,
  onChooseNextSide,
  onSetReady,
  onRefreshInventory,
}: Props) {
  const setup = state.nextGameSetup
  if (!setup) return null

  const lastGame = state.gameHistory?.[state.gameHistory.length - 1] ?? null
  const blueWins = getSeriesWinsForSide(state, 'blue')
  const redWins = getSeriesWinsForSide(state, 'red')

  const sideByUserId = new Map<string, SideState>()
  for (const sideKey of ['blue', 'red'] as const) {
    const sideObj = state.sides[sideKey]
    if (sideObj.player) {
      sideByUserId.set(sideObj.player.userId, sideObj)
    }
  }

  const findPlayer = (userId: string | null): MatchPlayerInfo | null => {
    if (!userId) return null
    return sideByUserId.get(userId)?.player ?? null
  }

  const pickerPlayer = findPlayer(setup.sidePickerUserId)
  const canPickSide = Boolean(
    !setup.autoSwapped &&
      user &&
      !user.isGuest &&
      (user.id === setup.sidePickerUserId || isAdmin),
  )

  const sidesSelected = Boolean(setup.blueUserId && setup.redUserId)
  const winReasonText = formatWinReason(lastGame?.winReason)

  const renderNextSideCard = (nextSide: MatchSide) => {
    const assignedUserId = nextSide === 'blue' ? setup.blueUserId : setup.redUserId
    if (!assignedUserId) return null

    const sideState = sideByUserId.get(assignedUserId)
    const player = sideState?.player ?? null
    const isBlue = nextSide === 'blue'
    const isMe = Boolean(user && !user.isGuest && user.id === assignedUserId)
    const isReady = setup.readyUserIds.includes(assignedUserId)

    const requiredPicks = state.ruleset.draftSteps.filter(
      (s) => s.side === nextSide && s.action === 'pick',
    ).length
    const lockedMap = getLockedCharactersByUser(
      state.gameHistory,
      assignedUserId,
      setup.gameNumber,
    )
    const availableCount = sideState
      ? Object.keys(sideState.ownedCharacters).filter((slug) => !lockedMap.has(slug)).length
      : 0
    const enoughChars = availableCount >= requiredPicks

    return (
      <div
        className={cn(
          'panel flex flex-col justify-between gap-3 p-4',
          isBlue ? 'border-hydro/45' : 'border-danger/45',
        )}
      >
        <div>
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'text-sm font-extrabold uppercase',
                isBlue ? 'text-hydro' : 'text-danger',
              )}
            >
              {isBlue
                ? `Bên Xanh · Ván ${setup.gameNumber}`
                : `Bên Đỏ · Ván ${setup.gameNumber}`}
            </span>
            <span className="rounded-full bg-panel-2 px-2.5 py-0.5 text-[11px] font-semibold text-muted">
              {isBlue ? 'Ban trước · Pick trước' : 'Ban sau · Pick sau'}
            </span>
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-line bg-bg/50 px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-text">
                {player?.displayName ?? '—'}
              </div>
              <div className="text-xs text-muted">
                Còn <strong className={enoughChars ? 'text-text' : 'text-danger'}>{availableCount}</strong>{' '}
                NV khả dụng (cần tối thiểu {requiredPicks} · đã khóa {lockedMap.size})
              </div>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold',
                isReady ? 'bg-success/15 text-success' : 'bg-panel-2 text-muted',
              )}
            >
              {isReady ? 'Đã sẵn sàng' : 'Chưa sẵn sàng'}
            </span>
          </div>

          {isMe && !enoughChars && (
            <div className="mt-2.5 rounded-lg border border-danger/50 bg-danger/10 p-2.5 text-xs text-danger">
              Bạn chỉ còn {availableCount} nhân vật chưa pick ở các ván trước (cần tối thiểu{' '}
              {requiredPicks}).{' '}
              <Link to="/profile" className="font-bold underline">
                Cập nhật Kho nhân vật
              </Link>{' '}
              rồi bấm Đồng bộ kho.
            </div>
          )}
        </div>

        {isMe && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={isReady ? 'secondary' : 'primary'}
              className="flex-1"
              disabled={!enoughChars && !isReady}
              onClick={() => onSetReady(!isReady)}
            >
              {isReady ? 'Hủy sẵn sàng' : `Sẵn sàng Ván ${setup.gameNumber}`}
            </Button>
            <Button variant="ghost" size="sm" onClick={onRefreshInventory}>
              Đồng bộ kho
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <section
      aria-label="Chuẩn bị ván tiếp theo"
      className="panel flex flex-col gap-4 border-gold/50 bg-gradient-to-b from-gold/10 via-panel to-panel p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 pb-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-gold">
            BO3 · Nghỉ giữa ván
          </div>
          <h2 className="mt-0.5 text-lg font-extrabold text-gold-strong sm:text-xl">
            {lastGame
              ? lastGame.winnerSide === 'draw'
                ? `Ván ${lastGame.gameNumber} kết thúc Hòa!`
                : `Ván ${lastGame.gameNumber}: ${
                    lastGame.winnerSide === 'blue'
                      ? lastGame.blue.player?.displayName ?? 'Đội Xanh'
                      : lastGame.red.player?.displayName ?? 'Đội Đỏ'
                  } thắng!`
              : `Chuẩn bị Ván ${setup.gameNumber}`}
          </h2>
          {winReasonText && <p className="mt-0.5 text-xs text-gold-strong">{winReasonText}</p>}
        </div>

        <div className="rounded-xl border border-gold/40 bg-bg/70 px-4 py-2 text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Tỷ số BO3 hiện tại
          </div>
          <div className="mt-0.5 font-mono text-lg font-black">
            <span className="text-hydro">{blueWins}</span>
            <span className="mx-2 text-muted">-</span>
            <span className="text-danger">{redWins}</span>
          </div>
        </div>
      </div>

      {/* Bước 1: Chọn bên cho ván tiếp theo */}
      {setup.autoSwapped ? (
        <div className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-xs text-text sm:text-sm">
          <strong className="text-gold-strong">Tự động đảo bên (Ván hòa):</strong> Vì Ván{' '}
          {lastGame?.gameNumber ?? setup.gameNumber - 1} kết thúc Hòa, hai bên được tự động đảo
          Xanh ↔ Đỏ cho Ván {setup.gameNumber}. Cả hai hãy bấm <strong>Sẵn sàng</strong> để bắt đầu.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-bg/45 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs sm:text-sm">
              <strong className="text-gold-strong">Bước 1 · Chọn bên cho Ván {setup.gameNumber}:</strong>{' '}
              <span className="text-muted">
                Người thua ván trước (
                <strong className="text-text">{pickerPlayer?.displayName ?? '—'}</strong>) được chọn
                Bên Xanh hoặc Bên Đỏ.
              </span>
            </div>
          </div>

          {canPickSide ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={setup.blueUserId === setup.sidePickerUserId ? 'primary' : 'secondary'}
                onClick={() => onChooseNextSide('blue')}
              >
                Chọn Bên Xanh (Đi trước)
              </Button>
              <Button
                variant={setup.redUserId === setup.sidePickerUserId ? 'danger' : 'secondary'}
                onClick={() => onChooseNextSide('red')}
              >
                Chọn Bên Đỏ (Đi sau)
              </Button>
            </div>
          ) : (
            <div className="text-xs text-muted">
              {sidesSelected
                ? `${pickerPlayer?.displayName ?? 'Người thua'} đã chọn ${
                    setup.blueUserId === setup.sidePickerUserId
                      ? 'Bên Xanh (Đi trước)'
                      : 'Bên Đỏ (Đi sau)'
                  }.`
                : `Đang chờ ${pickerPlayer?.displayName ?? 'người thua ván trước'} chọn bên…`}
            </div>
          )}
        </div>
      )}

      {/* Bước 2: Sẵn sàng Ván tiếp theo */}
      {sidesSelected && (
        <div className="grid gap-4 md:grid-cols-2">
          {renderNextSideCard('blue')}
          {renderNextSideCard('red')}
        </div>
      )}
    </section>
  )
}
