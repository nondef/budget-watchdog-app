import type { ChangeMode, Snapshot, SnapshotStore } from '@/domain/services/market-quote.service'

const FAVORITES_KEY = 'market.favorites.v1'
const SNAPSHOTS_KEY = 'market.snapshots.v1'
const MODE_KEY = 'market.changeMode.v1'
const DEFAULT_FAVORITES = ['USD', 'EUR', 'GBP']

const isSnapshot = (v: unknown): v is Snapshot =>
    !!v && typeof v === 'object' &&
    typeof (v as Snapshot).sessionKey === 'string' &&
    typeof (v as Snapshot).baseCode === 'string' &&
    typeof (v as Snapshot).capturedAt === 'number' &&
    !!(v as Snapshot).mids && typeof (v as Snapshot).mids === 'object'

export const marketStorage = {
    loadSnapshots(): SnapshotStore {
        try {
            const raw = localStorage.getItem(SNAPSHOTS_KEY)
            if (!raw) return { previous: null, current: null }
            const parsed = JSON.parse(raw)
            return {
                previous: isSnapshot(parsed?.previous) ? parsed.previous : null,
                current: isSnapshot(parsed?.current) ? parsed.current : null
            }
        } catch {
            return { previous: null, current: null }
        }
    },

    saveSnapshots(s: SnapshotStore): void {
        try {
            localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(s))
        } catch {
            // ignore
        }
    },

    loadFavorites(): string[] {
        try {
            const raw = localStorage.getItem(FAVORITES_KEY)
            if (!raw) return [...DEFAULT_FAVORITES]
            const parsed = JSON.parse(raw)
            return Array.isArray(parsed)
                ? parsed.filter((c): c is string => typeof c === 'string')
                : [...DEFAULT_FAVORITES]
        } catch {
            return [...DEFAULT_FAVORITES]
        }
    },

    saveFavorites(codes: string[]): void {
        try {
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(codes))
        } catch {
            // ignore
        }
    },

    loadMode(): ChangeMode {
        try {
            return localStorage.getItem(MODE_KEY) === 'fetch' ? 'fetch' : 'session'
        } catch {
            return 'session'
        }
    },

    saveMode(mode: ChangeMode): void {
        try {
            localStorage.setItem(MODE_KEY, mode)
        } catch {
            // ignore
        }
    }
}