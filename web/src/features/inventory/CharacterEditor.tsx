import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { ElementIcon } from '@/components/ui/ElementIcon'
import { Segmented } from '@/components/ui/Segmented'
import { ELEMENT_LABEL, WEAPON_LABEL, type Character } from '@/domain/character'
import {
  CONSTELLATIONS,
  LEVELS,
  setConstellation,
  setLevel,
  setOwned,
} from '@/domain/inventory'
import { isTravelerGenderSlug } from '@/domain/traveler'
import { cn } from '@/lib/cn'
import { useInventoryStore } from './inventoryStore'

interface CharacterEditorProps {
  character: Character | null
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
}

const C_OPTIONS = CONSTELLATIONS.map((n) => ({ value: n, label: `C${n}` }))
const LV_OPTIONS = LEVELS.map((n) => ({ value: n, label: `Lv ${n}` }))

export function CharacterEditor({ character, onClose, onPrev, onNext }: CharacterEditorProps) {
  const owned = useInventoryStore((s) => (character ? s.inventory.characters[character.slug] : undefined))
  const update = useInventoryStore((s) => s.update)

  // Phím tắt: 0–6 chọn cung mệnh, ←/→ chuyển nhân vật
  useEffect(() => {
    if (!character) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return
      if (/^[0-6]$/.test(e.key)) {
        update((inv) => setConstellation(inv, character.slug, Number(e.key)))
      } else if (e.key === 'ArrowLeft' && onPrev) {
        e.preventDefault()
        onPrev()
      } else if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [character, update, onPrev, onNext])

  if (!character) return null
  const c = character

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={c.name}
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-gold">{'★'.repeat(c.rarity)}</span>
          {c.element && (
            <span className="inline-flex items-center gap-1.5">
              <ElementIcon element={c.element} className="size-3.5" />
              {ELEMENT_LABEL[c.element]}
            </span>
          )}
          <span>· {WEAPON_LABEL[c.weapon]}</span>
        </span>
      }
      footer={
        <>
          <div className="mr-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={onPrev} disabled={!onPrev} aria-label="Nhân vật trước">
              ←
            </Button>
            <Button size="sm" variant="ghost" onClick={onNext} disabled={!onNext} aria-label="Nhân vật sau">
              →
            </Button>
          </div>
          <Button variant="primary" onClick={onClose}>
            Xong
          </Button>
        </>
      }
    >
      <div className="flex gap-4">
        <div
          className={cn(
            'size-24 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br',
            c.rarity === 5 ? 'from-r5-from to-r5-to' : 'from-r4-from to-r4-to',
            !owned && 'opacity-40 grayscale',
          )}
        >
          <img src={c.icon} alt="" className="size-full object-cover" />
        </div>
        <div className="flex flex-1 flex-col justify-center gap-2">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-bg/50 px-3 py-2.5">
            <span className="text-sm font-medium">Đã sở hữu</span>
            <input
              type="checkbox"
              role="switch"
              checked={!!owned}
              onChange={(e) => update((inv) => setOwned(inv, c.slug, e.target.checked))}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="relative h-6 w-11 rounded-full bg-line transition peer-checked:bg-gold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-text after:transition peer-checked:after:translate-x-5"
            />
          </label>
          <p className="text-xs text-muted">Chọn cung mệnh hoặc level sẽ tự đánh dấu sở hữu.</p>
          {isTravelerGenderSlug(c.slug) && (
            <p className="rounded border border-gold/30 bg-gold/5 px-2.5 py-1.5 text-[11px] text-gold-strong">
              Kho chỉ sở hữu 1 trong 2 Nhà Lữ Hành (Nam hoặc Nữ). Bật hoặc chỉnh sẽ tự chuyển C/Lv từ nhân vật còn lại.
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Cung mệnh</h3>
            <span className="text-xs text-muted">Phím tắt 0–6</span>
          </div>
          <Segmented
            label="Cung mệnh"
            value={owned?.constellation ?? null}
            options={C_OPTIONS}
            onChange={(v) => update((inv) => setConstellation(inv, c.slug, v))}
            className="flex w-full"
          />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Level</h3>
          <Segmented
            label="Level"
            value={owned?.level ?? null}
            options={LV_OPTIONS}
            onChange={(v) => update((inv) => setLevel(inv, c.slug, v))}
            className="flex w-full"
          />
        </div>
      </div>
    </Dialog>
  )
}
