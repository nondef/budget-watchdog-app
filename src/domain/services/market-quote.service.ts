export type ChangeMode = 'session' | 'fetch'

export interface Snapshot {
    sessionKey: string // "2026-05-20T09:00" — session start timestamp
    baseCode: string
    mids: Record<string, number>
    capturedAt: number // ms
}

export interface SnapshotStore {
    previous: Snapshot | null
    current: Snapshot | null
}

export interface MarketCurrency {
    code: string
    name: string
    mid: number
    buying: number
    selling: number
    change: number
}

// Turkey market open hour (local). Session runs from 09:00 to next day 09:00.
const SESSION_OPEN_HOUR = 9

export const DEFAULT_SPREAD = 0.015
export const STALE_AFTER_MS = 30 * 60 * 1000

/**
 * ISO-ish key of the *current* session's open moment. If now is before 09:00,
 * the active session opened yesterday at 09:00.
 */
export function currentSessionKey(now: Date = new Date()): string {
    const sessionStart = new Date(now)
    sessionStart.setHours(SESSION_OPEN_HOUR, 0, 0, 0)
    if (now.getHours() < SESSION_OPEN_HOUR) {
        sessionStart.setDate(sessionStart.getDate() - 1)
    }
    const y = sessionStart.getFullYear()
    const m = String(sessionStart.getMonth() + 1).padStart(2, '0')
    const d = String(sessionStart.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}T${String(SESSION_OPEN_HOUR).padStart(2, '0')}:00`
}
