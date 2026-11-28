import { ELEMENT_LABEL, WEAPON_LABEL, type Character } from '@/domain/character'
import { COST_CHARACTER_BY_SLUG, COST_CHARACTERS } from '@/domain/characters'
import { round2 } from '@/domain/cost'
import type { CharacterCustomCost, CostRules, WeaponCustomCost } from '@/domain/ruleset'
import type { Weapon } from '@/domain/weapon'
import { WEAPON_BY_SLUG, WEAPONS_LIST } from '@/domain/weapons'
import { normalizeVi } from './costTableUtils'

const UTF8_BOM = '\uFEFF'

export function slugifyFilePart(name: string): string {
  const cleaned = normalizeVi(name.trim())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'bo-luat'
}

export function downloadCsvFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function csvCell(val: string | number): string {
  const s = String(val)
  if (/[",\r\n;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function csvRow(cells: Array<string | number>): string {
  return cells.map(csvCell).join(',')
}

function detectDelimiter(headerLine: string): ',' | ';' | '\t' {
  const counts: Record<',' | ';' | '\t', number> = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (let i = 0; i < headerLine.length; i += 1) {
    const ch = headerLine[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t')) {
      counts[ch] += 1
    }
  }
  if (counts[';'] > counts[','] && counts[';'] >= counts['\t']) return ';'
  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t'
  return ','
}

function parseCsvMatrix(rawText: string): { delimiter: ',' | ';' | '\t'; rows: string[][] } {
  const text = rawText.replace(/^\uFEFF/, '')
  const firstNewline = text.search(/\r?\n/)
  const firstLine = firstNewline >= 0 ? text.slice(0, firstNewline) : text
  const delimiter = detectDelimiter(firstLine)

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return {
    delimiter,
    rows: rows.filter((r) => r.some((cell) => cell.trim() !== '')),
  }
}

function parseNonNegativeNumber(raw: string, delimiter: ',' | ';' | '\t'): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const normalized = delimiter !== ',' ? trimmed.replace(',', '.') : trimmed
  const num = Number(normalized)
  if (!Number.isFinite(num) || num < 0) return null
  return round2(num)
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  return a.every((val, idx) => round2(val) === round2(b[idx] ?? 0))
}

const CHAR_BY_NORM_NAME = new Map(COST_CHARACTERS.map((c) => [normalizeVi(c.name), c]))
const WEAPON_BY_NORM_NAME = new Map(WEAPONS_LIST.map((w) => [normalizeVi(w.name), w]))

// ---------- CSV Nhân vật ----------

export function exportCharacterCostCsv(
  characters: readonly Character[],
  costRules: CostRules,
): string {
  const lines: string[] = [
    csvRow(['slug', 'name', 'rarity', 'element', 'type', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'note']),
  ]
  const customMap = costRules.characterCustomCosts ?? {}

  for (const c of characters) {
    const defaults = c.rarity === 5 ? costRules.defaultChar5Costs : costRules.defaultChar4Costs
    const baseValues = costRules.characterOverrides[c.slug] ?? defaults
    const elementLabel = c.element ? ELEMENT_LABEL[c.element] : 'Khác'

    lines.push(
      csvRow([
        c.slug,
        c.name,
        `${c.rarity}★`,
        elementLabel,
        'base',
        ...[0, 1, 2, 3, 4, 5, 6].map((idx) => round2(baseValues[idx] ?? 0)),
        '',
      ]),
    )

    for (const custom of customMap[c.slug] ?? []) {
      lines.push(
        csvRow([
          c.slug,
          c.name,
          `${c.rarity}★`,
          elementLabel,
          'custom',
          ...[0, 1, 2, 3, 4, 5, 6].map((idx) => round2(custom.costs[idx] ?? 0)),
          custom.note,
        ]),
      )
    }
  }

  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`
}

export interface CharacterCsvParseStats {
  matchedCharacters: number
  customEntries: number
  overriddenCount: number
  resetToDefaultCount: number
  unknownRows: string[]
}

export type CharacterCsvParseResult =
  | {
      ok: true
      nextOverrides: Record<string, number[]>
      nextCustomCosts: Record<string, CharacterCustomCost[]>
      stats: CharacterCsvParseStats
    }
  | { ok: false; error: string }

export function parseCharacterCostCsv(
  rawText: string,
  costRules: CostRules,
): CharacterCsvParseResult {
  const { delimiter, rows } = parseCsvMatrix(rawText)
  if (rows.length < 2) {
    return { ok: false, error: 'File CSV trống hoặc không có dòng dữ liệu nào.' }
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => headers.indexOf(name)

  const slugCol = col('slug')
  const nameCol = col('name')
  if (slugCol < 0 && nameCol < 0) {
    return { ok: false, error: 'Thiếu cột "slug" hoặc "name" trong tiêu đề CSV.' }
  }

  const cCols = [0, 1, 2, 3, 4, 5, 6].map((i) => col(`c${i}`))
  if (cCols.some((idx) => idx < 0)) {
    return { ok: false, error: 'File CSV nhân vật phải có đủ 7 cột c0, c1, c2, c3, c4, c5, c6.' }
  }

  const typeCol = col('type')
  const noteCol = col('note')

  const nextOverrides: Record<string, number[]> = { ...costRules.characterOverrides }
  const nextCustomCosts: Record<string, CharacterCustomCost[]> = structuredClone(
    costRules.characterCustomCosts ?? {},
  )

  const touchedSlugs = new Set<string>()
  const clearedCustomForSlug = new Set<string>()
  const unknownRows: string[] = []
  let overriddenCount = 0
  let resetToDefaultCount = 0
  let customEntries = 0

  for (let rIdx = 1; rIdx < rows.length; rIdx += 1) {
    const r = rows[rIdx]
    const lineNo = rIdx + 1
    const rawSlug = slugCol >= 0 ? (r[slugCol] ?? '').trim().toLowerCase() : ''
    const rawName = nameCol >= 0 ? (r[nameCol] ?? '').trim() : ''
    if (!rawSlug && !rawName) continue

    const normalizedSlug = rawSlug.replace(/^traveler-(?:boy|girl)-/, 'traveler-')
    const char =
      (normalizedSlug ? COST_CHARACTER_BY_SLUG.get(normalizedSlug) : undefined) ??
      (rawName ? CHAR_BY_NORM_NAME.get(normalizeVi(rawName)) : undefined)

    if (!char) {
      unknownRows.push(rawSlug || rawName)
      continue
    }

    const costs: number[] = []
    for (let k = 0; k < 7; k += 1) {
      const val = parseNonNegativeNumber(r[cCols[k]] ?? '', delimiter)
      if (val === null) {
        return {
          ok: false,
          error: `Dòng ${lineNo} (${char.name}): giá trị cột C${k} không hợp lệ (phải là số >= 0).`,
        }
      }
      costs.push(val)
    }

    const rawType = typeCol >= 0 ? (r[typeCol] ?? '').trim().toLowerCase() : ''
    const note = noteCol >= 0 ? (r[noteCol] ?? '').trim() : ''
    const isCustom = rawType === 'custom' || (rawType === '' && note.length > 0)

    if (rawType && rawType !== 'base' && rawType !== 'custom') {
      return {
        ok: false,
        error: `Dòng ${lineNo} (${char.name}): cột "type" chỉ nhận "base" hoặc "custom".`,
      }
    }

    touchedSlugs.add(char.slug)
    if (!clearedCustomForSlug.has(char.slug)) {
      delete nextCustomCosts[char.slug]
      clearedCustomForSlug.add(char.slug)
    }

    if (isCustom) {
      if (!note) {
        return {
          ok: false,
          error: `Dòng ${lineNo} (${char.name}): dòng Custom Cost bắt buộc phải có ghi chú điều kiện ở cột "note".`,
        }
      }
      const list = nextCustomCosts[char.slug] ?? []
      list.push({
        id: `cc-${list.length + 1}`,
        costs,
        note: note.slice(0, 300),
      })
      nextCustomCosts[char.slug] = list
      customEntries += 1
    } else {
      const defaults = char.rarity === 5 ? costRules.defaultChar5Costs : costRules.defaultChar4Costs
      const hadOverride = char.slug in nextOverrides
      if (arraysEqual(costs, defaults)) {
        if (hadOverride) {
          delete nextOverrides[char.slug]
          resetToDefaultCount += 1
        }
      } else {
        const prev = nextOverrides[char.slug]
        if (!prev || !arraysEqual(prev, costs)) {
          overriddenCount += 1
        }
        nextOverrides[char.slug] = costs
      }
    }
  }

  if (touchedSlugs.size === 0) {
    return {
      ok: false,
      error: 'Không khớp được nhân vật nào trong file CSV.',
    }
  }

  return {
    ok: true,
    nextOverrides,
    nextCustomCosts,
    stats: {
      matchedCharacters: touchedSlugs.size,
      customEntries,
      overriddenCount,
      resetToDefaultCount,
      unknownRows,
    },
  }
}

// ---------- CSV Vũ khí ----------

export function exportWeaponCostCsv(weapons: readonly Weapon[], costRules: CostRules): string {
  const lines: string[] = [
    csvRow(['slug', 'name', 'rarity', 'weaponType', 'type', 'cost', 'r1', 'r2', 'r3', 'r4', 'r5', 'note']),
  ]
  const customMap = costRules.weaponCustomCosts ?? {}

  for (const w of weapons) {
    const defaultCost = w.rarity === 5 ? costRules.defaultWeapon5Cost : costRules.defaultWeapon4Cost
    const defaultRef =
      w.rarity === 5
        ? costRules.defaultWeapon5RefinementSeconds
        : costRules.defaultWeapon4RefinementSeconds
    const baseCost = costRules.weaponCostOverrides[w.slug] ?? defaultCost
    const baseRef = costRules.weaponRefinementOverrides[w.slug] ?? defaultRef

    lines.push(
      csvRow([
        w.slug,
        w.name,
        `${w.rarity}★`,
        WEAPON_LABEL[w.weaponType],
        'base',
        round2(baseCost),
        ...[0, 1, 2, 3, 4].map((idx) => round2(baseRef[idx] ?? 0)),
        '',
      ]),
    )

    for (const custom of customMap[w.slug] ?? []) {
      lines.push(
        csvRow([
          w.slug,
          w.name,
          `${w.rarity}★`,
          WEAPON_LABEL[w.weaponType],
          'custom',
          round2(custom.cost),
          ...[0, 1, 2, 3, 4].map((idx) => round2(custom.refinementSeconds[idx] ?? 0)),
          custom.note,
        ]),
      )
    }
  }

  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`
}

export interface WeaponCsvParseStats {
  matchedWeapons: number
  customEntries: number
  overriddenCount: number
  resetToDefaultCount: number
  unknownRows: string[]
}

export type WeaponCsvParseResult =
  | {
      ok: true
      nextCostOverrides: Record<string, number>
      nextRefOverrides: Record<string, number[]>
      nextCustomCosts: Record<string, WeaponCustomCost[]>
      stats: WeaponCsvParseStats
    }
  | { ok: false; error: string }

export function parseWeaponCostCsv(rawText: string, costRules: CostRules): WeaponCsvParseResult {
  const { delimiter, rows } = parseCsvMatrix(rawText)
  if (rows.length < 2) {
    return { ok: false, error: 'File CSV trống hoặc không có dòng dữ liệu nào.' }
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => headers.indexOf(name)

  const slugCol = col('slug')
  const nameCol = col('name')
  if (slugCol < 0 && nameCol < 0) {
    return { ok: false, error: 'Thiếu cột "slug" hoặc "name" trong tiêu đề CSV.' }
  }

  const costCol = col('cost')
  const rCols = [1, 2, 3, 4, 5].map((i) => col(`r${i}`))
  if (costCol < 0 || rCols.some((idx) => idx < 0)) {
    return { ok: false, error: 'File CSV vũ khí phải có đủ cột cost và r1, r2, r3, r4, r5.' }
  }

  const typeCol = col('type')
  const noteCol = col('note')

  const nextCostOverrides: Record<string, number> = { ...costRules.weaponCostOverrides }
  const nextRefOverrides: Record<string, number[]> = { ...costRules.weaponRefinementOverrides }
  const nextCustomCosts: Record<string, WeaponCustomCost[]> = structuredClone(
    costRules.weaponCustomCosts ?? {},
  )

  const touchedSlugs = new Set<string>()
  const clearedCustomForSlug = new Set<string>()
  const unknownRows: string[] = []
  let overriddenCount = 0
  let resetToDefaultCount = 0
  let customEntries = 0

  for (let rIdx = 1; rIdx < rows.length; rIdx += 1) {
    const r = rows[rIdx]
    const lineNo = rIdx + 1
    const rawSlug = slugCol >= 0 ? (r[slugCol] ?? '').trim().toLowerCase() : ''
    const rawName = nameCol >= 0 ? (r[nameCol] ?? '').trim() : ''
    if (!rawSlug && !rawName) continue

    const weapon =
      (rawSlug ? WEAPON_BY_SLUG.get(rawSlug) : undefined) ??
      (rawName ? WEAPON_BY_NORM_NAME.get(normalizeVi(rawName)) : undefined)

    if (!weapon) {
      unknownRows.push(rawSlug || rawName)
      continue
    }

    const baseCost = parseNonNegativeNumber(r[costCol] ?? '', delimiter)
    if (baseCost === null) {
      return {
        ok: false,
        error: `Dòng ${lineNo} (${weapon.name}): giá trị cột "cost" không hợp lệ (phải là số >= 0).`,
      }
    }

    const refSeconds: number[] = []
    for (let k = 0; k < 5; k += 1) {
      const val = parseNonNegativeNumber(r[rCols[k]] ?? '', delimiter)
      if (val === null) {
        return {
          ok: false,
          error: `Dòng ${lineNo} (${weapon.name}): giá trị cột R${k + 1} không hợp lệ (phải là số >= 0).`,
        }
      }
      refSeconds.push(val)
    }

    const rawType = typeCol >= 0 ? (r[typeCol] ?? '').trim().toLowerCase() : ''
    const note = noteCol >= 0 ? (r[noteCol] ?? '').trim() : ''
    const isCustom = rawType === 'custom' || (rawType === '' && note.length > 0)

    if (rawType && rawType !== 'base' && rawType !== 'custom') {
      return {
        ok: false,
        error: `Dòng ${lineNo} (${weapon.name}): cột "type" chỉ nhận "base" hoặc "custom".`,
      }
    }

    touchedSlugs.add(weapon.slug)
    if (!clearedCustomForSlug.has(weapon.slug)) {
      delete nextCustomCosts[weapon.slug]
      clearedCustomForSlug.add(weapon.slug)
    }

    if (isCustom) {
      if (!note) {
        return {
          ok: false,
          error: `Dòng ${lineNo} (${weapon.name}): dòng Custom Cost bắt buộc phải có ghi chú điều kiện ở cột "note".`,
        }
      }
      const list = nextCustomCosts[weapon.slug] ?? []
      list.push({
        id: `wc-${list.length + 1}`,
        cost: baseCost,
        refinementSeconds: refSeconds,
        note: note.slice(0, 300),
      })
      nextCustomCosts[weapon.slug] = list
      customEntries += 1
    } else {
      const defaultCost =
        weapon.rarity === 5 ? costRules.defaultWeapon5Cost : costRules.defaultWeapon4Cost
      const defaultRef =
        weapon.rarity === 5
          ? costRules.defaultWeapon5RefinementSeconds
          : costRules.defaultWeapon4RefinementSeconds

      const hadAnyOverride =
        weapon.slug in nextCostOverrides || weapon.slug in nextRefOverrides
      let changedToOverride = false

      if (round2(baseCost) === round2(defaultCost)) {
        delete nextCostOverrides[weapon.slug]
      } else {
        if (round2(nextCostOverrides[weapon.slug] ?? -1) !== round2(baseCost)) {
          changedToOverride = true
        }
        nextCostOverrides[weapon.slug] = baseCost
      }

      if (arraysEqual(refSeconds, defaultRef)) {
        delete nextRefOverrides[weapon.slug]
      } else {
        const prevRef = nextRefOverrides[weapon.slug]
        if (!prevRef || !arraysEqual(prevRef, refSeconds)) {
          changedToOverride = true
        }
        nextRefOverrides[weapon.slug] = refSeconds
      }

      const nowHasOverride =
        weapon.slug in nextCostOverrides || weapon.slug in nextRefOverrides
      if (hadAnyOverride && !nowHasOverride) {
        resetToDefaultCount += 1
      } else if (changedToOverride) {
        overriddenCount += 1
      }
    }
  }

  if (touchedSlugs.size === 0) {
    return {
      ok: false,
      error: 'Không khớp được vũ khí nào trong file CSV.',
    }
  }

  return {
    ok: true,
    nextCostOverrides,
    nextRefOverrides,
    nextCustomCosts,
    stats: {
      matchedWeapons: touchedSlugs.size,
      customEntries,
      overriddenCount,
      resetToDefaultCount,
      unknownRows,
    },
  }
}
