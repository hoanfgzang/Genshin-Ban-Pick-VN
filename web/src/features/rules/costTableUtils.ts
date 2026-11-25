import type { Character, Element, Rarity, WeaponType } from '@/domain/character'
import type { CostRules } from '@/domain/ruleset'
import type { Weapon, WeaponRarity } from '@/domain/weapon'

/** Thứ tự nguyên tố chuẩn khi sắp xếp bảng Cost: Hỏa → Thủy → Lôi → Băng → Thảo → Phong → Nham. */
export const COST_ELEMENT_ORDER = [
  'pyro',
  'hydro',
  'electro',
  'cryo',
  'dendro',
  'anemo',
  'geo',
] as const satisfies readonly Element[]

export type ElementFilterValue = Element | 'none'
export type CharCostSortKey = 'default' | 'name_asc' | 'name_desc' | 'element'
export type WeaponCostSortKey = 'default' | 'name_asc' | 'name_desc' | 'rarity' | 'weaponType'

export function normalizeVi(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
}

export interface CharacterCostFilter {
  query: string
  elements: ElementFilterValue[]
  rarity: Rarity | null
  onlyOverridden: boolean
  onlyCustom: boolean
  sort: CharCostSortKey
}

export function filterAndSortCharacters(
  characters: readonly Character[],
  costRules: CostRules,
  filter: CharacterCostFilter,
): Character[] {
  const q = normalizeVi(filter.query.trim())
  const customMap = costRules.characterCustomCosts ?? {}

  const filtered = characters.filter((c) => {
    if (q && !normalizeVi(c.name).includes(q) && !c.slug.toLowerCase().includes(q)) return false
    if (filter.rarity && c.rarity !== filter.rarity) return false
    if (filter.elements.length > 0) {
      const elKey: ElementFilterValue = c.element ?? 'none'
      if (!filter.elements.includes(elKey)) return false
    }
    const hasCustom = (customMap[c.slug]?.length ?? 0) > 0
    if (filter.onlyCustom && !hasCustom) return false
    if (filter.onlyOverridden && !(c.slug in costRules.characterOverrides) && !hasCustom) {
      return false
    }
    return true
  })

  if (filter.sort === 'default') {
    return filtered
  }

  const elementIndex = (el: Element | null) => {
    if (!el) return COST_ELEMENT_ORDER.length
    const idx = COST_ELEMENT_ORDER.indexOf(el)
    return idx >= 0 ? idx : COST_ELEMENT_ORDER.length
  }

  return [...filtered].sort((a, b) => {
    if (filter.sort === 'name_asc') {
      return a.name.localeCompare(b.name, 'vi')
    }
    if (filter.sort === 'name_desc') {
      return b.name.localeCompare(a.name, 'vi')
    }
    // sort === 'element'
    const diff = elementIndex(a.element) - elementIndex(b.element)
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name, 'vi')
  })
}

export interface WeaponCostFilter {
  query: string
  weaponType: WeaponType | null
  rarity: WeaponRarity | null
  onlyOverridden: boolean
  onlyCustom: boolean
  sort: WeaponCostSortKey
}

export function filterAndSortWeapons(
  weapons: readonly Weapon[],
  costRules: CostRules,
  filter: WeaponCostFilter,
): Weapon[] {
  const q = normalizeVi(filter.query.trim())
  const customMap = costRules.weaponCustomCosts ?? {}

  const filtered = weapons.filter((w) => {
    if (q && !normalizeVi(w.name).includes(q) && !w.slug.toLowerCase().includes(q)) return false
    if (filter.weaponType && w.weaponType !== filter.weaponType) return false
    if (filter.rarity && w.rarity !== filter.rarity) return false
    const hasCustom = (customMap[w.slug]?.length ?? 0) > 0
    const hasOverride =
      w.slug in costRules.weaponCostOverrides ||
      w.slug in costRules.weaponRefinementOverrides ||
      hasCustom
    if (filter.onlyCustom && !hasCustom) return false
    if (filter.onlyOverridden && !hasOverride) return false
    return true
  })

  if (filter.sort === 'default') {
    return filtered
  }

  return [...filtered].sort((a, b) => {
    if (filter.sort === 'name_asc') {
      return a.name.localeCompare(b.name, 'vi')
    }
    if (filter.sort === 'name_desc') {
      return b.name.localeCompare(a.name, 'vi')
    }
    if (filter.sort === 'rarity') {
      return b.rarity - a.rarity || a.name.localeCompare(b.name, 'vi')
    }
    // weaponType
    return a.weaponType.localeCompare(b.weaponType) || b.rarity - a.rarity || a.name.localeCompare(b.name, 'vi')
  })
}
