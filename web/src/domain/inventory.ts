import { z } from 'zod'
import {
  getOppositeTravelerGenderSlug,
  isTravelerElementSlug,
  isTravelerGenderSlug,
  TRAVELER_GENDER_SLUGS,
  TRAVELER_GENERIC_ALIASES,
  type TravelerGenderSlug,
} from './traveler'

export const CONSTELLATIONS = [0, 1, 2, 3, 4, 5, 6] as const
export type Constellation = (typeof CONSTELLATIONS)[number]

export const LEVELS = [90, 95, 100] as const
export type Level = (typeof LEVELS)[number]

export const DEFAULT_CONSTELLATION: Constellation = 0
export const DEFAULT_LEVEL: Level = 90

/** Có mặt trong `Inventory.characters` = đã sở hữu. */
export interface OwnedCharacter {
  slug: string
  constellation: Constellation
  level: Level
}

export interface Inventory {
  version: 1
  characters: Record<string, OwnedCharacter>
  updatedAt: string
}

// ---------- Schema (dùng cho import file & sau này dùng chung với backend) ----------

export const ownedCharacterSchema = z.object({
  slug: z.string().min(1),
  constellation: z.union(CONSTELLATIONS.map((n) => z.literal(n))),
  level: z.union(LEVELS.map((n) => z.literal(n))),
})

export const inventorySchema = z.object({
  version: z.literal(1),
  characters: z.record(z.string(), ownedCharacterSchema),
  updatedAt: z.string(),
})

const importOwnedCharacterSchema = z.object({
  slug: z.string().min(1),
  constellation: z.union(CONSTELLATIONS.map((n) => z.literal(n))),
  level: z.number().int().min(1).max(100),
})

const importInventorySchema = z.object({
  version: z.literal(1),
  characters: z.record(z.string(), importOwnedCharacterSchema),
  updatedAt: z.string(),
})

// ---------- Helpers thuần (immutable) ----------

const now = () => new Date().toISOString()

export function emptyInventory(): Inventory {
  return { version: 1, characters: {}, updatedAt: now() }
}

function withCharacters(inv: Inventory, characters: Record<string, OwnedCharacter>): Inventory {
  return { ...inv, characters, updatedAt: now() }
}

export function isOwned(inv: Inventory, slug: string): boolean {
  return slug in inv.characters
}

export function setOwned(inv: Inventory, slug: string, owned: boolean): Inventory {
  if (owned === isOwned(inv, slug)) return inv
  const next = { ...inv.characters }
  if (owned) {
    if (isTravelerGenderSlug(slug)) {
      const other = getOppositeTravelerGenderSlug(slug)
      const prev = next[other]
      if (prev) {
        delete next[other]
        next[slug] = { slug, constellation: prev.constellation, level: prev.level }
      } else {
        next[slug] = { slug, constellation: DEFAULT_CONSTELLATION, level: DEFAULT_LEVEL }
      }
    } else {
      next[slug] = { slug, constellation: DEFAULT_CONSTELLATION, level: DEFAULT_LEVEL }
    }
  } else {
    delete next[slug]
  }
  return withCharacters(inv, next)
}

export function toggleOwned(inv: Inventory, slug: string): Inventory {
  return setOwned(inv, slug, !isOwned(inv, slug))
}

function patch(inv: Inventory, slug: string, changes: Partial<OwnedCharacter>): Inventory {
  const next = { ...inv.characters }
  if (isTravelerGenderSlug(slug)) {
    const other = getOppositeTravelerGenderSlug(slug)
    const base = next[slug] ??
      next[other] ?? {
        slug,
        constellation: DEFAULT_CONSTELLATION,
        level: DEFAULT_LEVEL,
      }
    delete next[other]
    next[slug] = { ...base, ...changes, slug }
    return withCharacters(inv, next)
  }
  const base = next[slug] ?? {
    slug,
    constellation: DEFAULT_CONSTELLATION,
    level: DEFAULT_LEVEL,
  }
  next[slug] = { ...base, ...changes, slug }
  return withCharacters(inv, next)
}

