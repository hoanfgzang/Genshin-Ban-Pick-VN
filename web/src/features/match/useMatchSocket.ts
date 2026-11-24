import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/components/ui/toast'
import { matchService, type MatchState } from '@/services'

interface WsMessage {
  type: 'match:state' | 'match:error' | 'pong'
  state?: MatchState
  code?: string
  message?: string
}

export function useMatchSocket(code: string | undefined) {
  const [state, setState] = useState<MatchState | null>(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!code) return
    let active = true
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let pingTimer: ReturnType<typeof setInterval> | undefined

    const loadInitialAndConnect = async () => {
      try {
        const initial = await matchService.get(code)
        if (!active) return
        setState(initial)
        setNotFound(false)
      } catch {
        if (!active) return
        setNotFound(true)
        setLoading(false)
        return
      }
      setLoading(false)

      const connect = () => {
        if (!active) return
        const ws = new WebSocket(matchService.getWebSocketUrl(code))
        wsRef.current = ws

        ws.onopen = () => {
          if (!active) return
          setConnected(true)
          clearInterval(pingTimer)
          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ action: 'ping' }))
            }
          }, 25000)
        }

        ws.onmessage = (ev) => {
          if (!active) return
          try {
            const msg = JSON.parse(String(ev.data)) as WsMessage
            if (msg.type === 'match:state' && msg.state) {
              setState(msg.state)
            } else if (msg.type === 'match:error' && msg.message) {
              toast.error(msg.message)
            }
          } catch {
            // ignore malformed frames
          }
        }

        ws.onclose = () => {
          if (!active) return
          setConnected(false)
          clearInterval(pingTimer)
          reconnectTimer = setTimeout(connect, 1500)
        }
      }

      connect()
    }

    void loadInitialAndConnect()

    return () => {
      active = false
      clearTimeout(reconnectTimer)
      clearInterval(pingTimer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [code])

  const sendAction = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('Mất kết nối phòng đấu, đang kết nối lại…')
      return
    }
    ws.send(JSON.stringify(payload))
  }, [])

  return { state, loading, connected, notFound, sendAction }
}

export function useCountdownSeconds(deadlineIso: string | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(() => {
    if (!deadlineIso) return null
    return Math.max(0, Math.ceil((new Date(deadlineIso).getTime() - Date.now()) / 1000))
  })

  useEffect(() => {
    if (!deadlineIso) {
      const id = setTimeout(() => setRemaining(null), 0)
      return () => clearTimeout(id)
    }
    const target = new Date(deadlineIso).getTime()
    const update = () => {
      setRemaining(Math.max(0, Math.ceil((target - Date.now()) / 1000)))
    }
    const initTimer = setTimeout(update, 0)
    const interval = setInterval(update, 250)
    return () => {
      clearTimeout(initTimer)
      clearInterval(interval)
    }
  }, [deadlineIso])

  return remaining
}
