import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { buttonClass } from '@/components/ui/buttonStyles'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/toast'
import { getCharacter } from '@/domain/characters'
import type { MatchSide } from '@/domain/ruleset'
import { useAuthStore } from '@/features/auth/authStore'
import { DraftCenterPool } from '@/features/match/DraftCenterPool'
import { MatchLobbyPhase } from '@/features/match/MatchLobbyPhase'
import { MatchScoringPhase } from '@/features/match/MatchScoringPhase'
import { TeamPanel } from '@/features/match/TeamPanel'
import { useCountdownSeconds, useMatchSocket } from '@/features/match/useMatchSocket'
import { WeaponPickerModal } from '@/features/match/WeaponPickerModal'
import { cn } from '@/lib/cn'
import type { MatchPickSlot } from '@/services'

const STATUS_LABEL: Record<string, string> = {
  lobby: 'Phòng chờ chọn bên',
  drafting: 'Đang Ban / Pick',
  weapon_phase: 'Khoảng trống điền Vũ khí',
  scoring: 'Nhập thời gian 3 ải',
  finished: 'Đã kết thúc',
}

export function MatchPage() {
  const { code } = useParams<{ code: string }>()
  const user = useAuthStore((s) => s.user)
  const { state, loading, connected, notFound, sendAction } = useMatchSocket(code)
  const countdown = useCountdownSeconds(state?.turnDeadlineAt ?? null)
  const [weaponSlot, setWeaponSlot] = useState<MatchPickSlot | null>(null)

  if (loading) return <FullPageSpinner label="Đang kết nối phòng đấu…" />

  if (notFound || !state) {
    return (
      <div className="panel mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-bold text-danger">Không tìm thấy phòng đấu</h1>
        <p className="mt-2 text-sm text-muted">Mã phòng "{code}" không tồn tại hoặc đã bị xóa.</p>
        <Link to="/lobby" className={buttonClass('primary', 'md', 'mt-5')}>
          Quay lại Tạo trận
        </Link>
      </div>
    )
  }

  let mySide: MatchSide | null = null
  if (user && !user.isGuest) {
    if (state.sides.blue.player?.userId === user.id) mySide = 'blue'
    else if (state.sides.red.player?.userId === user.id) mySide = 'red'
  }

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success(`Đã sao chép link mời phòng ${state.code}`)
    } catch {
      toast.info(`Mã phòng của bạn: ${state.code}`)
    }
  }

  const activeDraftStep =
    state.status === 'drafting' ? state.ruleset.draftSteps[state.currentStepIndex] ?? null : null
  const weaponModalCharacter = weaponSlot ? getCharacter(weaponSlot.characterSlug) ?? null : null

  return (
    <div className="flex flex-col gap-4">
      {/* Header phòng đấu */}
      <header className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Phòng</span>
            <span className="rounded-md bg-gold/15 px-2.5 py-1 font-mono text-base font-extrabold tracking-widest text-gold-strong">
              {state.code}
            </span>
          </div>
          <Button size="sm" variant="secondary" onClick={copyInviteLink}>
            Sao chép Link mời
          </Button>
          <span className="text-xs text-muted">
            Bộ luật: <strong className="text-text">{state.rulesetName}</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-full bg-panel-2 px-3 py-1 text-xs font-semibold text-gold-strong">
            {STATUS_LABEL[state.status] ?? state.status}
          </span>
          <span
            className={cn(
              'flex items-center gap-1.5 text-xs',
              connected ? 'text-success' : 'text-danger',
            )}
          >
            <span className={cn('size-2 rounded-full', connected ? 'bg-success' : 'bg-danger')} />
            {connected ? 'Realtime' : 'Đang kết nối lại…'}
          </span>
        </div>
      </header>

      {state.status === 'lobby' && (
        <MatchLobbyPhase
          state={state}
          user={user}
          mySide={mySide}
          onSelectSide={(side) => sendAction({ action: 'select_side', side })}
          onSetReady={(ready) => sendAction({ action: 'set_ready', ready })}
          onRefreshInventory={() => sendAction({ action: 'refresh_inventory' })}
        />
      )}

      {(state.status === 'drafting' || state.status === 'weapon_phase') && (
        <>
          {/* Thanh tiến trình các bước Ban/Pick */}
          <div className="panel flex items-center gap-1.5 overflow-x-auto px-3 py-2">
            {state.ruleset.draftSteps.map((s, idx) => {
              const isDone = state.status === 'weapon_phase' || idx < state.currentStepIndex
              const isCurrent = state.status === 'drafting' && idx === state.currentStepIndex
              return (
                <div
                  key={s.step}
                  className={cn(
                    'flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition',
                    isCurrent
                      ? 'bg-gold text-bg ring-2 ring-gold-strong'
                      : isDone
                        ? 'bg-panel-2/60 text-muted opacity-60'
                        : s.side === 'blue'
                          ? 'border border-hydro/40 bg-hydro/10 text-hydro'
                          : 'border border-danger/40 bg-danger/10 text-danger',
                  )}
                >
                  <span>{s.side === 'blue' ? 'X' : 'Đ'}</span>
                  <span className="uppercase">{s.action}</span>
                </div>
              )
            })}
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[340px_1fr_340px]">
            <TeamPanel
              side="blue"
              sideState={state.sides.blue}
              ruleset={state.ruleset}
              isActiveTurn={activeDraftStep?.side === 'blue'}
              canEditWeapons={mySide === 'blue' && !state.sides.blue.weaponsLocked}
              onSelectWeaponSlot={(pick) => setWeaponSlot(pick)}
            />

            <DraftCenterPool
              state={state}
              mySide={mySide}
              countdown={countdown}
              onDraftAction={(characterSlug) =>
                sendAction({ action: 'draft_pick_or_ban', characterSlug })
              }
              onLockWeapons={() => sendAction({ action: 'lock_weapons' })}
            />

            <TeamPanel
              side="red"
              sideState={state.sides.red}
              ruleset={state.ruleset}
              isActiveTurn={activeDraftStep?.side === 'red'}
              canEditWeapons={mySide === 'red' && !state.sides.red.weaponsLocked}
              onSelectWeaponSlot={(pick) => setWeaponSlot(pick)}
            />
          </div>
        </>
      )}

      {(state.status === 'scoring' || state.status === 'finished') && (
        <MatchScoringPhase
          state={state}
          mySide={mySide}
          onSubmitScores={(chambers) => sendAction({ action: 'submit_scores', chambers })}
        />
      )}

      <WeaponPickerModal
        key={weaponSlot ? `${weaponSlot.slot}-${weaponSlot.weaponSlug ?? 'none'}` : 'closed'}
        open={!!weaponSlot}
        character={weaponModalCharacter}
        costRules={state.ruleset.costRules}
        initialWeaponSlug={weaponSlot?.weaponSlug ?? null}
        initialRefinement={weaponSlot?.refinement ?? 1}
        onSelect={(weaponSlug, refinement) => {
          if (!weaponSlot) return
          sendAction({
            action: 'set_weapon',
            slot: weaponSlot.slot,
            weaponSlug,
            refinement,
          })
        }}
        onClose={() => setWeaponSlot(null)}
      />
    </div>
  )
}
