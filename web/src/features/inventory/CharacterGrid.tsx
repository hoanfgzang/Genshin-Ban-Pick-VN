import type { Character } from '@/domain/character'
import type { Inventory } from '@/domain/inventory'
import { Button } from '@/components/ui/Button'
import { CharacterCard } from './CharacterCard'

interface CharacterGridProps {
  characters: Character[]
  inventory: Inventory
  mode: 'edit' | 'quick'
  onSelect: (character: Character) => void
  onResetFilter?: () => void
}

export function CharacterGrid({
  characters,
  inventory,
  mode,
  onSelect,
  onResetFilter,
}: CharacterGridProps) {
  if (characters.length === 0) {
    return (
      <div className="panel flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <p className="text-sm text-muted">Không tìm thấy nhân vật nào khớp bộ lọc.</p>
        {onResetFilter && (
          <Button size="sm" onClick={onResetFilter}>
            Xóa bộ lọc
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(108px,1fr))] sm:gap-3">
      {characters.map((c) => (
        <CharacterCard
          key={c.slug}
          character={c}
          owned={inventory.characters[c.slug]}
          mode={mode}
          onClick={() => onSelect(c)}
        />
      ))}
    </div>
  )
}
