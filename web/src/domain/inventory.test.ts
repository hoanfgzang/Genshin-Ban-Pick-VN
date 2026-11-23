import { describe, expect, it } from 'vitest'
import {
  bulkSetLevel,
  bulkSetOwned,
  diffInventory,
  emptyInventory,
  exportInventory,
  isOwned,
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
      expect(parsed.inventory.characters).toEqual(inv.characters)
    }
  })

  it('parseInventory lọc bỏ slug lạ và từ chối dữ liệu sai định dạng', () => {
    const validWithUnknown = JSON.stringify({
      version: 1,
      updatedAt: '2026-11-23T00:00:00.000Z',
      characters: {
        furina: { slug: 'furina', constellation: 2, level: 95 },
        ghost: { slug: 'ghost', constellation: 0, level: 90 },
      },
    })
    const okRes = parseInventory(validWithUnknown, new Set(['furina']))
    expect(okRes.ok).toBe(true)
    if (okRes.ok) {
      expect(okRes.unknownSlugs).toEqual(['ghost'])
      expect(Object.keys(okRes.inventory.characters)).toEqual(['furina'])
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
    expect(
      parseInventory(
        JSON.stringify({
          version: 1,
          updatedAt: '',
          characters: { furina: { slug: 'furina', constellation: 0, level: 80 } },
        }),
      ).ok,
    ).toBe(false)
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
})
