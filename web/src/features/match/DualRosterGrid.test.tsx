import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { calcCharacterCost } from '@/domain/cost'
import { createDefaultRuleSetConfig } from '@/domain/ruleset'
import type { MatchState } from '@/services'
import { DualRosterGrid } from './DualRosterGrid'

function buildRosterState(stepIndex: number): MatchState {
  const ruleset = createDefaultRuleSetConfig()
  ruleset.draftSteps = [
    { step: 1, side: 'blue', action: 'ban' },
    { step: 2, side: 'red', action: 'ban' },
    { step: 3, side: 'blue', action: 'pick' },
    { step: 4, side: 'red', action: 'pick' },
  ]

  return {
    code: 'ROST01',
    status: 'drafting',
    rulesetId: 'rs-1',
    rulesetName: 'Luật test',
    ruleset,
    hostUserId: 'u-blue',
    sides: {
      blue: {
        player: { userId: 'u-blue', uid: '800000001', displayName: 'Player Blue', ownedCount: 3 },
        ready: true,
        ownedCharacters: {
          bennett: { slug: 'bennett', constellation: 0, level: 90 },
          jean: { slug: 'jean', constellation: 0, level: 90 },
          furina: { slug: 'furina', constellation: 6, level: 90 },
        },
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
      red: {
        player: { userId: 'u-red', uid: '800000002', displayName: 'Player Red', ownedCount: 3 },
        ready: true,
        ownedCharacters: {
          arlecchino: { slug: 'arlecchino', constellation: 2, level: 90 },
          amber: { slug: 'amber', constellation: 0, level: 90 },
          furina: { slug: 'furina', constellation: 0, level: 90 },
        },
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
    currentStepIndex: stepIndex,
    turnDeadlineAt: null,
    winnerSide: null,
    createdAt: '2026-11-24T00:00:00Z',
    finishedAt: null,
  }
}

function getPoolCharacterButtons(pool: HTMLElement) {
  return within(pool)
    .getAllByRole('button')
    .filter((btn) => btn.hasAttribute('title'))
}

describe('features/match/DualRosterGrid', () => {
  it('bỏ chế độ sort Mặc định và mặc định sort theo Cost giảm dần ở cả 2 kho', () => {
    const state = buildRosterState(2)
    const { container } = render(
      <DualRosterGrid state={state} mode="interactive" onSelectCharacter={vi.fn()} />,
    )

    expect(screen.queryByRole('button', { name: 'Mặc định' })).not.toBeInTheDocument()

    const bluePool = container.querySelector('section[data-side="blue"]') as HTMLElement
    const redPool = container.querySelector('section[data-side="red"]') as HTMLElement

    expect(within(bluePool).getByRole('button', { name: /Cost ↓/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(redPool).getByRole('button', { name: /Cost ↓/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const blueNames = getPoolCharacterButtons(bluePool).map(
      (btn) => btn.textContent?.replace(/^[C\dĐK.]+/, '') ?? '',
    )
    const furinaCost = calcCharacterCost('furina', 6, state.ruleset.costRules)
    const jeanCost = calcCharacterCost('jean', 0, state.ruleset.costRules)
    const bennettCost = calcCharacterCost('bennett', 0, state.ruleset.costRules)
    expect(furinaCost).toBeGreaterThan(jeanCost)
    expect(jeanCost).toBeGreaterThan(bennettCost)

    expect(blueNames[0]).toContain('Furina')
    expect(blueNames[1]).toContain('Jean')
    expect(blueNames[2]).toContain('Bennett')
  })

  it('tách riêng tìm kiếm, lọc hệ và sort giữa kho Xanh và kho Đỏ', () => {
    const state = buildRosterState(2)
    const { container } = render(
      <DualRosterGrid state={state} mode="interactive" onSelectCharacter={vi.fn()} />,
    )

    const bluePool = container.querySelector('section[data-side="blue"]') as HTMLElement
    const redPool = container.querySelector('section[data-side="red"]') as HTMLElement

    // Tìm kiếm chỉ trong kho Xanh
    const blueSearch = within(bluePool).getByLabelText('Tìm nhân vật kho Xanh')
    fireEvent.change(blueSearch, { target: { value: 'jean' } })

    expect(getPoolCharacterButtons(bluePool)).toHaveLength(1)
    expect(getPoolCharacterButtons(bluePool)[0]).toHaveAttribute('title', expect.stringContaining('Jean'))
    expect(getPoolCharacterButtons(redPool)).toHaveLength(3)

    // Đổi sort ở kho Đỏ sang Tên ↑ không làm mất sort Cost ↓ ở kho Xanh
    fireEvent.click(within(redPool).getByRole('button', { name: 'Tên' }))
    expect(within(redPool).getByRole('button', { name: /Tên ↑/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(bluePool).getByRole('button', { name: /Cost ↓/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const redNamesAfterSort = getPoolCharacterButtons(redPool).map((b) => b.getAttribute('title') ?? '')
    expect(redNamesAfterSort[0]).toContain('Amber')
    expect(redNamesAfterSort[1]).toContain('Arlecchino')
    expect(redNamesAfterSort[2]).toContain('Furina')

    // Lọc hệ ở kho Đỏ không ảnh hưởng kho Xanh
    const redElementGroup = within(redPool).getByRole('group', { name: 'Lọc theo hệ kho Đỏ' })
    fireEvent.click(within(redElementGroup).getByRole('button', { name: /Thủy/ }))
    expect(getPoolCharacterButtons(redPool)).toHaveLength(1)
    expect(getPoolCharacterButtons(redPool)[0]).toHaveAttribute('title', expect.stringContaining('Furina'))
    expect(getPoolCharacterButtons(bluePool)).toHaveLength(1)

    // Xóa lọc kho Xanh chỉ khôi phục kho Xanh, giữ nguyên bộ lọc của kho Đỏ
    fireEvent.click(within(bluePool).getByRole('button', { name: 'Xóa lọc' }))
    expect(getPoolCharacterButtons(bluePool)).toHaveLength(3)
    expect(getPoolCharacterButtons(redPool)).toHaveLength(1)
  })

  it('khi Đỏ Ban thì kho Xanh sáng lên và kho Đỏ tối đi; khi Xanh Ban thì ngược lại', () => {
    // Step 2 (index 1): red ban -> blue sáng, red tối
    const redBanState = buildRosterState(1)
    const { container, rerender } = render(
      <DualRosterGrid
        state={redBanState}
        mode="interactive"
        selectedSlug="furina"
        onSelectCharacter={vi.fn()}
      />,
    )

    let bluePool = container.querySelector('section[data-side="blue"]') as HTMLElement
    let redPool = container.querySelector('section[data-side="red"]') as HTMLElement

    expect(bluePool).toHaveAttribute('data-pool-state', 'active')
    expect(within(bluePool).getByText('Kho đối thủ — nhắm Ban')).toBeInTheDocument()
    expect(redPool).toHaveAttribute('data-pool-state', 'inactive')
    expect(within(redPool).getByText('Đang Ban kho đối thủ')).toBeInTheDocument()

    // Nhân vật trùng (furina) chỉ highlight ở kho đang sáng
    const blueFurina = getPoolCharacterButtons(bluePool).find((b) =>
      b.getAttribute('title')?.includes('Furina'),
    )
    const redFurina = getPoolCharacterButtons(redPool).find((b) =>
      b.getAttribute('title')?.includes('Furina'),
    )
    expect(blueFurina?.className).toContain('ring-gold-strong')
    expect(redFurina?.className).not.toContain('ring-gold-strong')
    expect(redFurina?.className).toContain('grayscale')
    expect(redFurina?.className).toContain('brightness-75')

    // Step 1 (index 0): blue ban -> red sáng, blue tối
    rerender(
      <DualRosterGrid
        state={buildRosterState(0)}
        mode="interactive"
        selectedSlug="furina"
        onSelectCharacter={vi.fn()}
      />,
    )

    bluePool = container.querySelector('section[data-side="blue"]') as HTMLElement
    redPool = container.querySelector('section[data-side="red"]') as HTMLElement

    expect(redPool).toHaveAttribute('data-pool-state', 'active')
    expect(within(redPool).getByText('Kho đối thủ — nhắm Ban')).toBeInTheDocument()
    expect(bluePool).toHaveAttribute('data-pool-state', 'inactive')
    expect(within(bluePool).getByText('Đang Ban kho đối thủ')).toBeInTheDocument()
    expect(getPoolCharacterButtons(bluePool)[0].className).toContain('grayscale')
    expect(getPoolCharacterButtons(bluePool)[0].className).toContain('brightness-75')
  })

  it('khi Xanh Pick thì kho Xanh sáng và kho Đỏ tối; khi Đỏ Pick thì ngược lại', () => {
    const { container, rerender } = render(
      <DualRosterGrid state={buildRosterState(2)} mode="interactive" onSelectCharacter={vi.fn()} />,
    )

    let bluePool = container.querySelector('section[data-side="blue"]') as HTMLElement
    let redPool = container.querySelector('section[data-side="red"]') as HTMLElement

    expect(bluePool).toHaveAttribute('data-pool-state', 'active')
    expect(within(bluePool).getByText('Chọn Pick từ kho này')).toBeInTheDocument()
    expect(redPool).toHaveAttribute('data-pool-state', 'inactive')
    expect(within(redPool).getByText('Chưa đến lượt')).toBeInTheDocument()
    expect(getPoolCharacterButtons(redPool)[0].className).toContain('grayscale')
    expect(getPoolCharacterButtons(redPool)[0].className).toContain('brightness-75')

    rerender(
      <DualRosterGrid state={buildRosterState(3)} mode="interactive" onSelectCharacter={vi.fn()} />,
    )

    bluePool = container.querySelector('section[data-side="blue"]') as HTMLElement
    redPool = container.querySelector('section[data-side="red"]') as HTMLElement

    expect(redPool).toHaveAttribute('data-pool-state', 'active')
    expect(within(redPool).getByText('Chọn Pick từ kho này')).toBeInTheDocument()
    expect(bluePool).toHaveAttribute('data-pool-state', 'inactive')
    expect(within(bluePool).getByText('Chưa đến lượt')).toBeInTheDocument()
  })

  it('ở chế độ readonly: cả hai kho đều ở trạng thái readonly và không bị làm tối', () => {
    const state = buildRosterState(0)
    const { container } = render(<DualRosterGrid state={state} mode="readonly" />)

    const bluePool = container.querySelector('section[data-side="blue"]') as HTMLElement
    const redPool = container.querySelector('section[data-side="red"]') as HTMLElement

    expect(bluePool).toHaveAttribute('data-pool-state', 'readonly')
    expect(redPool).toHaveAttribute('data-pool-state', 'readonly')
    expect(screen.queryByText('Chưa đến lượt')).not.toBeInTheDocument()
    expect(screen.queryByText('Đang Ban kho đối thủ')).not.toBeInTheDocument()
  })

  it('Nhà Lữ Hành hỏi hệ khi ở Tất cả hệ và tự nhận đúng hệ khi lọc hệ cụ thể', () => {
    const state = buildRosterState(0) // Blue Ban
    state.sides.red.ownedCharacters['traveler-girl'] = {
      slug: 'traveler-girl',
      constellation: 6,
      level: 95,
    }
    const onSelect = vi.fn()
    const onRequestTravelerElement = vi.fn()

    const { container } = render(
      <DualRosterGrid
        state={state}
        mode="interactive"
        onSelectCharacter={onSelect}
        onRequestTravelerElement={onRequestTravelerElement}
      />,
    )

    const redPool = container.querySelector('section[data-side="red"]') as HTMLElement
    // Ở chế độ Tất cả hệ -> bấm vào Nhà Lữ Hành gọi onRequestTravelerElement (hỏi hệ)
    const travelerBtn = getPoolCharacterButtons(redPool).find((b) =>
      b.getAttribute('title')?.includes('Nhà Lữ Hành'),
    )
    expect(travelerBtn).toBeDefined()
    fireEvent.click(travelerBtn!)
    expect(onRequestTravelerElement).toHaveBeenCalledWith('red', false)
    expect(onSelect).not.toHaveBeenCalled()

    // Bấm filter hệ Hỏa -> hiện Nhà Lữ Hành (Hỏa) và bấm vào tự chọn ngay traveler-pyro
    const redElementGroup = within(redPool).getByRole('group', { name: 'Lọc theo hệ kho Đỏ' })
    fireEvent.click(within(redElementGroup).getByRole('button', { name: /Hỏa/ }))
    const pyroTravelerBtn = getPoolCharacterButtons(redPool).find((b) =>
      b.getAttribute('title')?.includes('Nhà Lữ Hành (Hỏa)'),
    )
    expect(pyroTravelerBtn).toBeDefined()
    fireEvent.click(pyroTravelerBtn!)
    expect(onSelect).toHaveBeenCalledWith('traveler-pyro')
  })
})
