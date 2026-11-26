import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { buttonClass } from '@/components/ui/buttonStyles'
import { FullPageSpinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/toast'
import { getCharacter } from '@/domain/characters'
import type { MatchSide } from '@/domain/ruleset'
import { useAuthStore } from '@/features/auth/authStore'
import { BetweenGamesPanel } from '@/features/match/BetweenGamesPanel'
import { DraftSlotsBoard } from '@/features/match/DraftSlotsBoard'
import { DraftStage } from '@/features/match/DraftStage'
import { MatchLobbyPhase } from '@/features/match/MatchLobbyPhase'
import { MatchScoreboardHeader } from '@/features/match/MatchScoreboardHeader'
import { MatchScoringPhase } from '@/features/match/MatchScoringPhase'
import { PostDraftTeamsStage } from '@/features/match/PostDraftTeamsStage'
import { PreviousGamesPicksPanel } from '@/features/match/PreviousGamesPicksPanel'
import { getPriorGames } from '@/features/match/series'
import { UndoRequestBanner } from '@/features/match/UndoRequestBanner'
import { useCountdownSeconds, useMatchSocket } from '@/features/match/useMatchSocket'
import { WeaponPickerModal } from '@/features/match/WeaponPickerModal'
import { cn } from '@/lib/cn'
import type { MatchPickSlot } from '@/services'

const STATUS_LABEL: Record<string, string> = {
  lobby: 'Phòng chờ chọn bên',
  drafting: 'Đang Ban / Pick',
  weapon_phase: 'Đội hình & Vũ khí',
  scoring: 'Nhập thời gian 3 ải',
  between_games: 'Nghỉ giữa ván',
  finished: 'Đã kết thúc',
}

export function MatchPage() {
  const { code } = useParams<{ code: string }>()
  const user = useAuthStore((s) => s.user)
  const { state, loading, connected, notFound, sendAction } = useMatchSocket(code)
  const countdown = useCountdownSeconds(state?.turnDeadlineAt ?? null)
  const [weaponTarget, setWeaponTarget] = useState<{ side: MatchSide; slot: number } | null>(
    null,
  )
  const [draftHover, setDraftHover] = useState<{ stepKey: string; slug: string | null } | null>(
    null,
  )

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

  const isAdmin = Boolean(user && !user.isGuest && user.role === 'admin')
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

  const canEditWeaponsForSide = (side: MatchSide): boolean => {
    if (isAdmin) {
      return (
        state.status === 'drafting' ||
        state.status === 'weapon_phase' ||
        state.status === 'scoring'
      )
    }
    return (
      (state.status === 'drafting' || state.status === 'weapon_phase') &&
      mySide === side &&
      !state.sides[side].weaponsLocked
    )
  }

  const canReorderSide = (side: MatchSide): boolean => {
    if (isAdmin) {
      return (
        state.status === 'weapon_phase' ||
        state.status === 'scoring' ||
        state.status === 'finished'
      )
    }
    return (state.status === 'weapon_phase' || state.status === 'scoring') && mySide === side
  }

  const activePick: MatchPickSlot | null = weaponTarget
    ? (state.sides[weaponTarget.side].picks[weaponTarget.slot] ?? null)
    : null
  const weaponModalCharacter = activePick
    ? getCharacter(activePick.characterSlug) ?? null
    : null
  const isBo3 = state.format === 'bo3'
  const currentGame = state.currentGame ?? 1
  const priorGames = getPriorGames(state)
  const currentStepKey = state.status === 'drafting' ? `${currentGame}-${state.currentStepIndex}` : ''
  const effectiveHoverSlug =
    state.status === 'drafting'
      ? draftHover?.stepKey === currentStepKey
        ? draftHover.slug
        : (state.hoverCharacterSlug ?? null)
      : null

  const handleDraftHover = (slug: string | null) => {
    setDraftHover({ stepKey: currentStepKey, slug })
    sendAction({ action: 'draft_hover', characterSlug: slug })
  }

  const handleDraftAction = (slug: string | null) => {
    setDraftHover(null)
    sendAction({ action: 'draft_pick_or_ban', characterSlug: slug })
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        state.status !== 'lobby' && 'match-arena-bg rounded-2xl border border-line/50 p-2.5 sm:p-4',
      )}
    >
      {/* Thanh phòng gọn */}
      <header className="panel flex flex-wrap items-center justify-between gap-3 border-line/70 bg-bg/75 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Phòng</span>
            <span className="rounded-md bg-gold/15 px-2.5 py-0.5 font-mono text-base font-extrabold tracking-widest text-gold-strong">
              {state.code}
            </span>
          </div>
          <Button size="sm" variant="secondary" onClick={copyInviteLink}>
            Sao chép Link mời
          </Button>
          <span className="rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-extrabold text-gold-strong">
            {isBo3 ? `BO3 · Ván ${currentGame}/${state.maxGames ?? 3}` : 'BO1'}
          </span>
          <span className="text-xs text-muted">
            Bộ luật: <strong className="text-text">{state.rulesetName}</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin && (
            <span className="rounded-full border border-gold/50 bg-gold/15 px-2.5 py-0.5 text-[11px] font-bold text-gold-strong">
              Admin
            </span>
          )}
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

      {state.status !== 'lobby' && (
        <>
          <MatchScoreboardHeader state={state} countdown={countdown} />

          {state.status === 'between_games' && (
            <BetweenGamesPanel
              state={state}
              user={user}
              isAdmin={isAdmin}
              onChooseNextSide={(side) => sendAction({ action: 'choose_next_side', side })}
              onSetReady={(ready) => sendAction({ action: 'set_ready', ready })}
              onRefreshInventory={() => sendAction({ action: 'refresh_inventory' })}
            />
          )}

          <DraftSlotsBoard
            state={state}
            countdown={countdown}
            hoverCharacterSlug={effectiveHoverSlug}
            canEditWeaponsForSide={canEditWeaponsForSide}
            onSelectPickSlot={(side, pick) => setWeaponTarget({ side, slot: pick.slot })}
          />

          {(state.status === 'drafting' || state.status === 'weapon_phase') && (
            <UndoRequestBanner
              state={state}
              mySide={mySide}
              isAdmin={isAdmin}
              onRespond={(accept) => sendAction({ action: 'respond_undo', accept })}
              onCancel={() => sendAction({ action: 'cancel_undo_request' })}
            />
          )}

          {state.status === 'drafting' ? (
            <DraftStage
              key={`draft-g${currentGame}`}
              state={state}
              mySide={mySide}
              isAdmin={isAdmin}
              selectedSlug={effectiveHoverSlug}
              onSelectSlug={handleDraftHover}
              onDraftAction={handleDraftAction}
              onSelectPickSlot={(side, pick) => setWeaponTarget({ side, slot: pick.slot })}
              onUndoStep={() => {
                setDraftHover(null)
                sendAction({ action: 'undo_draft_step' })
              }}
              onRequestUndo={() => sendAction({ action: 'request_undo' })}
            />
          ) : (
            <PostDraftTeamsStage
              key={`teams-g${currentGame}`}
              state={state}
              mySide={mySide}
              isAdmin={isAdmin}
              canReorderSide={canReorderSide}
              canEditWeaponsForSide={canEditWeaponsForSide}
              onReorderLineup={(side, order) =>
                sendAction({ action: 'reorder_lineup', side, order })
              }
              onSelectWeaponSlot={(side, pick) => setWeaponTarget({ side, slot: pick.slot })}
              onLockWeapons={() => sendAction({ action: 'lock_weapons' })}
              onUndoStep={() => sendAction({ action: 'undo_draft_step' })}
              onRequestUndo={() => sendAction({ action: 'request_undo' })}
            />
          )}

          {(state.status === 'scoring' ||
            state.status === 'between_games' ||
            state.status === 'finished') && (
            <MatchScoringPhase
              key={`scoring-g${currentGame}-${mySide ?? 'spec'}`}
              state={state}
              mySide={mySide}
              onSubmitScores={(chambers) => sendAction({ action: 'submit_scores', chambers })}
            />
          )}

          {isBo3 && priorGames.length > 0 && <PreviousGamesPicksPanel state={state} />}
        </>
      )}

      <WeaponPickerModal
        key={
          weaponTarget && activePick
            ? `${weaponTarget.side}-${weaponTarget.slot}-${activePick.weaponSlug ?? 'none'}-${activePick.refinement}`
            : 'closed'
        }
        open={Boolean(weaponTarget && activePick)}
        character={weaponModalCharacter}
        pick={activePick}
        costRules={state.ruleset.costRules}
        initialWeaponSlug={activePick?.weaponSlug ?? null}
        initialRefinement={activePick?.refinement ?? 1}
        onSelectCharacterCustomCost={(customCostId) => {
          if (!weaponTarget || !activePick) return
          sendAction({
            action: 'set_character_custom_cost',
            side: weaponTarget.side,
            slot: activePick.slot,
            customCostId,
          })
        }}
        onSelect={(weaponSlug, refinement, weaponCustomCostId) => {
          if (!weaponTarget || !activePick) return
          sendAction({
            action: 'set_weapon',
            side: weaponTarget.side,
            slot: activePick.slot,
            weaponSlug,
            refinement,
            weaponCustomCostId,
          })
        }}
        onClose={() => setWeaponTarget(null)}
      />
    </div>
  )
}
