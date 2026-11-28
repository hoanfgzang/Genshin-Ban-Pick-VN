import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createDefaultRuleSetConfig } from '@/domain/ruleset'
import type { MatchState } from '@/services'
import { DraftSlotsBoard } from './DraftSlotsBoard'

function buildBoardState(): MatchState {
  const ruleset = createDefaultRuleSetConfig()
  return {
    code: 'BOARD1',
    status: 'drafting',
    rulesetId: 'rs-1',
    rulesetName: 'Luật test',
    ruleset,
    hostUserId: 'u-blue',
    sides: {
      blue: {
        player: { userId: 'u-blue', uid: '800000001', displayName: 'Player Blue', ownedCount: 20 },
        ready: true,
        ownedCharacters: {},
        bans: [],
        picks: [],
        totalCost: 0,
        costPenaltySeconds: 0,
        weaponRefinementSeconds: 0,
        overtimePenaltySeconds: 10,
        weaponsLocked: false,
        chambers: null,
        chamberDiffs: null,
        chamberTotalSeconds: null,
        finalScore: null,
        scoreSubmitted: false,
      },
      red: {
        player: { userId: 'u-red', uid: '800000002', displayName: 'Player Red', ownedCount: 20 },
        ready: true,
        ownedCharacters: {},
        bans: [],
        picks: [],
        totalCost: 0,
        costPenaltySeconds: 0,
        weaponRefinementSeconds: 0,
        overtimePenaltySeconds: 0,
        weaponsLocked: false,
        chambers: null,
        chamberDiffs: null,
        chamberTotalSeconds: null,
        finalScore: null,
        scoreSubmitted: false,
      },
    },
    currentStepIndex: 0,
    turnDeadlineAt: null,
    winnerSide: null,
    createdAt: '2026-11-24T00:00:00Z',
    finishedAt: null,
  }
}

describe('features/match/DraftSlotsBoard', () => {
  it('đặt bảng Cost/Mốc xuống dưới các ô Pick ở màn hình hẹp và khôi phục sang hai bên ở xl', () => {
    const { container } = render(
      <DraftSlotsBoard state={buildBoardState()} canEditWeaponsForSide={() => false} />,
    )

    const blueStats = container.querySelector('[data-side-stats="blue"]')
    const redStats = container.querySelector('[data-side-stats="red"]')
    const blueSlots = container.querySelector('[data-side-slots="blue"]')
    const redSlots = container.querySelector('[data-side-slots="red"]')

    expect(blueStats).not.toBeNull()
    expect(redStats).not.toBeNull()
    expect(blueSlots).not.toBeNull()
    expect(redSlots).not.toBeNull()

    expect(blueStats?.className).toContain('order-2')
    expect(blueStats?.className).toContain('xl:order-1')
    expect(blueSlots?.className).toContain('order-1')
    expect(blueSlots?.className).toContain('xl:order-2')

    expect(redStats?.className).toContain('order-2')
    expect(redStats?.className).toContain('xl:order-2')
    expect(redSlots?.className).toContain('order-1')
    expect(redSlots?.className).toContain('xl:order-1')
  })

  it('hiển thị level, tổng cost (NV + VK) và thời gian cộng thêm khi ô Pick có vũ khí', () => {
    const state = buildBoardState()
    state.status = 'weapon_phase'
    state.sides.blue.ownedCharacters = {
      furina: { slug: 'furina', constellation: 1, level: 95 },
    }
    state.sides.blue.picks = [
      {
        slot: 0,
        characterSlug: 'furina',
        constellation: 1,
        level: 95,
        characterCost: 2,
        weaponSlug: 'aqua-simulacra',
        refinement: 1,
        weaponCost: 1.5,
        weaponRefinementSeconds: 10,
        totalSlotCost: 3.5,
      },
    ]

    const { container } = render(
      <DraftSlotsBoard state={state} canEditWeaponsForSide={() => false} />,
    )

    const levelBadge = container.querySelector('[data-slot-level]')
    const costBadge = container.querySelector('[data-slot-cost]')
    const extraBadge = container.querySelector('[data-slot-extra]')

    expect(levelBadge?.textContent).toBe('Lv95')
    expect(costBadge?.textContent?.startsWith('3.5')).toBe(true)
    expect(extraBadge?.textContent).toBe('+10s')
  })

  it('hiển thị cost nhân vật và ẩn thời gian cộng thêm khi ô Pick chưa gắn vũ khí', () => {
    const state = buildBoardState()
    state.status = 'weapon_phase'
    state.sides.blue.ownedCharacters = {
      furina: { slug: 'furina', constellation: 1, level: 90 },
    }
    state.sides.blue.picks = [
      {
        slot: 0,
        characterSlug: 'furina',
        constellation: 1,
        level: 90,
        characterCost: 2,
        weaponSlug: null,
        refinement: 1,
        weaponCost: 0,
        weaponRefinementSeconds: 0,
        totalSlotCost: 2,
      },
    ]

    const { container } = render(
      <DraftSlotsBoard state={state} canEditWeaponsForSide={() => false} />,
    )

    const levelBadge = container.querySelector('[data-slot-level]')
    const costBadge = container.querySelector('[data-slot-cost]')
    const extraBadge = container.querySelector('[data-slot-extra]')

    expect(levelBadge?.textContent).toBe('Lv90')
    expect(costBadge?.textContent?.startsWith('2')).toBe(true)
    expect(extraBadge).toBeNull()
  })
})
