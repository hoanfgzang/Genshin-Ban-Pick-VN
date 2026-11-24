import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Segmented } from '@/components/ui/Segmented'
import { toast } from '@/components/ui/toast'
import { CHARACTER_BY_SLUG, CHARACTERS } from '@/domain/characters'
import {
  bulkSetLevel,
  bulkSetOwned,
  diffInventory,
  exportInventory,
  LEVELS,
  parseInventory,
  type Inventory,
  type InventoryDiff,
  type Level,
} from '@/domain/inventory'
import { useInventoryStore } from './inventoryStore'

interface Props {
  mode: 'edit' | 'quick'
  onModeChange: (m: 'edit' | 'quick') => void
  /** slug của các nhân vật đang hiển thị (sau lọc) */
  visibleSlugs: string[]
  username: string
}

const MODE_OPTIONS = [
  { value: 'edit' as const, label: 'Chỉnh sửa', title: 'Bấm thẻ để chỉnh cung mệnh & level' },
  { value: 'quick' as const, label: 'Chọn nhanh', title: 'Bấm thẻ để bật/tắt sở hữu' },
]

const KNOWN_SLUGS = new Set(CHARACTER_BY_SLUG.keys())
const FOUR_STAR_SLUGS = CHARACTERS.filter((c) => c.rarity === 4).map((c) => c.slug)

export function BulkActions({ mode, onModeChange, visibleSlugs, username }: Props) {
  const inventory = useInventoryStore((s) => s.inventory)
  const update = useInventoryStore((s) => s.update)
  const replace = useInventoryStore((s) => s.replace)
  const fileRef = useRef<HTMLInputElement>(null)
  const [levelOpen, setLevelOpen] = useState(false)
  const [level, setLevelValue] = useState<Level>(90)
  const [pending, setPending] = useState<{
    inv: Inventory
    diff: InventoryDiff
    unknown: string[]
    normalizedLevels: number
  } | null>(null)

  const count = visibleSlugs.length
  const ownedVisible = visibleSlugs.filter((s) => inventory.characters[s]).length
  const missingFourStars = FOUR_STAR_SLUGS.filter((s) => !(s in inventory.characters)).length

  const ownAll = () => {
    update((inv) => bulkSetOwned(inv, visibleSlugs, true))
    toast.success(`Đã đánh dấu sở hữu ${count - ownedVisible} nhân vật.`)
  }

  const ownAllFourStars = () => {
    update((inv) => bulkSetOwned(inv, FOUR_STAR_SLUGS, true))
    toast.success(`Đã đánh dấu sở hữu ${missingFourStars} nhân vật 4★.`)
  }

  const unownAll = () => {
    if (!window.confirm(`Bỏ sở hữu ${ownedVisible} nhân vật đang hiển thị? Cung mệnh & level của họ sẽ bị xóa.`)) return
    update((inv) => bulkSetOwned(inv, visibleSlugs, false))
    toast.info(`Đã bỏ sở hữu ${ownedVisible} nhân vật.`)
  }

  const applyLevel = () => {
    update((inv) => bulkSetLevel(inv, visibleSlugs, level))
    setLevelOpen(false)
    toast.success(`Đã đặt Lv ${level} cho ${ownedVisible} nhân vật.`)
  }

  const onExport = () => {
    const blob = new Blob([exportInventory(inventory)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory-${username}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    const result = parseInventory(await file.text(), KNOWN_SLUGS)
    if (fileRef.current) fileRef.current.value = ''
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setPending({
      inv: result.inventory,
      diff: diffInventory(inventory, result.inventory),
      unknown: result.unknownSlugs,
      normalizedLevels: result.normalizedLevels,
    })
  }

  const confirmImport = () => {
    if (!pending) return
    replace({ ...pending.inv, updatedAt: new Date().toISOString() })
    setPending(null)
    toast.success('Đã nhập dữ liệu kho.')
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented label="Chế độ bấm thẻ" size="sm" value={mode} options={MODE_OPTIONS} onChange={onModeChange} />
      <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
      <Button size="sm" onClick={ownAllFourStars} disabled={missingFourStars === 0}>
        Đánh dấu tất cả 4★
      </Button>
      <Button size="sm" onClick={ownAll} disabled={ownedVisible === count}>
        Có tất cả ({count})
      </Button>
      <Button size="sm" onClick={unownAll} disabled={ownedVisible === 0}>
        Bỏ tất cả
      </Button>
      <Button size="sm" onClick={() => setLevelOpen(true)} disabled={ownedVisible === 0}>
        Đặt level…
      </Button>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
          Nhập JSON
        </Button>
        <Button size="sm" variant="ghost" onClick={onExport}>
          Xuất JSON
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Chọn file JSON kho nhân vật"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>

      <Dialog
        open={levelOpen}
        onOpenChange={setLevelOpen}
        title="Đặt level hàng loạt"
        description={`Áp dụng cho ${ownedVisible} nhân vật đã sở hữu đang hiển thị.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLevelOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={applyLevel}>
              Áp dụng
            </Button>
          </>
        }
      >
        <Segmented
          label="Level"
          value={level}
          options={LEVELS.map((n) => ({ value: n, label: `Lv ${n}` }))}
          onChange={setLevelValue}
          className="flex w-full"
        />
      </Dialog>

      <Dialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Nhập dữ liệu kho"
        description="Dữ liệu hiện tại sẽ bị ghi đè hoàn toàn."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={confirmImport}>
              Ghi đè
            </Button>
          </>
        }
      >
        {pending && (
          <ul className="space-y-1.5 text-sm">
            <li>
              Tổng nhân vật trong file: <strong>{Object.keys(pending.inv.characters).length}</strong>
            </li>
            <li className="text-success">+ Thêm mới: {pending.diff.added}</li>
            <li className="text-gold">~ Thay đổi C/Lv: {pending.diff.changed}</li>
            <li className="text-danger">− Bị xóa: {pending.diff.removed}</li>
            {pending.unknown.length > 0 && (
              <li className="text-muted">Bỏ qua {pending.unknown.length} nhân vật không xác định.</li>
            )}
            {pending.normalizedLevels > 0 && (
              <li className="text-muted">
                Quy đổi level về mốc 90/95/100 cho {pending.normalizedLevels} nhân vật.
              </li>
            )}
          </ul>
        )}
      </Dialog>
    </div>
  )
}
