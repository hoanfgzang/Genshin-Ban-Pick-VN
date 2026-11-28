import { fireEvent, render, screen, within } from '@testing-library/react'
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
  it('hiển thị form nhập thời gian và đủ 5 thông số cho cả 2 bên khi người chơi đang thi đấu', () => {
    const state = buildScoringState()
    const onSubmitScores = vi.fn()
    render(
      <MemoryRouter>
        <MatchScoringPhase state={state} mySide="blue" isAdmin={false} onSubmitScores={onSubmitScores} />
      </MemoryRouter>,
    )

    const blueForm = screen.getByRole('region', { name: 'Nhập kết quả 3 phòng đội Xanh' })
    const redForm = screen.getByRole('region', { name: 'Nhập kết quả 3 phòng đội Đỏ' })

    expect(within(blueForm).getByLabelText('Phút phòng 1')).toBeInTheDocument()
    expect(within(blueForm).getByLabelText('Phút phòng 2')).toBeInTheDocument()
    expect(within(blueForm).getByLabelText('Phút phòng 3')).toBeInTheDocument()
    expect(within(blueForm).getByText('Bạn')).toBeInTheDocument()

    expect(within(blueForm).getByText('7.5')).toBeInTheDocument()
    expect(within(blueForm).getByText('NV 6.5 · VK 1')).toBeInTheDocument()
    expect(within(blueForm).getByText('6 → 12')).toBeInTheDocument()
    expect(within(blueForm).getByText('8s/cost + 10s')).toBeInTheDocument()
    expect(within(blueForm).getByText('+75s')).toBeInTheDocument()
    expect(within(blueForm).getByText('+12s')).toBeInTheDocument()
    expect(within(blueForm).getByText('+87s')).toBeInTheDocument()

    expect(within(redForm).getByText('4')).toBeInTheDocument()
    expect(within(redForm).getByText('0 → 6')).toBeInTheDocument()
    expect(within(redForm).getByText('5s/cost')).toBeInTheDocument()
    expect(within(redForm).getByText('0s')).toBeInTheDocument()
    expect(within(redForm).getAllByText('+20s').length).toBeGreaterThanOrEqual(2)

    fireEvent.click(within(blueForm).getByRole('button', { name: 'Xác nhận Đội Xanh' }))
    expect(onSubmitScores).toHaveBeenCalledWith('blue', [
      { minutes: 8, seconds: 0 },
      { minutes: 8, seconds: 0 },
      { minutes: 8, seconds: 0 },
    ])

    fireEvent.click(within(redForm).getByRole('button', { name: 'Xác nhận Đội Đỏ' }))
    expect(onSubmitScores).toHaveBeenCalledWith('red', [
      { minutes: 8, seconds: 0 },
      { minutes: 8, seconds: 0 },
      { minutes: 8, seconds: 0 },
    ])
  })

  it('cho phép Admin không ngồi ghế nhập thời gian cho cả 2 bên', () => {
    const state = buildScoringState()
    const onSubmitScores = vi.fn()
    render(
      <MemoryRouter>
        <MatchScoringPhase state={state} mySide={null} isAdmin onSubmitScores={onSubmitScores} />
      </MemoryRouter>,
    )

    const blueForm = screen.getByRole('region', { name: 'Nhập kết quả 3 phòng đội Xanh' })
    const redForm = screen.getByRole('region', { name: 'Nhập kết quả 3 phòng đội Đỏ' })

    fireEvent.change(within(redForm).getByLabelText('Giây phòng 1'), { target: { value: '30' } })
    fireEvent.click(within(redForm).getByRole('button', { name: 'Xác nhận Đội Đỏ' }))

    expect(onSubmitScores).toHaveBeenCalledWith('red', [
      { minutes: 8, seconds: 30 },
      { minutes: 8, seconds: 0 },
      { minutes: 8, seconds: 0 },
    ])
    expect(within(blueForm).getByRole('button', { name: 'Xác nhận Đội Xanh' })).toBeInTheDocument()
  })

  it('ẩn form nhập điểm đối với khán giả thường', () => {
    const state = buildScoringState()
    render(
      <MemoryRouter>
        <MatchScoringPhase state={state} mySide={null} isAdmin={false} onSubmitScores={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('region', { name: 'Nhập kết quả 3 phòng đội Xanh' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Nhập kết quả 3 phòng đội Đỏ' })).not.toBeInTheDocument()
  })

  it('tính điểm mỗi phòng theo mốc 10:00 và tự khóa giây về 0 khi nhập 10 phút', () => {
    const state = buildScoringState()
    const onSubmitScores = vi.fn()
    render(
      <MemoryRouter>
        <MatchScoringPhase state={state} mySide="blue" isAdmin={false} onSubmitScores={onSubmitScores} />
      </MemoryRouter>,
    )

    const blueForm = screen.getByRole('region', { name: 'Nhập kết quả 3 phòng đội Xanh' })
    expect(within(blueForm).getByText('+360s (3 phòng)')).toBeInTheDocument()

    fireEvent.change(within(blueForm).getByLabelText('Giây phòng 1'), { target: { value: '45' } })
    fireEvent.change(within(blueForm).getByLabelText('Phút phòng 1'), { target: { value: '10' } })
    fireEvent.click(within(blueForm).getByRole('button', { name: 'Xác nhận Đội Xanh' }))

    expect(onSubmitScores).toHaveBeenCalledWith('blue', [
      { minutes: 10, seconds: 0 },
      { minutes: 8, seconds: 0 },
      { minutes: 8, seconds: 0 },
    ])
  })
})
