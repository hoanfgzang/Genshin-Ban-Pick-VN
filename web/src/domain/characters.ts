import raw from '@/data/characters.json'
import type { Character } from './character'

/** Danh sách nhân vật tĩnh, sinh bởi `assets/dataminer2.py`. */
export const CHARACTERS: readonly Character[] = raw as Character[]

export const CHARACTER_BY_SLUG: ReadonlyMap<string, Character> = new Map(
  CHARACTERS.map((c) => [c.slug, c]),
)

export function getCharacter(slug: string): Character | undefined {
  return CHARACTER_BY_SLUG.get(slug)
}