export function isConstellation(n: number): n is Constellation {
  return (CONSTELLATIONS as readonly number[]).includes(n)
}

export function isLevel(n: number): n is Level {
  return (LEVELS as readonly number[]).includes(n)
}

/** Quy đổi level thực tế (1–100) về 3 mốc hỗ trợ (90, 95, 100). */
export function normalizeLevel(n: number): Level {
  if (n >= 100) return 100
  if (n >= 95) return 95
  return 90
}

/** Đặt cung mệnh (tự đánh dấu sở hữu nếu chưa có). */
export function setConstellation(inv: Inventory, slug: string, c: number): Inventory {
  if (!isConstellation(c)) throw new RangeError(`Cung mệnh không hợp lệ: ${c}`)
  return patch(inv, slug, { constellation: c })
}

/** Đặt level (tự đánh dấu sở hữu nếu chưa có). */
export function setLevel(inv: Inventory, slug: string, level: number): Inventory {
  if (!isLevel(level)) throw new RangeError(`Level không hợp lệ: ${level}`)
  return patch(inv, slug, { level })
}

/** Đánh dấu/bỏ sở hữu hàng loạt; giữ nguyên dữ liệu của nhân vật đã có. */
export function bulkSetOwned(inv: Inventory, slugs: Iterable<string>, owned: boolean): Inventory {
  const next = { ...inv.characters }
  let changed = false
  for (const slug of slugs) {
    if (owned) {
      if (isTravelerGenderSlug(slug)) {
        const other = getOppositeTravelerGenderSlug(slug)
        if (!(slug in next) && !(other in next)) {
          next[slug] = { slug, constellation: DEFAULT_CONSTELLATION, level: DEFAULT_LEVEL }
          changed = true
        }
      } else if (!(slug in next)) {
        next[slug] = { slug, constellation: DEFAULT_CONSTELLATION, level: DEFAULT_LEVEL }
        changed = true
      }
    } else if (slug in next) {
      delete next[slug]
      changed = true
    }
  }
  return changed ? withCharacters(inv, next) : inv
}

/** Đặt level cho các nhân vật đã sở hữu trong danh sách. */
export function bulkSetLevel(inv: Inventory, slugs: Iterable<string>, level: Level): Inventory {
  const next = { ...inv.characters }
  let changed = false
  for (const slug of slugs) {
    const cur = next[slug]
    if (cur && cur.level !== level) {
      next[slug] = { ...cur, level }
      changed = true
    }
  }
  return changed ? withCharacters(inv, next) : inv
}

// ---------- Import / Export ----------

export function exportInventory(inv: Inventory): string {
  return JSON.stringify(inv, null, 2)
}

export type TravelerImportSource = 'generic' | 'both' | 'boy' | 'girl'

export interface TravelerImportInfo {
  constellation: Constellation
  level: Level
  source: TravelerImportSource
}

export type ParseResult =
  | {
      ok: true
      inventory: Inventory
      unknownSlugs: string[]
      normalizedLevels: number
      travelerImport?: TravelerImportInfo
    }
  | { ok: false; error: string }

export function getInventoryTravelerGender(inv: Inventory): TravelerGenderSlug | null {
  for (const slug of TRAVELER_GENDER_SLUGS) {
    if (slug in inv.characters) return slug
  }
  return null
}

export function applyTravelerGenderChoice(
  inv: Inventory,
  gender: TravelerGenderSlug,
): Inventory {
  const currentGender = getInventoryTravelerGender(inv)
  if (!currentGender || currentGender === gender) return inv
  const entry = inv.characters[currentGender]
  if (!entry) return inv
  const next = { ...inv.characters }
  delete next[currentGender]
  next[gender] = { ...entry, slug: gender }
  return { ...inv, characters: next }
}

