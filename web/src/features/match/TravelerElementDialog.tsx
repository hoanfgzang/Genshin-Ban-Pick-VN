import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { ElementIcon } from '@/components/ui/ElementIcon'
import { ELEMENT_LABEL, ELEMENTS } from '@/domain/character'
import { calcCharacterCost, formatCost, getCharacterCustomCosts } from '@/domain/cost'
import type { CostRules } from '@/domain/ruleset'
import {
  getTravelerElementSlug,
  isTravelerElementSlug,
  resolveTravelerMedia,
  TRAVELER_ELEMENT_CHARACTERS,
  type TravelerElementSlug,
  type TravelerGenderSlug,
} from '@/domain/traveler'
import { cn } from '@/lib/cn'

interface Props {
  open: boolean
  action: 'ban' | 'pick'
  genderSlug: TravelerGenderSlug
  constellation: number | null
  costRules: CostRules
  bannedSet: ReadonlySet<string>
  allPickedSet: ReadonlySet<string>
  lockedByPriorGame: ReadonlyMap<string, number>
  allowDuplicatePick: boolean
  sideHasPickedTraveler: boolean
  currentSelectedSlug: string | null
  autoSubmit: boolean
  onSelectElement: (slug: TravelerElementSlug) => void
  onConfirmElement: (slug: TravelerElementSlug) => void
  onClearSelection?: () => void
  onClose: () => void
}

export function TravelerElementDialog({
  open,
  action,
  genderSlug,
  constellation,
  costRules,
  bannedSet,
  allPickedSet,
  lockedByPriorGame,
  allowDuplicatePick,
  sideHasPickedTraveler,
  currentSelectedSlug,
  autoSubmit,
  onSelectElement,
  onConfirmElement,
  onClearSelection,
  onClose,
}: Props) {
  const media = resolveTravelerMedia(genderSlug)
  const isBan = action === 'ban'

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => !nextOpen && onClose()}
      title={isBan ? 'Chọn hệ Nhà Lữ Hành muốn Ban' : 'Chọn hệ Nhà Lữ Hành muốn Pick'}
      description={
        isBan
          ? 'Chỉ cấm đúng nguyên tố đã chọn; 6 nguyên tố còn lại vẫn có thể Ban hoặc Pick.'
          : sideHasPickedTraveler
            ? 'Đội của bạn đã Pick Nhà Lữ Hành trong ván này rồi.'
            : 'Mỗi bên được Pick tối đa 1 Nhà Lữ Hành mỗi ván. Hai đội có thể cùng Pick Nhà Lữ Hành nếu khác hệ.'
      }
      className="max-w-2xl"
      footer={
        <>
          {currentSelectedSlug && isTravelerElementSlug(currentSelectedSlug) && onClearSelection && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onClearSelection()
                onClose()
              }}
            >
              Bỏ chọn
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {ELEMENTS.map((el, idx) => {
          const elSlug = getTravelerElementSlug(el)
          const elChar = TRAVELER_ELEMENT_CHARACTERS[idx]
          const isBanned = bannedSet.has(elSlug)
          const isPicked = allPickedSet.has(elSlug)
          const lockedInGame = lockedByPriorGame.get(elSlug) ?? null
          const isSelected = currentSelectedSlug === elSlug

          const selectable = isBan
            ? !isBanned && !isPicked
            : !sideHasPickedTraveler &&
              !isBanned &&
              lockedInGame === null &&
              (allowDuplicatePick || !isPicked)

          const customCosts = getCharacterCustomCosts(elSlug, costRules)
          const costPreview =
            constellation !== null ? calcCharacterCost(elSlug, constellation, costRules) : null

          return (
            <button
              key={elSlug}
              type="button"
              disabled={!selectable}
              onClick={() => {
                if (!selectable) return
                if (autoSubmit) {
                  onConfirmElement(elSlug)
                } else {
                  onSelectElement(elSlug)
                }
                onClose()
              }}
              onDoubleClick={() => {
                if (!selectable) return
                onConfirmElement(elSlug)
                onClose()
              }}
              className={cn(
                'group relative flex flex-col overflow-hidden rounded-xl border text-left transition',
                selectable
                  ? 'cursor-pointer hover:-translate-y-0.5 hover:border-gold-strong'
                  : 'cursor-not-allowed opacity-45 grayscale',
                isSelected ? 'border-gold-strong ring-2 ring-gold-strong' : 'border-line bg-bg/60',
              )}
            >
              <div className="relative flex items-center gap-2.5 bg-gradient-to-br from-r5-from/85 to-r5-to/90 p-2.5">
                <img
                  src={media.icon}
                  alt={elChar?.name ?? ELEMENT_LABEL[el]}
                  className="size-11 shrink-0 rounded-lg border border-white/20 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <ElementIcon element={el} className="size-4 shrink-0" />
                    <span className="truncate text-sm font-extrabold text-white">
                      {ELEMENT_LABEL[el]}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                    {costPreview !== null && (
                      <span className="rounded bg-black/75 px-1.5 py-0.5 font-mono font-bold text-gold-strong">
                        {costPreview > 0 ? `+${formatCost(costPreview)} cost` : '0 cost'}
                      </span>
                    )}
                    {customCosts.length > 0 && (
                      <span className="rounded bg-hydro px-1 py-0.5 text-[9px] font-black text-bg">
                        ĐK
                      </span>
                    )}
                  </div>
                </div>

                {isBanned && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/65 text-xs font-black text-danger">
                    BAN
                  </span>
                )}
                {isPicked && !isBanned && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-black text-gold-strong">
                    PICK
                  </span>
                )}
                {lockedInGame !== null && !isBanned && !isPicked && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/65 text-xs font-black text-gold">
                    VÁN {lockedInGame}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </Dialog>
  )
}
