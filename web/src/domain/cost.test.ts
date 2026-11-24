import { describe, expect, it } from 'vitest'
import {
  calcChamberDiff,
  calcCharacterCost,
  calcCostPenaltySeconds,
  calcWeaponCost,
} from './cost'
import { createDefaultRuleSetConfig } from './ruleset'

describe('domain/cost', () => {
  it('tính cost mặc định và override số lẻ chính xác', () => {
    const { costRules } = createDefaultRuleSetConfig()
    expect(calcCharacterCost('jean', 0, costRules)).toBe(1)
    expect(calcCharacterCost('jean', 3, costRules)).toBe(4)
    expect(calcCharacterCost('bennett', 6, costRules)).toBe(0)

    const withOverride = {
      ...costRules,
      characterOverrides: { bennett: [0, 0, 0, 0, 0, 0.5, 0.5] },
    }
    expect(calcCharacterCost('bennett', 5, withOverride)).toBe(0.5)

    expect(calcWeaponCost('amos-bow', 1, costRules)).toBe(1)
    expect(calcWeaponCost('amos-bow', 5, costRules)).toBe(3)
    expect(calcWeaponCost('favonius-warbow', 5, costRules)).toBe(0)
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
