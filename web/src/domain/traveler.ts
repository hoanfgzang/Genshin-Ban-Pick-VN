import raw from '@/data/characters.json'
import { ELEMENT_LABEL, ELEMENTS, type Character, type Element } from './character'

export const TRAVELER_GENDER_SLUGS = ['traveler-boy', 'traveler-girl'] as const
export type TravelerGenderSlug = (typeof TRAVELER_GENDER_SLUGS)[number]

export type TravelerElementSlug = `traveler-${Element}`

export const TRAVELER_ELEMENT_SLUGS: readonly TravelerElementSlug[] = ELEMENTS.map(
  (el) => `traveler-${el}` as TravelerElementSlug,
)

export const TRAVELER_GENERIC_ALIASES = new Set(['traveler', 'nha-lu-hanh', 'main'])

export const TRAVELER_ELEMENT_CHARACTERS: readonly Character[] = ELEMENTS.map((el) => ({
  id: `traveler-${el}`,
  slug: `traveler-${el}`,
  name: `Nhà Lữ Hành (${ELEMENT_LABEL[el]})`,
  rarity: 5,
  element: el,
  weapon: 'sword',
  region: 'mainactor',
  release: '2020-09-27',
  icon: '/characters/traveler-boy.png',
  card: '/character_cards/traveler-boy.webp',
}))

export function isTravelerGenderSlug(slug: string | null | undefined): slug is TravelerGenderSlug {
  return slug === 'traveler-boy' || slug === 'traveler-girl'
}

export function isTravelerElementSlug(slug: string | null | undefined): slug is TravelerElementSlug {
  return Boolean(slug && (TRAVELER_ELEMENT_SLUGS as readonly string[]).includes(slug))
}

export function isAnyTravelerSlug(slug: string | null | undefined): boolean {
  if (!slug) return false
  return (
    isTravelerGenderSlug(slug) ||
    isTravelerElementSlug(slug) ||
    TRAVELER_GENERIC_ALIASES.has(slug) ||
    slug === 'aether' ||
    slug === 'lumine'
  )
}

export function getTravelerElement(slug: string | null | undefined): Element | null {
  if (!isTravelerElementSlug(slug)) return null
  return slug.slice('traveler-'.length) as Element
}

export function getTravelerElementSlug(element: Element): TravelerElementSlug {
  return `traveler-${element}`
}

export function getOppositeTravelerGenderSlug(slug: TravelerGenderSlug): TravelerGenderSlug {
  return slug === 'traveler-boy' ? 'traveler-girl' : 'traveler-boy'
}

export function getOwnedTraveler<T extends { slug?: string }>(
  ownedMap: Record<string, T> | undefined | null,
): { slug: TravelerGenderSlug; entry: T } | null {
  if (!ownedMap) return null
  for (const slug of TRAVELER_GENDER_SLUGS) {
    const entry = ownedMap[slug]
    if (entry) return { slug, entry }
  }
  return null
}

export function resolveTravelerMedia(gender: TravelerGenderSlug): { icon: string; card: string } {
  return {
    icon: `/characters/${gender}.png`,
    card: `/character_cards/${gender}.webp`,
  }
}

const ALL_TRAVELER_AND_BASE_BY_SLUG = new Map<string, Character>([
  ...(raw as Character[]).map((c) => [c.slug, c] as const),
  ...TRAVELER_ELEMENT_CHARACTERS.map((c) => [c.slug, c] as const),
])

export function resolveCharacterForOwned<T extends { slug?: string }>(
  slug: string,
  ownedMap?: Record<string, T> | null,
  fallbackOwnedMap?: Record<string, T> | null,
): Character | undefined {
  const char = ALL_TRAVELER_AND_BASE_BY_SLUG.get(slug)
  if (!char) return undefined
  if (!isTravelerElementSlug(slug)) return char
  const ownedGender =
    getOwnedTraveler(ownedMap)?.slug ?? getOwnedTraveler(fallbackOwnedMap)?.slug ?? 'traveler-boy'
  const media = resolveTravelerMedia(ownedGender)
  return {
    ...char,
    icon: media.icon,
    card: media.card,
  }
}
