import raw from '@/data/characters.json'
import type { Character } from './character'
import { isTravelerGenderSlug, TRAVELER_ELEMENT_CHARACTERS } from './traveler'

/** Danh sách nhân vật tĩnh cho kho cá nhân, sinh bởi `assets/dataminer2.py`. */
export const CHARACTERS: readonly Character[] = raw as Character[]

/** Tổng số nhân vật hiệu dụng trong kho (Nhà Lữ Hành Nam & Nữ chỉ tính là 1). */
export const EFFECTIVE_CHARACTER_COUNT = CHARACTERS.length - 1

/** Danh sách nhân vật dùng cho bảng Cost & CSV (7 biến thể hệ cho Nhà Lữ Hành). */
export const COST_CHARACTERS: readonly Character[] = [
  ...CHARACTERS.filter((c) => !isTravelerGenderSlug(c.slug)),
  ...TRAVELER_ELEMENT_CHARACTERS,
]

export const COST_CHARACTER_BY_SLUG: ReadonlyMap<string, Character> = new Map(
  COST_CHARACTERS.map((c) => [c.slug, c]),
)

export const CHARACTER_BY_SLUG: ReadonlyMap<string, Character> = new Map([
  ...CHARACTERS.map((c) => [c.slug, c] as const),
  ...TRAVELER_ELEMENT_CHARACTERS.map((c) => [c.slug, c] as const),
])

export function getCharacter(slug: string): Character | undefined {
  return CHARACTER_BY_SLUG.get(slug)
}
