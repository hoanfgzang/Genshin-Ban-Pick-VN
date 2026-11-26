import { describe, expect, it } from 'vitest'
import {
  calcChamberDiff,
  calcCharacterCost,
  calcCostPenaltySeconds,
  calcWeaponCost,
  calcWeaponRefinementSeconds,
  findActiveCostMilestone,
  formatCostMilestoneSummary,
} from './cost'
import { createDefaultRuleSetConfig } from './ruleset'
import { getWeapon, WEAPONS_LIST } from './weapons'

describe('domain/cost', () => {
  it('tính cost mặc định, thời gian tinh luyện và override chính xác', () => {
    const { costRules } = createDefaultRuleSetConfig()
    expect(calcCharacterCost('jean', 0, costRules)).toBe(1)
    expect(calcCharacterCost('jean', 3, costRules)).toBe(4)
    expect(calcCharacterCost('bennett', 6, costRules)).toBe(0)

    const withOverride = {
      ...costRules,
      characterOverrides: { bennett: [0, 0, 0, 0, 0, 0.5, 0.5] },
      weaponCostOverrides: { 'favonius-warbow': 0.5 },
      weaponRefinementOverrides: { 'amos-bow': [0, 10, 20, 30, 40] },
    }
    expect(calcCharacterCost('bennett', 5, withOverride)).toBe(0.5)

    // Vũ khí: 5★ = 1 cost (cố định mọi tinh luyện), 4★ = 0 cost
    expect(calcWeaponCost('amos-bow', costRules)).toBe(1)
    expect(calcWeaponCost('favonius-warbow', costRules)).toBe(0)
    expect(calcWeaponCost('favonius-warbow', withOverride)).toBe(0.5)

    // Tinh luyện cộng trực tiếp thời gian (giây): mặc định 5★ +5s/bậc, 4★ = 0s
    expect([1, 2, 3, 4, 5].map((r) => calcWeaponRefinementSeconds('amos-bow', r, costRules))).toEqual([
      0, 5, 10, 15, 20,
    ])
    expect(
      [1, 2, 3, 4, 5].map((r) => calcWeaponRefinementSeconds('favonius-warbow', r, costRules)),
    ).toEqual([0, 0, 0, 0, 0])
    expect(calcWeaponRefinementSeconds('amos-bow', 3, withOverride)).toBe(20)
  })

  it('danh sách vũ khí chỉ gồm vũ khí chính thức 4★–5★ (đã bỏ skin và 3★)', () => {
    expect(WEAPONS_LIST.length).toBeGreaterThan(0)
    expect(
      WEAPONS_LIST.every((w) => (w.rarity === 4 || w.rarity === 5) && Number(w.id) < 300000),
    ).toBe(true)
    expect(getWeapon('serpent-devourer-sublimation')).toBeUndefined()
    expect(getWeapon('cool-steel')).toBeUndefined()
  })

  it('nhân tổng cost theo mốc hiện tại và phép trừ 9:00', () => {
    const { costRules } = createDefaultRuleSetConfig()
    costRules.baseSecondsPerCost = 5
    costRules.milestones = [
      { minCost: 0, maxCost: 6, secondsPerCost: 5, bonusSeconds: 0 },
      { minCost: 6, maxCost: 12, secondsPerCost: 8, bonusSeconds: 10 },
      { minCost: 12, maxCost: null, secondsPerCost: 12, bonusSeconds: 20 },
    ]
    expect(calcCostPenaltySeconds(0, costRules)).toBe(0)
    expect(calcCostPenaltySeconds(4.5, costRules)).toBe(22.5)
    // Chạm đúng mốc 6 => 6 * 8 + 10 = 58
    expect(calcCostPenaltySeconds(6, costRules)).toBe(58)
    // 7.5 cost => 7.5 * 8 + 10 = 70
    expect(calcCostPenaltySeconds(7.5, costRules)).toBe(70)
    // Chạm đúng mốc 12 => 12 * 12 + 20 = 164
    expect(calcCostPenaltySeconds(12, costRules)).toBe(164)
    expect(calcCostPenaltySeconds(13, costRules)).toBe(176)

    // Không có mốc => dùng baseSecondsPerCost
    expect(calcCostPenaltySeconds(6, { ...costRules, milestones: [] })).toBe(30)

    // Dưới minCost đầu tiên, chạm đúng maxCost hữu hạn và vượt maxCost hữu hạn
    const boundedRules = {
      ...costRules,
      baseSecondsPerCost: 4,
      milestones: [{ minCost: 6, maxCost: 12, secondsPerCost: 8, bonusSeconds: 10 }],
    }
    expect(calcCostPenaltySeconds(4, boundedRules)).toBe(16)
    expect(calcCostPenaltySeconds(12, boundedRules)).toBe(106)
    expect(calcCostPenaltySeconds(14, boundedRules)).toBe(56)

    expect(calcChamberDiff(8, 30)).toBe(30)
    expect(calcChamberDiff(9, 0)).toBe(0)
    expect(calcChamberDiff(9, 1)).toBeNull()
  })

  it('tính chính xác Custom Cost nhân vật và vũ khí theo customCostId', () => {
    const { costRules } = createDefaultRuleSetConfig()
    const withCustom = {
      ...costRules,
      characterCustomCosts: {
        bennett: [
          {
            id: 'cc-1',
            costs: [0.5, 0.5, 0.5, 0.5, 0.5, 1, 1.5],
            note: 'Đi cùng Mavuika',
          },
        ],
      },
      weaponCustomCosts: {
        'favonius-warbow': [
          {
            id: 'wc-1',
            cost: 0.5,
            refinementSeconds: [0, 2, 4, 6, 8],
            note: 'Cầm cho Yelan',
          },
        ],
      },
    }

    expect(calcCharacterCost('bennett', 6, withCustom)).toBe(0)
    expect(calcCharacterCost('bennett', 6, withCustom, 'cc-1')).toBe(1.5)
    expect(calcCharacterCost('bennett', 6, withCustom, 'missing')).toBe(0)

    expect(calcWeaponCost('favonius-warbow', withCustom)).toBe(0)
    expect(calcWeaponCost('favonius-warbow', withCustom, 'wc-1')).toBe(0.5)
    expect(calcWeaponRefinementSeconds('favonius-warbow', 4, withCustom)).toBe(0)
    expect(calcWeaponRefinementSeconds('favonius-warbow', 4, withCustom, 'wc-1')).toBe(6)
  })

  it('xác định mốc cost hiện tại và tóm tắt mốc chính xác', () => {
    const { costRules } = createDefaultRuleSetConfig()
    costRules.milestones = [
      { minCost: 0, maxCost: 6, secondsPerCost: 5, bonusSeconds: 0 },
      { minCost: 6, maxCost: 12, secondsPerCost: 8, bonusSeconds: 10 },
      { minCost: 12, maxCost: null, secondsPerCost: 12, bonusSeconds: 0 },
    ]

    expect(findActiveCostMilestone(0, costRules)?.minCost).toBe(0)
    expect(findActiveCostMilestone(6, costRules)?.minCost).toBe(6)
    expect(findActiveCostMilestone(12, costRules)?.maxCost).toBeNull()

    expect(formatCostMilestoneSummary(0, costRules)).toEqual({
      rangeLabel: '0 cost',
      rateLabel: 'Chưa phát sinh phạt',
    })
    expect(formatCostMilestoneSummary(7.5, costRules)).toEqual({
      rangeLabel: '6 → 12',
      rateLabel: '8s/cost + 10s',
    })
    expect(formatCostMilestoneSummary(14, costRules)).toEqual({
      rangeLabel: '12 → ∞',
      rateLabel: '12s/cost',
    })

    const noMilestoneRules = { ...costRules, baseSecondsPerCost: 4.5, milestones: [] }
    expect(findActiveCostMilestone(5, noMilestoneRules)).toBeNull()
    expect(formatCostMilestoneSummary(5, noMilestoneRules)).toEqual({
      rangeLabel: 'Hệ số cơ bản',
      rateLabel: '4.5s/cost',
    })
  })
})
