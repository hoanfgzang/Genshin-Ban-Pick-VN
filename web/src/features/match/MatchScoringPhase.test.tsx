import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultRuleSetConfig } from '@/domain/ruleset'
import type { MatchState } from '@/services'
import { MatchScoringPhase } from './MatchScoringPhase'

function buildScoringState(): MatchState {
  const ruleset = createDefaultRuleSetConfig()
  ruleset.costRules.milestones = [
    { minCost: 0, maxCost: 6, secondsPerCost: 5, bonusSeconds: 0 },
    { minCost: 6, maxCost: 12, secondsPerCost: 8, bonusSeconds: 10 },
    { minCost: 12, maxCost: null, secondsPerCost: 12, bonusSeconds: 0 },
  ]

  return {
    code: 'SCORE1',
    status: 'scoring',
    rulesetId: 'rs-1',
    rulesetName: 'Default Rules',
    ruleset,
    hostUserId: 'u-blue',
    sides: {
      blue: {
        player: { userId: 'u-blue', uid: '800000001', displayName: 'Player Blue', ownedCount: 20 },
        ready: true,
        ownedCharacters: {},
        bans: [],
        picks: [
          {
            slot: 0,
            characterSlug: 'jean',
            constellation: 1,
            level: 90,
            characterCost: 6.5,
            weaponSlug: 'amos-bow',
            refinement: 2,
            weaponCost: 1,
            weaponRefinementSeconds: 5,
            totalSlotCost: 7.5,
          },
        ],
        totalCost: 7.5,
        costPenaltySeconds: 70,
        weaponRefinementSeconds: 5,
        overtimePenaltySeconds: 12,
        weaponsLocked: true,
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
        picks: [
          {
            slot: 0,
            characterSlug: 'bennett',
            constellation: 6,
            level: 90,
            characterCost: 4,
            weaponSlug: null,
            refinement: 1,
            weaponCost: 0,
            weaponRefinementSeconds: 0,
            totalSlotCost: 4,
          },
        ],
        totalCost: 4,
        costPenaltySeconds: 20,
        weaponRefinementSeconds: 0,
        overtimePenaltySeconds: 0,
        weaponsLocked: true,
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

describe('features/match/MatchScoringPhase', () => {
  it('căn ô nhập 3 phòng sang trái cho Blue và hiển thị đủ 5 thông số ở phần dư', () => {
    const state = buildScoringState()
    render(
      <MemoryRouter>
        <MatchScoringPhase state={state} mySide="blue" onSubmitScores={vi.fn()} />
      </MemoryRouter>,
    )

    const formSection = screen.getByRole('region', { name: 'Nhập kết quả 3 phòng' })
    const infoSection = screen.getByRole('region', { name: 'Thông tin Cost và Thời gian' })

    expect(formSection.className).toContain('lg:order-1')
    expect(infoSection.className).toContain('lg:order-2')

    expect(within(formSection).getByLabelText('Phút phòng 1')).toBeInTheDocument()
    expect(within(formSection).getByLabelText('Phút phòng 2')).toBeInTheDocument()
    expect(within(formSection).getByLabelText('Phút phòng 3')).toBeInTheDocument()

    expect(within(infoSection).getByText('Cost')).toBeInTheDocument()
    expect(within(infoSection).getByText('7.5')).toBeInTheDocument()
    expect(within(infoSection).getByText('NV 6.5 · VK 1')).toBeInTheDocument()

    expect(within(infoSection).getByText('Mốc cost hiện tại')).toBeInTheDocument()
    expect(within(infoSection).getByText('6 → 12')).toBeInTheDocument()
    expect(within(infoSection).getByText('8s/cost + 10s')).toBeInTheDocument()

    expect(within(infoSection).getByText('Thời gian cộng thêm')).toBeInTheDocument()
    expect(within(infoSection).getByText('+75s')).toBeInTheDocument()

    expect(within(infoSection).getByText('Thời gian bị phạt')).toBeInTheDocument()
    expect(within(infoSection).getByText('+12s')).toBeInTheDocument()

    expect(within(infoSection).getByText('Tổng thời gian cộng thêm')).toBeInTheDocument()
    expect(within(infoSection).getByText('+87s')).toBeInTheDocument()
  })

  it('căn ô nhập 3 phòng sang phải cho Red và đặt thông tin Cost/Thời gian sang trái', () => {
    const state = buildScoringState()
    render(
      <MemoryRouter>
        <MatchScoringPhase state={state} mySide="red" onSubmitScores={vi.fn()} />
      </MemoryRouter>,
    )

    const formSection = screen.getByRole('region', { name: 'Nhập kết quả 3 phòng' })
    const infoSection = screen.getByRole('region', { name: 'Thông tin Cost và Thời gian' })

    expect(formSection.className).toContain('lg:order-2')
    expect(infoSection.className).toContain('lg:order-1')

    expect(within(infoSection).getByText('4')).toBeInTheDocument()
    expect(within(infoSection).getByText('0 → 6')).toBeInTheDocument()
    expect(within(infoSection).getByText('5s/cost')).toBeInTheDocument()
    expect(within(infoSection).getByText('0s')).toBeInTheDocument()
    expect(within(infoSection).getAllByText('+20s').length).toBeGreaterThanOrEqual(2)
  })
})
