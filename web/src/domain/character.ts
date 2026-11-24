export const ELEMENTS = ['pyro', 'hydro', 'anemo', 'electro', 'dendro', 'cryo', 'geo'] as const
export type Element = (typeof ELEMENTS)[number]

export const WEAPONS = ['sword', 'claymore', 'polearm', 'bow', 'catalyst'] as const
export type WeaponType = (typeof WEAPONS)[number]

export type Rarity = 4 | 5

export interface Character {
  id: string
  slug: string
  name: string
  rarity: Rarity
  /** null với Nhà Lữ Hành / Manekin (đổi nguyên tố được) */
  element: Element | null
  weapon: WeaponType
  region: string | null
  release: string | null
  icon: string
  card?: string | null
}

export const ELEMENT_LABEL: Record<Element, string> = {
  pyro: 'Hỏa',
  hydro: 'Thủy',
  anemo: 'Phong',
  electro: 'Lôi',
  dendro: 'Thảo',
  cryo: 'Băng',
  geo: 'Nham',
}

export const WEAPON_LABEL: Record<WeaponType, string> = {
  sword: 'Kiếm Đơn',
  claymore: 'Trọng Kiếm',
  polearm: 'Vũ Khí Cán Dài',
  bow: 'Cung',
  catalyst: 'Pháp Khí',
}
