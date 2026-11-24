import { describe, expect, it } from 'vitest'
import {
  calcChamberDiff,
  calcCharacterCost,
  calcCostPenaltySeconds,
  calcWeaponCost,
  calcWeaponRefinementSeconds,
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

  it('tính giây cộng thêm theo mốc bậc thang và phép trừ 9:00', () => {
    const { costRules } = createDefaultRuleSetConfig()
    costRules.milestones = [
      { minCost: 0, maxCost: 6, secondsPerCost: 5, bonusSeconds: 0 },
      { minCost: 6, maxCost: 12, secondsPerCost: 8, bonusSeconds: 10 },
    ]
    // 7.5 cost = 6*5 + 10 + 1.5*8 = 52
    expect(calcCostPenaltySeconds(7.5, costRules)).toBe(52)

    expect(calcChamberDiff(8, 30)).toBe(30)
    expect(calcChamberDiff(9, 0)).toBe(0)
    expect(calcChamberDiff(9, 1)).toBeNull()
  })
})
