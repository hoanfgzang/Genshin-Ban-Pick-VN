import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import type { MatchSide } from '@/domain/ruleset'
import { cn } from '@/lib/cn'
import type { MatchState, User } from '@/services'

interface Props {
  state: MatchState
  user: User | null
  mySide: MatchSide | null
  onSelectSide: (side: MatchSide | null) => void
  onSetReady: (ready: boolean) => void
  onRefreshInventory: () => void
}

export function MatchLobbyPhase({
  state,
  user,
  mySide,
  onSelectSide,
  onSetReady,
  onRefreshInventory,
}: Props) {
  const canPlay = !!user && !user.isGuest

  const renderSideCard = (side: MatchSide) => {
    const sideState = state.sides[side]
    const player = sideState.player
    const isBlue = side === 'blue'
    const isMine = mySide === side
    const requiredPicks = state.ruleset.draftSteps.filter(
      (s) => s.side === side && s.action === 'pick',
    ).length
    const enoughChars = (player?.ownedCount ?? 0) >= requiredPicks

    return (
      <div
        className={cn(
          'panel flex flex-col justify-between gap-4 p-5',
          isBlue ? 'border-hydro/50' : 'border-danger/50',
        )}
      >
        <div>
          <div className="flex items-center justify-between gap-2">
            <h2 className={cn('text-lg font-extrabold', isBlue ? 'text-hydro' : 'text-danger')}>
              {isBlue ? 'Bên Trái · Đội Xanh Dương' : 'Bên Phải · Đội Đỏ'}
            </h2>
            <span className="rounded-full bg-panel-2 px-2.5 py-0.5 text-xs font-semibold text-muted">
              {isBlue ? 'Ban trước · Pick trước' : 'Ban sau · Pick sau'}
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-line bg-bg/50 p-4">
            {player ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-bold text-text">{player.displayName}</div>
                  <div className="text-xs text-muted">
                    UID {player.uid} · Kho có <strong className="text-text">{player.ownedCount}</strong> nhân vật
                  </div>
                </div>
                <span
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-bold',
                    sideState.ready ? 'bg-success/15 text-success' : 'bg-panel-2 text-muted',
                  )}
                >
                  {sideState.ready ? 'Đã sẵn sàng' : 'Chưa sẵn sàng'}
                </span>
              </div>
            ) : (
              <div className="py-2 text-center text-sm text-muted">Ghế đang trống</div>
            )}
          </div>

          {isMine && !enoughChars && (
            <div className="mt-3 rounded-lg border border-danger/50 bg-danger/10 p-3 text-xs text-danger">
              Kho của bạn hiện có {player?.ownedCount ?? 0} nhân vật, cần tối thiểu {requiredPicks} nhân vật để thi đấu.{' '}
              <Link to="/profile" className="font-bold underline">
                Cập nhật Kho nhân vật
              </Link>
            </div>
          )}

          {state.format === 'bo3' &&
            isMine &&
            enoughChars &&
            (player?.ownedCount ?? 0) < requiredPicks * 3 && (
              <div className="mt-3 rounded-lg border border-gold/40 bg-gold/10 p-3 text-xs text-gold-strong">
                Chế độ BO3 khóa nhân vật bạn đã pick qua từng ván: cần tối thiểu{' '}
                <strong>{requiredPicks * 2}</strong> nhân vật nếu đánh 2 ván, hoặc{' '}
                <strong>{requiredPicks * 3}</strong> nhân vật nếu đánh đủ 3 ván (kho hiện có{' '}
                {player?.ownedCount ?? 0}).
              </div>
            )}
        </div>

        <div className="flex flex-wrap gap-2">
          {!player && canPlay && (
            <Button
              variant={isBlue ? 'primary' : 'danger'}
              className="flex-1"
              onClick={() => onSelectSide(side)}
            >
              {isBlue ? 'Chọn Bên Xanh (Trái)' : 'Chọn Bên Đỏ (Phải)'}
            </Button>
          )}
          {isMine && (
            <>
              <Button
                variant={sideState.ready ? 'secondary' : 'primary'}
                className="flex-1"
                disabled={!enoughChars && !sideState.ready}
                onClick={() => onSetReady(!sideState.ready)}
              >
                {sideState.ready ? 'Hủy sẵn sàng' : 'Sẵn sàng đấu'}
              </Button>
              <Button variant="ghost" size="sm" onClick={onRefreshInventory}>
                Đồng bộ kho
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onSelectSide(null)}>
                Rời ghế
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {state.format === 'bo3' && (
        <div className="panel border-gold/35 bg-gold/10 px-4 py-3 text-xs text-text sm:text-sm">
          <strong className="text-gold-strong">Chế độ BO3 (Thắng 2/3 ván):</strong> Nhân vật mỗi
          người chơi đã pick ở các ván trước sẽ bị khóa không thể pick lại cho chính người đó; người
          thua ván trước được quyền chọn bên cho ván tiếp theo.
        </div>
      )}

      {!canPlay && (
        <div className="panel border-gold/30 bg-gold/5 p-4 text-sm text-text">
          Bạn đang xem phòng với tư cách Khách. Để tham gia chọn bên và thi đấu, vui lòng{' '}
          <Link to="/login" className="font-bold text-gold-strong underline">
            đăng nhập bằng tài khoản Player
          </Link>
          .
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {renderSideCard('blue')}
        {renderSideCard('red')}
      </div>
    </div>
  )
}
