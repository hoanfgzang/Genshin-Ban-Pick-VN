import { describe, expect, it } from 'vitest'
import { ELEMENTS } from './character'
import { CHARACTER_BY_SLUG, CHARACTERS, COST_CHARACTER_BY_SLUG, COST_CHARACTERS } from './characters'
import {
  getOppositeTravelerGenderSlug,
  getOwnedTraveler,
  getTravelerElement,
  getTravelerElementSlug,
  isAnyTravelerSlug,
  isTravelerElementSlug,
  isTravelerGenderSlug,
  resolveCharacterForOwned,
  TRAVELER_ELEMENT_CHARACTERS,
  TRAVELER_ELEMENT_SLUGS,
} from './traveler'

describe('domain/traveler', () => {
  it('tạo đủ 7 biến thể Nhà Lữ Hành theo 7 hệ và đồng bộ danh sách Cost', () => {
    expect(TRAVELER_ELEMENT_CHARACTERS).toHaveLength(7)
    expect(TRAVELER_ELEMENT_SLUGS).toHaveLength(7)

    for (const el of ELEMENTS) {
      const slug = getTravelerElementSlug(el)
      expect(isTravelerElementSlug(slug)).toBe(true)
      expect(getTravelerElement(slug)).toBe(el)
      expect(CHARACTER_BY_SLUG.get(slug)?.element).toBe(el)
      expect(COST_CHARACTER_BY_SLUG.get(slug)?.element).toBe(el)
    }

    // COST_CHARACTERS chứa 7 biến thể hệ, không chứa traveler-boy / traveler-girl
    expect(COST_CHARACTERS.some((c) => isTravelerGenderSlug(c.slug))).toBe(false)
    expect(COST_CHARACTERS.filter((c) => isTravelerElementSlug(c.slug))).toHaveLength(7)
    expect(COST_CHARACTERS.length).toBe(CHARACTERS.length - 2 + 7)
  })

  it('nhận diện slug và hiển thị ảnh Nam/Nữ theo kho người chơi sở hữu', () => {
    expect(isTravelerGenderSlug('traveler-boy')).toBe(true)
    expect(isTravelerGenderSlug('traveler-girl')).toBe(true)
    expect(isTravelerGenderSlug('traveler-pyro')).toBe(false)
    expect(isAnyTravelerSlug('traveler')).toBe(true)
    expect(isAnyTravelerSlug('traveler-dendro')).toBe(true)
    expect(getOppositeTravelerGenderSlug('traveler-boy')).toBe('traveler-girl')
    expect(getOppositeTravelerGenderSlug('traveler-girl')).toBe('traveler-boy')

    const ownedGirl = {
      'traveler-girl': { slug: 'traveler-girl', constellation: 6, level: 95 },
    }
    expect(getOwnedTraveler(ownedGirl)?.slug).toBe('traveler-girl')

    const resolved = resolveCharacterForOwned('traveler-pyro', ownedGirl)
    expect(resolved?.name).toBe('Nhà Lữ Hành (Hỏa)')
    expect(resolved?.element).toBe('pyro')
    expect(resolved?.icon).toBe('/characters/traveler-girl.png')
    expect(resolved?.card).toBe('/character_cards/traveler-girl.webp')
  })
})
