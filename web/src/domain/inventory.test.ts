import { describe, expect, it } from 'vitest'
import {
  applyTravelerGenderChoice,
  bulkSetLevel,
  bulkSetOwned,
  diffInventory,
  emptyInventory,
  exportInventory,
  getInventoryTravelerGender,
  isOwned,
  normalizeLevel,
  parseInventory,
  setConstellation,
  setLevel,
  setOwned,
  toggleOwned,
} from './inventory'

describe('domain/inventory', () => {
  it('tạo kho rỗng mặc định version 1', () => {
    const inv = emptyInventory()
    expect(inv.version).toBe(1)
    expect(inv.characters).toEqual({})
  })

  it('setOwned và toggleOwned dùng mặc định C0 · Lv90', () => {
    let inv = emptyInventory()
    inv = setOwned(inv, 'furina', true)
    expect(isOwned(inv, 'furina')).toBe(true)
    expect(inv.characters.furina).toEqual({
      slug: 'furina',
      constellation: 0,
      level: 90,
    })

    // Không đổi reference khi giá trị không đổi
    expect(setOwned(inv, 'furina', true)).toBe(inv)

    inv = toggleOwned(inv, 'furina')
    expect(isOwned(inv, 'furina')).toBe(false)
    expect(inv.characters.furina).toBeUndefined()
  })

  it('setConstellation chỉ nhận 0–6 và tự đánh dấu sở hữu', () => {
    const inv = setConstellation(emptyInventory(), 'arlecchino', 2)
    expect(inv.characters.arlecchino).toEqual({
      slug: 'arlecchino',
      constellation: 2,
      level: 90,
    })

    const c6 = setConstellation(inv, 'arlecchino', 6)
    expect(c6.characters.arlecchino.constellation).toBe(6)

    expect(() => setConstellation(inv, 'arlecchino', -1)).toThrow(RangeError)
    expect(() => setConstellation(inv, 'arlecchino', 7)).toThrow(RangeError)
  })

  it('setLevel chỉ nhận 90, 95, 100 và tự đánh dấu sở hữu', () => {
    let inv = setLevel(emptyInventory(), 'bennett', 95)
    expect(inv.characters.bennett).toEqual({
      slug: 'bennett',
      constellation: 0,
      level: 95,
    })

    inv = setLevel(inv, 'bennett', 100)
    expect(inv.characters.bennett.level).toBe(100)

    expect(() => setLevel(inv, 'bennett', 80)).toThrow(RangeError)
    expect(() => setLevel(inv, 'bennett', 91)).toThrow(RangeError)
  })

  it('bulkSetOwned giữ nguyên C/Lv của nhân vật đã sở hữu và trả về cùng reference nếu không đổi', () => {
    let inv = emptyInventory()
    inv = setConstellation(inv, 'bennett', 5)
    inv = setLevel(inv, 'bennett', 95)

    inv = bulkSetOwned(inv, ['bennett', 'xiangling', 'xingqiu'], true)
    expect(inv.characters.bennett).toEqual({ slug: 'bennett', constellation: 5, level: 95 })
    expect(inv.characters.xiangling).toEqual({ slug: 'xiangling', constellation: 0, level: 90 })
    expect(inv.characters.xingqiu).toEqual({ slug: 'xingqiu', constellation: 0, level: 90 })

    expect(bulkSetOwned(inv, ['bennett', 'xiangling'], true)).toBe(inv)

    inv = bulkSetOwned(inv, ['xiangling'], false)
    expect(isOwned(inv, 'xiangling')).toBe(false)
    expect(isOwned(inv, 'bennett')).toBe(true)
  })

  it('bulkSetLevel chỉ áp dụng cho nhân vật đã sở hữu', () => {
    let inv = setOwned(emptyInventory(), 'bennett', true)
    inv = bulkSetLevel(inv, ['bennett', 'furina'], 100)

    expect(inv.characters.bennett.level).toBe(100)
    expect(inv.characters.furina).toBeUndefined()
  })

  it('exportInventory và parseInventory hoạt động khứ hồi', () => {
    let inv = emptyInventory()
    inv = setConstellation(inv, 'furina', 2)
    inv = setLevel(inv, 'furina', 95)
    inv = setOwned(inv, 'traveler-boy', true)

    const known = new Set(['furina', 'traveler-boy'])
    const parsed = parseInventory(exportInventory(inv), known)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.unknownSlugs).toEqual([])
      expect(parsed.normalizedLevels).toBe(0)
      expect(parsed.inventory.characters).toEqual(inv.characters)
    }
  })

  it('normalizeLevel quy đổi level về 3 mốc 90, 95, 100', () => {
    expect(normalizeLevel(1)).toBe(90)
    expect(normalizeLevel(80)).toBe(90)
    expect(normalizeLevel(85)).toBe(90)
    expect(normalizeLevel(90)).toBe(90)
    expect(normalizeLevel(94)).toBe(90)
    expect(normalizeLevel(95)).toBe(95)
    expect(normalizeLevel(99)).toBe(95)
    expect(normalizeLevel(100)).toBe(100)
  })

  it('parseInventory lọc bỏ slug lạ, quy đổi level và từ chối dữ liệu sai định dạng', () => {
    const validWithUnknown = JSON.stringify({
      version: 1,
      updatedAt: '2026-11-23T00:00:00.000Z',
      characters: {
        furina: { slug: 'furina', constellation: 2, level: 95 },
        ghost: { slug: 'ghost', constellation: 0, level: 80 },
      },
    })
    const okRes = parseInventory(validWithUnknown, new Set(['furina']))
    expect(okRes.ok).toBe(true)
    if (okRes.ok) {
      expect(okRes.unknownSlugs).toEqual(['ghost'])
      expect(okRes.normalizedLevels).toBe(0)
      expect(Object.keys(okRes.inventory.characters)).toEqual(['furina'])
    }

    const withRawLevels = JSON.stringify({
      version: 1,
      updatedAt: '2026-11-23T00:00:00.000Z',
      characters: {
        sucrose: { slug: 'sucrose', constellation: 6, level: 80 },
        gorou: { slug: 'gorou', constellation: 6, level: 85 },
        bennett: { slug: 'bennett', constellation: 6, level: 94 },
        yelan: { slug: 'yelan', constellation: 2, level: 96 },
        furina: { slug: 'furina', constellation: 6, level: 100 },
        ghost: { slug: 'ghost', constellation: 0, level: 70 },
      },
    })
    const normRes = parseInventory(
      withRawLevels,
      new Set(['sucrose', 'gorou', 'bennett', 'yelan', 'furina']),
    )
    expect(normRes.ok).toBe(true)
    if (normRes.ok) {
      expect(normRes.unknownSlugs).toEqual(['ghost'])
      expect(normRes.normalizedLevels).toBe(4)
      expect(normRes.inventory.characters.sucrose.level).toBe(90)
      expect(normRes.inventory.characters.gorou.level).toBe(90)
      expect(normRes.inventory.characters.bennett.level).toBe(90)
      expect(normRes.inventory.characters.yelan.level).toBe(95)
      expect(normRes.inventory.characters.furina.level).toBe(100)
    }

    expect(parseInventory('{not json').ok).toBe(false)
    expect(
      parseInventory(JSON.stringify({ version: 2, updatedAt: '', characters: {} })).ok,
    ).toBe(false)
    expect(
      parseInventory(
        JSON.stringify({
          version: 1,
          updatedAt: '',
          characters: { furina: { slug: 'furina', constellation: 7, level: 90 } },
        }),
      ).ok,
    ).toBe(false)
    for (const invalidLevel of [0, -1, 101, 80.5]) {
      expect(
        parseInventory(
          JSON.stringify({
            version: 1,
            updatedAt: '',
            characters: { furina: { slug: 'furina', constellation: 0, level: invalidLevel } },
          }),
        ).ok,
      ).toBe(false)
    }
  })

  it('diffInventory đếm chính xác added, removed, changed', () => {
    let from = emptyInventory()
    from = setOwned(from, 'furina', true)
    from = setOwned(from, 'amber', true)

    let to = emptyInventory()
    to = setConstellation(to, 'furina', 2)
    to = setOwned(to, 'bennett', true)

    expect(diffInventory(from, to)).toEqual({ added: 1, removed: 1, changed: 1 })
  })

  it('chỉ cho phép sở hữu 1 trong 2 Nhà Lữ Hành và giữ C/Lv khi chuyển đổi', () => {
    let inv = emptyInventory()
    inv = setConstellation(inv, 'traveler-boy', 5)
    inv = setLevel(inv, 'traveler-boy', 95)
    expect(isOwned(inv, 'traveler-boy')).toBe(true)
    expect(isOwned(inv, 'traveler-girl')).toBe(false)

    // Bật Nhà Lữ Hành Nữ -> tự tắt Nam và kế thừa C5 Lv95
    inv = setOwned(inv, 'traveler-girl', true)
    expect(isOwned(inv, 'traveler-boy')).toBe(false)
    expect(inv.characters['traveler-girl']).toEqual({
      slug: 'traveler-girl',
      constellation: 5,
      level: 95,
    })

    // bulkSetOwned khi chứa cả Nam & Nữ chỉ giữ 1
    inv = bulkSetOwned(emptyInventory(), ['traveler-boy', 'traveler-girl', 'furina'], true)
    expect(isOwned(inv, 'traveler-boy')).toBe(true)
    expect(isOwned(inv, 'traveler-girl')).toBe(false)
    expect(isOwned(inv, 'furina')).toBe(true)
  })

  it('parseInventory gộp slug chung "traveler" hoặc file cũ chứa cả Nam & Nữ và cho đổi giới tính', () => {
    const genericJson = JSON.stringify({
      version: 1,
      updatedAt: '2026-11-28T00:00:00Z',
      characters: {
        traveler: { slug: 'traveler', constellation: 6, level: 90 },
        furina: { slug: 'furina', constellation: 2, level: 95 },
      },
    })
    const parsed = parseInventory(
      genericJson,
      new Set(['traveler-boy', 'traveler-girl', 'furina']),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.unknownSlugs).toEqual([])
    expect(parsed.travelerImport).toEqual({ constellation: 6, level: 90, source: 'generic' })
    expect(getInventoryTravelerGender(parsed.inventory)).toBe('traveler-boy')

    const switched = applyTravelerGenderChoice(parsed.inventory, 'traveler-girl')
    expect(getInventoryTravelerGender(switched)).toBe('traveler-girl')
    expect(switched.characters['traveler-boy']).toBeUndefined()
    expect(switched.characters['traveler-girl']).toEqual({
      slug: 'traveler-girl',
      constellation: 6,
      level: 90,
    })

    // File cũ chứa cả Nam & Nữ -> tự gộp thành 1
    const bothJson = JSON.stringify({
      version: 1,
      updatedAt: '2026-11-28T00:00:00Z',
      characters: {
        'traveler-boy': { slug: 'traveler-boy', constellation: 1, level: 90 },
        'traveler-girl': { slug: 'traveler-girl', constellation: 6, level: 100 },
      },
    })
    const parsedBoth = parseInventory(bothJson, new Set(['traveler-boy', 'traveler-girl']))
    expect(parsedBoth.ok).toBe(true)
    if (!parsedBoth.ok) return
    expect(parsedBoth.travelerImport).toEqual({ constellation: 6, level: 100, source: 'both' })
    expect(Object.keys(parsedBoth.inventory.characters)).toHaveLength(1)
  })
})
