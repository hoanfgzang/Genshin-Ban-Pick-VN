import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/ui/Spinner'
import type { Character } from '@/domain/character'
import { CHARACTERS } from '@/domain/characters'
import { toggleOwned } from '@/domain/inventory'
import { useAuthStore } from '@/features/auth/authStore'
import { BulkActions } from '@/features/inventory/BulkActions'
import { CharacterEditor } from '@/features/inventory/CharacterEditor'
import { CharacterGrid } from '@/features/inventory/CharacterGrid'
import { InventoryFilters } from '@/features/inventory/InventoryFilters'
import { useInventoryStore } from '@/features/inventory/inventoryStore'
import { InventorySummary } from '@/features/inventory/InventorySummary'
import { useFilteredCharacters } from '@/features/inventory/useFilteredCharacters'

export function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const inventory = useInventoryStore((s) => s.inventory)
  const status = useInventoryStore((s) => s.status)
  const saveState = useInventoryStore((s) => s.saveState)
  const load = useInventoryStore((s) => s.load)
  const update = useInventoryStore((s) => s.update)

  const [mode, setMode] = useState<'edit' | 'quick'>('edit')
  const [editingSlug, setEditingSlug] = useState<string | null>(null)

  useEffect(() => {
    if (user?.id) void load(user.id)
  }, [user?.id, load])

  const { filter, setFilter, resetFilter, characters, isFiltered } = useFilteredCharacters(inventory)

  const visibleSlugs = useMemo(() => characters.map((c) => c.slug), [characters])
  const editingIndex = editingSlug ? characters.findIndex((c) => c.slug === editingSlug) : -1
  const editingCharacter = editingIndex >= 0 ? characters[editingIndex] : null

  if (!user) return null
  if (status !== 'ready') return <FullPageSpinner label="Đang tải kho nhân vật…" />

  const ownedCount = Object.keys(inventory.characters).length

  const handleSelect = (c: Character) => {
    if (mode === 'quick') {
      update((inv) => toggleOwned(inv, c.slug))
      return
    }
    setEditingSlug(c.slug)
  }

  return (
    <div className="flex flex-col gap-5">
      <InventorySummary user={user} inventory={inventory} saveState={saveState} />

      {ownedCount === 0 && (
        <div className="panel flex flex-wrap items-center justify-between gap-3 border-gold/30 bg-gold/5 px-4 py-3 text-sm">
          <p className="text-text/90">
            Kho nhân vật của bạn đang trống. Bật chế độ <strong>Chọn nhanh</strong> để tích nhanh hoặc dùng{' '}
            <strong>Đánh dấu tất cả 4★</strong>.
          </p>
          {mode !== 'quick' && (
            <Button size="sm" variant="primary" onClick={() => setMode('quick')}>
              Bật Chọn nhanh
            </Button>
          )}
        </div>
      )}

      <section className="panel flex flex-col gap-4 p-4" aria-label="Bộ lọc và thao tác kho">
        <InventoryFilters filter={filter} onChange={setFilter} />
        <div className="h-px bg-line/70" />
        <BulkActions
          mode={mode}
          onModeChange={setMode}
          visibleSlugs={visibleSlugs}
          username={user.username}
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          Đang hiển thị <strong className="text-text">{characters.length}</strong> / {CHARACTERS.length} nhân vật
        </span>
        <span>
          {mode === 'quick'
            ? 'Chế độ Chọn nhanh: bấm thẻ để bật/tắt sở hữu (mặc định C0 · Lv 90).'
            : 'Chế độ Chỉnh sửa: bấm thẻ để chỉnh cung mệnh (C0–C6) và level (90/95/100).'}
        </span>
      </div>

      <CharacterGrid
        characters={characters}
        inventory={inventory}
        mode={mode}
        onSelect={handleSelect}
        onResetFilter={isFiltered ? resetFilter : undefined}
      />

      <CharacterEditor
        character={editingCharacter}
        onClose={() => setEditingSlug(null)}
        onPrev={editingIndex > 0 ? () => setEditingSlug(characters[editingIndex - 1].slug) : undefined}
        onNext={
          editingIndex >= 0 && editingIndex < characters.length - 1
            ? () => setEditingSlug(characters[editingIndex + 1].slug)
            : undefined
        }
      />
    </div>
  )
}