/**
 * Đọc & kiểm tra JSON kho. `knownSlugs` dùng để loại bỏ nhân vật không tồn tại.
 */
export function parseInventory(text: string, knownSlugs?: ReadonlySet<string>): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'File không phải JSON hợp lệ.' }
  }
  const result = importInventorySchema.safeParse(data)
  if (!result.success) {
    return { ok: false, error: 'Cấu trúc dữ liệu kho không hợp lệ.' }
  }
  const inv = result.data
  const unknownSlugs: string[] = []
  const characters: Record<string, OwnedCharacter> = {}
  let normalizedLevels = 0

  const knowsAnyTraveler =
    !knownSlugs || knownSlugs.has('traveler-boy') || knownSlugs.has('traveler-girl')
  let sawBoy = false
  let sawGirl = false
  let sawGeneric = false
  let bestTraveler: { constellation: Constellation; level: Level } | null = null

  for (const [rawKey, c] of Object.entries(inv.characters)) {
    const slug = (c.slug || rawKey).trim().toLowerCase()
    const level = normalizeLevel(c.level)

    const isBoy = slug === 'traveler-boy' || slug === 'aether'
    const isGirl = slug === 'traveler-girl' || slug === 'lumine'
    const isGeneric = TRAVELER_GENERIC_ALIASES.has(slug)

    if (isBoy || isGirl || isGeneric) {
      if (!knowsAnyTraveler) {
        unknownSlugs.push(c.slug)
        continue
      }
      if (level !== c.level) normalizedLevels++
      if (isBoy) sawBoy = true
      else if (isGirl) sawGirl = true
      else sawGeneric = true

      if (
        !bestTraveler ||
        c.constellation > bestTraveler.constellation ||
        (c.constellation === bestTraveler.constellation && level > bestTraveler.level)
      ) {
        bestTraveler = { constellation: c.constellation, level }
      }
      continue
    }

    if (isTravelerElementSlug(slug)) {
      unknownSlugs.push(c.slug)
      continue
    }

    if (knownSlugs && !knownSlugs.has(c.slug)) {
      unknownSlugs.push(c.slug)
      continue
    }
    if (level !== c.level) normalizedLevels++
    characters[c.slug] = { slug: c.slug, constellation: c.constellation, level }
  }

  let travelerImport: TravelerImportInfo | undefined
  if (bestTraveler) {
    const source: TravelerImportSource =
      sawBoy && sawGirl
        ? 'both'
        : sawGeneric
          ? 'generic'
          : sawGirl && !sawBoy
            ? 'girl'
            : 'boy'
    const initialGender: TravelerGenderSlug =
      source === 'girl'
        ? 'traveler-girl'
        : knownSlugs && !knownSlugs.has('traveler-boy') && knownSlugs.has('traveler-girl')
          ? 'traveler-girl'
          : 'traveler-boy'
    characters[initialGender] = {
      slug: initialGender,
      constellation: bestTraveler.constellation,
      level: bestTraveler.level,
    }
    travelerImport = {
      constellation: bestTraveler.constellation,
      level: bestTraveler.level,
      source,
    }
  }

  return {
    ok: true,
    inventory: { version: inv.version, updatedAt: inv.updatedAt, characters },
    unknownSlugs,
    normalizedLevels,
    travelerImport,
  }
}

// ---------- Thống kê ----------

export interface InventoryDiff {
  added: number
  removed: number
  changed: number
}

export function diffInventory(from: Inventory, to: Inventory): InventoryDiff {
  let added = 0
  let removed = 0
  let changed = 0
  for (const [slug, c] of Object.entries(to.characters)) {
    const prev = from.characters[slug]
    if (!prev) added++
    else if (prev.constellation !== c.constellation || prev.level !== c.level) changed++
  }
  for (const slug of Object.keys(from.characters)) {
    if (!(slug in to.characters)) removed++
  }
  return { added, removed, changed }
}
