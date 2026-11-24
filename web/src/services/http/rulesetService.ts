import type { RuleSet } from '@/domain/ruleset'
import type { RuleSetService, RuleSetUpsertInput } from '../types'
import { apiRequest } from './apiClient'

export const httpRuleSetService: RuleSetService = {
  async list(activeOnly = false) {
    const qs = activeOnly ? '?activeOnly=true' : ''
    return apiRequest<RuleSet[]>(`/api/rulesets${qs}`)
  },

  async get(id) {
    return apiRequest<RuleSet>(`/api/rulesets/${encodeURIComponent(id)}`)
  },

  async create(input: RuleSetUpsertInput) {
    return apiRequest<RuleSet>('/api/rulesets', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  async update(id: string, input: RuleSetUpsertInput) {
    return apiRequest<RuleSet>(`/api/rulesets/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
  },

  async remove(id: string) {
    await apiRequest<{ ok: boolean }>(`/api/rulesets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
