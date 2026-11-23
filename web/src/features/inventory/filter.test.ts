import { describe, expect, it } from 'vitest'
import { ELEMENTS, WEAPONS, type Character, type Element, type Rarity, type WeaponType } from '@/domain/character'
import { emptyInventory, setConstellation, setLevel, setOwned } from '@/domain/inventory'
import { DEFAULT_FILTER, filterCharacters, filterFromParams, filterToParams } from './filter'

const SAMPLE: Character[] = [
  {
    id: '1',
    slug: 'furina',
    name: 'Furina',
    rarity: 5,
    element: 'hydro',
    weapon: 'sword',
    region: 'fontaine',
    release: '2023-11-08',
    icon: '/characters/furina.png',
  },
  {
    id: '2',
    slug: 'arlecchino',
    name: 'Arlecchino',
    rarity: 5,
    element: 'pyro',
    weapon: 'polearm',
    region: 'snezhnaya',
    release: '2024-04-24',
    icon: '/characters/arlecchino.png',
  },
  {
    id: '3',
    slug: 'bennett',
    name: 'Bennett',
    rarity: 4,
    element: 'pyro',
    weapon: 'sword',
    region: 'mondstadt',
    release: '2020-09-28',
    icon: '/characters/bennett.png',
  },
  {
    id: '4',
    slug: 'traveler-boy',
    name: 'Nhà Lữ Hành (Nam)',
    rarity: 5,
    element: null,
    weapon: 'sword',
    region: 'mainactor',
    release: '2020-09-27',
    icon: '/characters/traveler-boy.png',
  },
]

describe('features/inventory/filter', () => {
  it('lọc theo từ khóa tiếng Việt không dấu, nguyên tố, độ hiếm, vũ khí, sở hữu', () => {
    let inv = emptyInventory()
    inv = setOwned(inv, 'bennett', true)
    inv = setConstellation(inv, 'furina', 2)

    // Tìm không dấu tiếng Việt
    expect(
      filterCharacters(SAMPLE, inv, { ...DEFAULT_FILTER, q: 'nha lu hanh' }).map((c) => c.slug),
    ).toEqual(['traveler-boy'])

    // OR trong nhóm nguyên tố
    expect(
      filterCharacters(SAMPLE, inv, { ...DEFAULT_FILTER, elements: ['pyro', 'hydro'] }).map(
        (c) => c.slug,
      ),
    ).toEqual(['arlecchino', 'furina', 'bennett'])

    // AND giữa nguyên tố + độ hiếm + vũ khí
    expect(
      filterCharacters(SAMPLE, inv, {
        ...DEFAULT_FILTER,
        elements: ['pyro'],
        rarities: [4],
        weapons: ['sword'],
      }).map((c) => c.slug),
    ).toEqual(['bennett'])

    // Lọc sở hữu / chưa sở hữu
    expect(
      filterCharacters(SAMPLE, inv, { ...DEFAULT_FILTER, ownership: 'owned' }).map((c) => c.slug),
    ).toEqual(['furina', 'bennett'])
    expect(
      filterCharacters(SAMPLE, inv, { ...DEFAULT_FILTER, ownership: 'missing' }).map((c) => c.slug),
    ).toEqual(['arlecchino', 'traveler-boy'])
  })

  it('sắp xếp theo độ hiếm, tên, cung mệnh và level', () => {
    let inv = emptyInventory()
    inv = setConstellation(inv, 'bennett', 6)
    inv = setLevel(inv, 'bennett', 100)
    inv = setConstellation(inv, 'furina', 2)
    inv = setLevel(inv, 'furina', 95)

    expect(
      filterCharacters(SAMPLE, inv, { ...DEFAULT_FILTER, sort: 'constellation' }).map(
        (c) => c.slug,
      ),
    ).toEqual(['bennett', 'furina', 'arlecchino', 'traveler-boy'])

    expect(
      filterCharacters(SAMPLE, inv, { ...DEFAULT_FILTER, sort: 'level' }).map((c) => c.slug),
    ).toEqual(['bennett', 'furina', 'arlecchino', 'traveler-boy'])

    expect(
      filterCharacters(SAMPLE, inv, { ...DEFAULT_FILTER, sort: 'name' }).map((c) => c.slug),
    ).toEqual(['arlecchino', 'bennett', 'furina', 'traveler-boy'])
  })

  it('đồng bộ filter với URLSearchParams và bỏ qua giá trị không hợp lệ', () => {
    const filter = {
      q: 'furina',
      elements: ['hydro', 'pyro'] as Element[],
      weapons: ['sword'] as WeaponType[],
      rarities: [5] as Rarity[],
      ownership: 'owned' as const,
      sort: 'level' as const,
    }
    const params = filterToParams(filter)
    expect(params.toString()).toBe('q=furina&el=hydro%2Cpyro&w=sword&r=5&own=owned&sort=level')

    const parsed = filterFromParams(params, { elements: ELEMENTS, weapons: WEAPONS })
    expect(parsed).toEqual(filter)

    const dirty = new URLSearchParams('el=pyro,invalid&r=99&own=hack&sort=nope')
    expect(filterFromParams(dirty, { elements: ELEMENTS, weapons: WEAPONS })).toEqual({
      ...DEFAULT_FILTER,
      elements: ['pyro'],
    })
  })
})
