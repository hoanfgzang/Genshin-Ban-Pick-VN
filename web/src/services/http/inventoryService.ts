import type { Inventory } from '@/domain/inventory'
import { mockInventoryService } from '../mock/inventoryService'
import type { InventoryService } from '../types'
import { apiRequest } from './apiClient'

export const httpInventoryService: InventoryService = {
  async get(userId) {
    if (userId === 'guest') {
      return mockInventoryService.get('guest')
    }
    return apiRequest<Inventory>('/api/me/inventory')
  },

  async save(userId, inventory) {
    if (userId === 'guest') {
      return mockInventoryService.save('guest', inventory)
    }
    await apiRequest<Inventory>('/api/me/inventory', {
      method: 'PUT',
      body: JSON.stringify(inventory),
    })
  },
}
