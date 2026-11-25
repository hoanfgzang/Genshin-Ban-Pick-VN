import { describe, expect, it } from 'vitest'
import { CHARACTERS } from '@/domain/characters'
import { createDefaultRuleSetConfig } from '@/domain/ruleset'
import { WEAPONS_LIST } from '@/domain/weapons'
import {
  exportCharacterCostCsv,
  exportWeaponCostCsv,
  parseCharacterCostCsv,
  parseWeaponCostCsv,
} from './costCsv'

describe('features/rules/costCsv', () => {
  it('xuất và nhập CSV nhân vật gồm cả override và Custom Cost kèm ghi chú', () => {
    const { costRules } = createDefaultRuleSetConfig()
    const initialRules = {
      ...costRules,
      characterOverrides: {
        bennett: [0, 0, 0, 0, 0, 0.5, 1],
      },
      characterCustomCosts: {
        bennett: [
          {
            id: 'cc-1',
            costs: [0.5, 0.5, 0.5, 0.5, 0.5, 1, 1.5],
            note: 'Đi cùng Mavuika Melt',
          },
        ],
      },
    }

    const csv = exportCharacterCostCsv(CHARACTERS.slice(0, 15), initialRules)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('slug,name,rarity,element,type,c0,c1,c2,c3,c4,c5,c6,note')

    const parsed = parseCharacterCostCsv(csv, createDefaultRuleSetConfig().costRules)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    // Bảng gốc trùng mặc định không tạo override thừa, chỉ giữ lại bennett nếu bennett có trong slice hoặc tự test
    const bennettOnlyCsv = exportCharacterCostCsv(
      CHARACTERS.filter((c) => c.slug === 'bennett' || c.slug === 'jean'),
      initialRules,
    )
    const parsedSubset = parseCharacterCostCsv(bennettOnlyCsv, createDefaultRuleSetConfig().costRules)
    expect(parsedSubset.ok).toBe(true)
    if (!parsedSubset.ok) return
    expect(parsedSubset.nextOverrides.bennett).toEqual([0, 0, 0, 0, 0, 0.5, 1])
    expect(parsedSubset.nextOverrides.jean).toBeUndefined()
    expect(parsedSubset.nextCustomCosts.bennett).toEqual([
      {
        id: 'cc-1',
        costs: [0.5, 0.5, 0.5, 0.5, 0.5, 1, 1.5],
        note: 'Đi cùng Mavuika Melt',
      },
    ])
    expect(parsedSubset.stats.customEntries).toBe(1)
  })

  it('hỗ trợ dấu chấm phẩy từ Excel VN, khớp theo tên và báo lỗi khi thiếu ghi chú custom', () => {
    const { costRules } = createDefaultRuleSetConfig()
    const semicolonCsv = [
      'slug;name;type;c0;c1;c2;c3;c4;c5;c6;note',
      ';Bennett;base;0;0;0;0;0;0,5;0,5;',
      'bennett;Bennett;custom;1;1;1;1;1;1,5;2;Team Pyro',
      'unknown-slug;Nhân vật lạ;base;0;0;0;0;0;0;0;',
    ].join('\n')

    const parsed = parseCharacterCostCsv(semicolonCsv, costRules)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.nextOverrides.bennett).toEqual([0, 0, 0, 0, 0, 0.5, 0.5])
    expect(parsed.nextCustomCosts.bennett?.[0]?.costs).toEqual([1, 1, 1, 1, 1, 1.5, 2])
    expect(parsed.nextCustomCosts.bennett?.[0]?.note).toBe('Team Pyro')
    expect(parsed.stats.unknownRows).toEqual(['unknown-slug'])

    const missingNoteCsv = [
      'slug,type,c0,c1,c2,c3,c4,c5,c6,note',
      'bennett,custom,1,1,1,1,1,1,1,',
    ].join('\n')
    const errRes = parseCharacterCostCsv(missingNoteCsv, costRules)
    expect(errRes.ok).toBe(false)
  })

  it('xuất và nhập CSV vũ khí gồm cả Cost, R1–R5 và Custom Cost', () => {
    const { costRules } = createDefaultRuleSetConfig()
    const withWeaponCustom = {
      ...costRules,
      weaponCostOverrides: { 'favonius-warbow': 0.5 },
      weaponRefinementOverrides: { 'amos-bow': [0, 10, 20, 30, 40] },
      weaponCustomCosts: {
        'favonius-warbow': [
          {
            id: 'wc-1',
            cost: 1,
            refinementSeconds: [0, 2, 4, 6, 8],
            note: 'Cầm cho Yelan',
          },
        ],
      },
    }

    const subset = WEAPONS_LIST.filter(
      (w) => w.slug === 'favonius-warbow' || w.slug === 'amos-bow',
    )
    const csv = exportWeaponCostCsv(subset, withWeaponCustom)
    expect(csv.startsWith('\uFEFF')).toBe(true)

    const parsed = parseWeaponCostCsv(csv, createDefaultRuleSetConfig().costRules)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.nextCostOverrides['favonius-warbow']).toBe(0.5)
    expect(parsed.nextRefOverrides['amos-bow']).toEqual([0, 10, 20, 30, 40])
    expect(parsed.nextCustomCosts['favonius-warbow']).toEqual([
      {
        id: 'wc-1',
        cost: 1,
        refinementSeconds: [0, 2, 4, 6, 8],
        note: 'Cầm cho Yelan',
      },
    ])
  })
})
