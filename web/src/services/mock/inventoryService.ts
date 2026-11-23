import { emptyInventory, inventorySchema, type Inventory } from '@/domain/inventory'
import { fakeLatency, readJSON, writeJSON } from '@/lib/storage'
import type { InventoryService } from '../types'

const key = (userId: string) => `inventory:${userId}`

export const mockInventoryService: InventoryService = {
  async get(userId) {
    await fakeLatency(200)
    const parsed = inventorySchema.safeParse(readJSON<unknown>(key(userId), null))
    return parsed.success ? (parsed.data as Inventory) : emptyInventory()
  },

  async save(userId, inventory) {
    await fakeLatency(150)
    writeJSON(key(userId), inventory)
  },
}
