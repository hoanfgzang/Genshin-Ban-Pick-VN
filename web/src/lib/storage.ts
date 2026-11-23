/**
 * Wrapper localStorage/sessionStorage có tiền tố + version.
 * Chỉ được dùng bởi tầng services/mock — UI không gọi trực tiếp.
 */
const PREFIX = 'gbp:v1:'

type StorageKind = 'local' | 'session'

function getStorage(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export function readJSON<T>(key: string, fallback: T, kind: StorageKind = 'local'): T {
  const raw = getStorage(kind)?.getItem(PREFIX + key)
  if (raw == null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJSON(key: string, value: unknown, kind: StorageKind = 'local') {
  getStorage(kind)?.setItem(PREFIX + key, JSON.stringify(value))
}

export function removeKey(key: string, kind: StorageKind = 'local') {
  getStorage(kind)?.removeItem(PREFIX + key)
}

/** Giả lập độ trễ mạng để UI có trạng thái loading như thật. */
export function fakeLatency(ms = 300) {
  if (import.meta.env.MODE === 'test') return Promise.resolve()
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
