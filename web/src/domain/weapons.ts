import raw from '@/data/weapons.json'
import type { WeaponType } from './character'
import type { Weapon } from './weapon'

/** Danh sách vũ khí tĩnh, sinh bởi `assets/dataminer_weapons.py`. */
export const WEAPONS_LIST: readonly Weapon[] = raw as Weapon[]

export const WEAPON_BY_SLUG: ReadonlyMap<string, Weapon> = new Map(
  WEAPONS_LIST.map((w) => [w.slug, w]),
)

export function getWeapon(slug: string): Weapon | undefined {
  return WEAPON_BY_SLUG.get(slug)
}

export function getWeaponsForType(weaponType: WeaponType): Weapon[] {
  return WEAPONS_LIST.filter((w) => w.weaponType === weaponType)
}
