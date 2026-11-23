/// <reference types="node" />
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CHARACTER_BY_SLUG, CHARACTERS } from './characters'

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../public')

describe('domain/characters', () => {
  it('có hơn 100 nhân vật với slug duy nhất', () => {
    expect(CHARACTERS.length).toBeGreaterThan(100)
    const slugs = new Set(CHARACTERS.map((c) => c.slug))
    expect(slugs.size).toBe(CHARACTERS.length)
  })

  it('chỉ giữ 2 mục Nhà Lữ Hành Nam và Nữ, không có biến thể nguyên tố', () => {
    const boy = CHARACTER_BY_SLUG.get('traveler-boy')
    const girl = CHARACTER_BY_SLUG.get('traveler-girl')
    expect(boy).toBeDefined()
    expect(girl).toBeDefined()
    expect(boy?.element).toBeNull()
    expect(girl?.element).toBeNull()

    const extraTravelers = CHARACTERS.filter(
      (c) =>
        (c.slug.includes('traveler') || c.name.includes('Traveler')) &&
        c.slug !== 'traveler-boy' &&
        c.slug !== 'traveler-girl',
    )
    expect(extraTravelers).toEqual([])
  })

  it('mọi đường dẫn icon đều tồn tại file ảnh thật trong public/characters', () => {
    const missing = CHARACTERS.filter((c) => {
      const iconPath = resolve(PUBLIC_DIR, c.icon.replace(/^\//, ''))
      return !existsSync(iconPath)
    })
    expect(missing).toEqual([])
  })
})
