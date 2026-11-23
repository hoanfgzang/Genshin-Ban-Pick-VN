import { create } from 'zustand'
import { toast } from '@/components/ui/toast'
import type { Inventory } from '@/domain/inventory'
import { emptyInventory } from '@/domain/inventory'
import { inventoryService } from '@/services'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface InventoryState {
  userId: string | null
  inventory: Inventory
  status: 'idle' | 'loading' | 'ready'
  saveState: SaveState
  load: (userId: string) => Promise<void>
  /** Áp dụng hàm cập nhật thuần, tự lưu (debounce). */
  update: (fn: (inv: Inventory) => Inventory) => void
  replace: (inv: Inventory) => void
  reset: () => void
}

const SAVE_DELAY = 500
let saveTimer: ReturnType<typeof setTimeout> | undefined

export const useInventoryStore = create<InventoryState>()((set, get) => {
  const scheduleSave = () => {
    clearTimeout(saveTimer)
    set({ saveState: 'saving' })
    saveTimer = setTimeout(async () => {
      const { userId, inventory } = get()
      if (!userId) return
      try {
        await inventoryService.save(userId, inventory)
        if (get().inventory === inventory) set({ saveState: 'saved' })
      } catch {
        set({ saveState: 'error' })
        toast.error('Không thể lưu dữ liệu kho. Vui lòng thử lại.')
      }
    }, SAVE_DELAY)
  }

  return {
    userId: null,
    inventory: emptyInventory(),
    status: 'idle',
    saveState: 'idle',

    async load(userId) {
      if (get().userId === userId && get().status !== 'idle') return
      clearTimeout(saveTimer)
      set({ userId, status: 'loading', saveState: 'idle' })
      const inventory = await inventoryService.get(userId)
      if (get().userId === userId) set({ inventory, status: 'ready' })
    },

    update(fn) {
      const next = fn(get().inventory)
      if (next === get().inventory) return
      set({ inventory: next })
      scheduleSave()
    },

    replace(inv) {
      set({ inventory: inv })
      scheduleSave()
    },

    reset() {
      clearTimeout(saveTimer)
      set({ userId: null, inventory: emptyInventory(), status: 'idle', saveState: 'idle' })
    },
  }
})
