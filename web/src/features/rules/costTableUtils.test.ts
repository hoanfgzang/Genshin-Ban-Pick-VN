import { describe, expect, it } from 'vitest'
import { CHARACTERS } from '@/domain/characters'
import { createDefaultRuleSetConfig } from '@/domain/ruleset'
import { WEAPONS_LIST } from '@/domain/weapons'
import {
  COST_ELEMENT_ORDER,
  filterAndSortCharacters,
  filterAndSortWeapons,
} from './costTableUtils'

describe('features/rules/costTableUtils', () => {
  it('lọc theo hệ (đơn hệ, đa hệ, Khác) và tìm kiếm tiếng Việt không dấu', () => {
    const { costRules } = createDefaultRuleSetConfig()

    const pyroAndHydro = filterAndSortCharacters(CHARACTERS, costRules, {
      query: '',
      elements: ['pyro', 'hydro'],
      rarity: null,
      onlyOverridden: false,
      onlyCustom: false,
      sort: 'default',
    })
    expect(pyroAndHydro.length).toBeGreaterThan(0)
    expect(pyroAndHydro.every((c) => c.element === 'pyro' || c.element === 'hydro')).toBe(true)

    const multiElement = filterAndSortCharacters(CHARACTERS, costRules, {
      query: 'nha lu hanh',
      elements: ['none'],
      rarity: null,
      onlyOverridden: false,
      onlyCustom: false,
      sort: 'name_asc',
    })
    expect(multiElement.length).toBeGreaterThanOrEqual(2)
    expect(multiElement.every((c) => c.element === null)).toBe(true)
  })

  it('sắp xếp theo hệ đúng thứ tự Hỏa -> Thủy -> Lôi -> Băng -> Thảo -> Phong -> Nham -> Khác', () => {
    const { costRules } = createDefaultRuleSetConfig()
    const sorted = filterAndSortCharacters(CHARACTERS, costRules, {
      query: '',
      elements: [],
      rarity: null,
      onlyOverridden: false,
      onlyCustom: false,
      sort: 'element',
    })

    const rank = (el: (typeof sorted)[number]['element']) =>
      el === null ? COST_ELEMENT_ORDER.length : COST_ELEMENT_ORDER.indexOf(el)

    for (let i = 1; i < sorted.length; i += 1) {
      const prevRank = rank(sorted[i - 1].element)
      const currRank = rank(sorted[i].element)
      expect(currRank).toBeGreaterThanOrEqual(prevRank)
      if (currRank === prevRank) {
        expect(sorted[i - 1].name.localeCompare(sorted[i].name, 'vi')).toBeLessThanOrEqual(0)
      }
    }

    const firstByElement = sorted[0].element
    const lastByElement = sorted[sorted.length - 1].element
    expect(firstByElement).toBe('pyro')
    expect(lastByElement).toBeNull()
  })

  it('sắp xếp theo tên và lọc vũ khí có Custom Cost', () => {
    const { costRules } = createDefaultRuleSetConfig()
    const customRules = {
      ...costRules,
      weaponCustomCosts: {
        'favonius-warbow': [
          { id: 'wc-1', cost: 0.5, refinementSeconds: [0, 0, 0, 0, 0], note: 'Test' },
        ],
      },
    }

    const byName = filterAndSortWeapons(WEAPONS_LIST, customRules, {
      query: '',
      weaponType: null,
      rarity: null,
      onlyOverridden: false,
      onlyCustom: false,
      sort: 'name_asc',
    })
    for (let i = 1; i < byName.length; i += 1) {
      expect(byName[i - 1].name.localeCompare(byName[i].name, 'vi')).toBeLessThanOrEqual(0)
    }

    const onlyCustom = filterAndSortWeapons(WEAPONS_LIST, customRules, {
      query: '',
      weaponType: null,
      rarity: null,
      onlyOverridden: false,
      onlyCustom: true,
      sort: 'default',
    })
    expect(onlyCustom.map((w) => w.slug)).toEqual(['favonius-warbow'])
  })
})
