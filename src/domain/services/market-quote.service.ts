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
export const SESSION_OPEN_HOUR = 9
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

/** conversionRates → mid haritası. Baz kod hariç tutulur; mid = 1 / rate. */
export function midsFromRates(
    baseCode: string,
    conversionRates: Record<string, number>
): Record<string, number> {
    const mids: Record<string, number> = {}
    for (const [code, rate] of Object.entries(conversionRates)) {
        if (code === baseCode) continue
        mids[code] = 1 / rate
    }
    return mids
}

/**
 * Snapshot store'u ilerletir — YENİ store döner, persist ETMEZ.
 *  - İlk fetch: current = bugün; previous = null.
 *  - Aynı session + baz: current güncellenir; previous sabit.
 *  - Yeni session (ya da baz değişimi): current → previous'a devrolur; yeni current.
 */
export function rollSnapshots(
    store: SnapshotStore,
    sessionKey: string,
    baseCode: string,
    currentMids: Record<string, number>,
    capturedAt: number = Date.now()
): SnapshotStore {
    const cur = store.current
    const sessionChanged = !cur || cur.sessionKey !== sessionKey || cur.baseCode !== baseCode

    const nextCurrent: Snapshot = { sessionKey, baseCode, mids: currentMids, capturedAt }

    if (sessionChanged) {
        const nextPrevious = cur && cur.baseCode === baseCode ? cur : store.previous
        return { previous: nextPrevious, current: nextCurrent }
    }
    return { previous: store.previous, current: nextCurrent }
}

/** Karşılaştırma tabanını mode'a göre seçer. */
export function pickBaseline(
    mode: ChangeMode,
    snapshots: SnapshotStore,
    prevFetchMids: Record<string, number>,
    baseCode: string
): Record<string, number> | null {
    if (mode === 'fetch') return prevFetchMids
    return snapshots.previous && snapshots.previous.baseCode === baseCode
        ? snapshots.previous.mids
        : null
}

export function computeChange(mid: number, baseMid?: number): number {
    return baseMid && baseMid > 0 ? ((mid - baseMid) / baseMid) * 100 : 0
}

/** mid haritasından tam satırları (spread + change% + sıralı) kurar. */
export function buildQuotes(
    mids: Record<string, number>,
    baseline: Record<string, number> | null,
    nameOf: (code: string) => string,
    spread: number = DEFAULT_SPREAD
): MarketCurrency[] {
    return Object.entries(mids)
        .map(([code, mid]) => ({
            code,
            name: nameOf(code) || code,
            mid,
            buying: mid * (1 - spread),
            selling: mid * (1 + spread),
            change: computeChange(mid, baseline ? baseline[code] : undefined)
        }))
        .sort((a, b) => a.code.localeCompare(b.code))
}

/** Mevcut satırların yalnızca change% değerini yeni tabana göre yeniden hesaplar. */
export function recomputeChanges(
    rows: MarketCurrency[],
    baseline: Record<string, number>
): MarketCurrency[] {
    return rows.map(c => ({ ...c, change: computeChange(c.mid, baseline[c.code]) }))
}

export function isStale(
    lastUpdate: Date | null,
    nextUpdateAt: Date | null,
    now: number = Date.now()
): boolean {
    if (!lastUpdate) return true
    // Sağlayıcı nextUpdateAt verdiyse ve onu geçtiysek → bayat (30dk'dan yeni olsa da).
    if (nextUpdateAt && now > nextUpdateAt.getTime()) return true
    return now - lastUpdate.getTime() > STALE_AFTER_MS
}