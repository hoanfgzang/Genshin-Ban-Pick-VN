import type { Character, Element, Rarity, WeaponType } from '@/domain/character'
import type { Inventory } from '@/domain/inventory'

export type OwnershipFilter = 'all' | 'owned' | 'missing'
export type SortKey = 'release' | 'name' | 'rarity' | 'constellation' | 'level'

export interface InventoryFilter {
  q: string
  elements: Element[]
  weapons: WeaponType[]
  rarities: Rarity[]
  ownership: OwnershipFilter
  sort: SortKey
}

export const DEFAULT_FILTER: InventoryFilter = {
  q: '',
  elements: [],
  weapons: [],
  rarities: [],
  ownership: 'all',
  sort: 'rarity',
}

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
}

/** Lọc (AND giữa các nhóm, OR trong nhóm) và sắp xếp nhân vật. */
export function filterCharacters(
  characters: readonly Character[],
  inventory: Inventory,
  f: InventoryFilter,
): Character[] {
  const q = normalize(f.q.trim())
  const owned = inventory.characters

  const result = characters.filter((c) => {
    if (q && !normalize(c.name).includes(q) && !c.slug.includes(q)) return false
    if (f.elements.length && (!c.element || !f.elements.includes(c.element))) return false
    if (f.weapons.length && !f.weapons.includes(c.weapon)) return false
    if (f.rarities.length && !f.rarities.includes(c.rarity)) return false
    if (f.ownership === 'owned' && !owned[c.slug]) return false
    if (f.ownership === 'missing' && owned[c.slug]) return false
    return true
  })

  const byRelease = (a: Character, b: Character) =>
    (b.release ?? '').localeCompare(a.release ?? '')
  const ownedFirst = (a: Character, b: Character) =>
    Number(!!owned[b.slug]) - Number(!!owned[a.slug])

  const sorters: Record<SortKey, (a: Character, b: Character) => number> = {
    release: byRelease,
    name: (a, b) => a.name.localeCompare(b.name, 'vi'),
    rarity: (a, b) => b.rarity - a.rarity || byRelease(a, b),
    constellation: (a, b) =>
      ownedFirst(a, b) ||
      (owned[b.slug]?.constellation ?? -1) - (owned[a.slug]?.constellation ?? -1) ||
      b.rarity - a.rarity,
    level: (a, b) =>
      ownedFirst(a, b) ||
      (owned[b.slug]?.level ?? 0) - (owned[a.slug]?.level ?? 0) ||
      b.rarity - a.rarity,
  }
  return result.sort(sorters[f.sort])
}

// ---------- Đồng bộ với URL query ----------

const list = <T extends string | number>(v: string | null, allowed: readonly T[]): T[] =>
  (v ?? '')
    .split(',')
    .filter(Boolean)
    .map((x) => (typeof allowed[0] === 'number' ? Number(x) : x) as T)
    .filter((x) => allowed.includes(x))

export function filterFromParams(
  params: URLSearchParams,
  allowed: { elements: readonly Element[]; weapons: readonly WeaponType[] },
): InventoryFilter {
  const own = params.get('own')
  const sort = params.get('sort')
  return {
    q: params.get('q') ?? '',
    elements: list(params.get('el'), allowed.elements),
    weapons: list(params.get('w'), allowed.weapons),
    rarities: list(params.get('r'), [5, 4] as const),
    ownership: own === 'owned' || own === 'missing' ? own : 'all',
    sort: (['release', 'name', 'rarity', 'constellation', 'level'] as const).includes(
      sort as SortKey,
    )
      ? (sort as SortKey)
      : DEFAULT_FILTER.sort,
  }
}

export function filterToParams(f: InventoryFilter): URLSearchParams {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.elements.length) p.set('el', f.elements.join(','))
  if (f.weapons.length) p.set('w', f.weapons.join(','))
  if (f.rarities.length) p.set('r', f.rarities.join(','))
  if (f.ownership !== 'all') p.set('own', f.ownership)
  if (f.sort !== DEFAULT_FILTER.sort) p.set('sort', f.sort)
  return p
}

export function isFilterActive(f: InventoryFilter) {
  return (
    !!f.q || !!f.elements.length || !!f.weapons.length || !!f.rarities.length || f.ownership !== 'all'
  )
}
