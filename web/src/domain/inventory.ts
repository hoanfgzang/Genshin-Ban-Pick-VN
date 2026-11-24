import { z } from 'zod'

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
    next[slug] = { slug, constellation: DEFAULT_CONSTELLATION, level: DEFAULT_LEVEL }
  } else {
    delete next[slug]
  }
  return withCharacters(inv, next)
}

export function toggleOwned(inv: Inventory, slug: string): Inventory {
  return setOwned(inv, slug, !isOwned(inv, slug))
}

function patch(inv: Inventory, slug: string, changes: Partial<OwnedCharacter>): Inventory {
  const base = inv.characters[slug] ?? {
    slug,
    constellation: DEFAULT_CONSTELLATION,
    level: DEFAULT_LEVEL,
  }
  return withCharacters(inv, { ...inv.characters, [slug]: { ...base, ...changes, slug } })
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
    if (owned && !(slug in next)) {
      next[slug] = { slug, constellation: DEFAULT_CONSTELLATION, level: DEFAULT_LEVEL }
      changed = true
    } else if (!owned && slug in next) {
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

export type ParseResult =
  | { ok: true; inventory: Inventory; unknownSlugs: string[]; normalizedLevels: number }
  | { ok: false; error: string }

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
  for (const c of Object.values(inv.characters)) {
    if (knownSlugs && !knownSlugs.has(c.slug)) {
      unknownSlugs.push(c.slug)
      continue
    }
    const level = normalizeLevel(c.level)
    if (level !== c.level) normalizedLevels++
    characters[c.slug] = { slug: c.slug, constellation: c.constellation, level }
  }
  return {
    ok: true,
    inventory: { version: inv.version, updatedAt: inv.updatedAt, characters },
    unknownSlugs,
    normalizedLevels,
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
