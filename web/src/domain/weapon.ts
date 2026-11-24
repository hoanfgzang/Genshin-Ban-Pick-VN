import type { WeaponType } from './character'

export type WeaponRarity = 4 | 5

export const REFINEMENTS = [1, 2, 3, 4, 5] as const
export type Refinement = (typeof REFINEMENTS)[number]

export interface Weapon {
  id: string
  slug: string
  name: string
  rarity: WeaponRarity
  weaponType: WeaponType
  icon: string
}
