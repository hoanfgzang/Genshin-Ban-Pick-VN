import type { MatchService, MatchState, MatchSummary } from '../types'
import { apiRequest, getAuthToken } from './apiClient'

export const httpMatchService: MatchService = {
  async create(rulesetId, format = 'bo1') {
    return apiRequest<MatchState>('/api/matches', {
      method: 'POST',
      body: JSON.stringify({ rulesetId, format }),
    })
  },

  async get(code) {
    return apiRequest<MatchState>(`/api/matches/${encodeURIComponent(code.trim().toUpperCase())}`)
  },

  async listMyMatches() {
    return apiRequest<MatchSummary[]>('/api/me/matches')
  },

  getWebSocketUrl(code) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = getAuthToken()
    const qs = token ? `?token=${encodeURIComponent(token)}` : ''
    return `${proto}//${window.location.host}/ws/matches/${encodeURIComponent(code.toUpperCase())}${qs}`
  },
}
