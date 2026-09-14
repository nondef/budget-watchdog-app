import { defineStore } from "pinia"
import { computed, ref } from "vue"
import { financialService } from "@/infrastructure/services/financial"
import { ExchangeRateCooldownError } from "@/infrastructure/services/financial/types"
import { useAppStore } from "@/stores/app"
import { useCurrenciesStore } from "@/stores/currencies"
import { i18n } from "@/i18n"
import {
    ChangeMode, currentSessionKey, DEFAULT_SPREAD,
    MarketCurrency,
    Snapshot,
    SnapshotStore,
    STALE_AFTER_MS
} from "@/domain/services/market-quote.service";
import { marketStorage } from "@/infrastructure/services/market/market-storage";

export type MarketSegment = 'fiat' | 'metal' | 'crypto'

// Store'un public API'sinde geçen domain tipleri buradan da erişilebilsin:
// tüketiciler (FinancialIndicatorsPage) store ile birlikte tek yerden alsın.
export type { ChangeMode, MarketCurrency }

export const useMarketStore = defineStore('market', () => {
    const segment = ref<MarketSegment>('fiat')
    const changeMode = ref<ChangeMode>(marketStorage.loadMode())
    const fiat = ref<MarketCurrency[]>([])
    const metal = ref<MarketCurrency[]>([])
    const crypto = ref<MarketCurrency[]>([])

    const isLoading = ref(false)
    const lastUpdate = ref<Date | null>(null)
    const nextUpdateAt = ref<Date | null>(null)
    const error = ref<string | null>(null)
    const canRefresh = ref(true)
    const refreshCountdown = ref(0)
    const favorites = ref<string[]>(marketStorage.loadFavorites())

    let countdownTimer: ReturnType<typeof setInterval> | null = null
    let snapshots: SnapshotStore = marketStorage.loadSnapshots()
    // In-memory "previous fetch" snapshot for ChangeMode = 'fetch'.
    const prevFetchMids = new Map<string, number>()

    const visibleCurrencies = computed<MarketCurrency[]>(() => {
        switch (segment.value) {
            case 'metal': return metal.value
            case 'crypto': return crypto.value
            default: return fiat.value
        }
    })

    const favoriteCurrencies = computed<MarketCurrency[]>(() =>
        favorites.value
            .map(code => fiat.value.find(c => c.code === code))
            .filter((c): c is MarketCurrency => !!c)
    )

    const isDataStale = computed(() => {
        if (!lastUpdate.value) return true
        // If provider gave us nextUpdateAt and we're past it → stale, even if <30min old.
        if (nextUpdateAt.value && Date.now() > nextUpdateAt.value.getTime()) {
            return true
        }
        return Date.now() - lastUpdate.value.getTime() > STALE_AFTER_MS
    })

    const lastUpdateLabel = computed(() =>
        lastUpdate.value
            ? lastUpdate.value.toLocaleString(i18n.global.locale.value, { dateStyle: 'short', timeStyle: 'short' })
            : null
    )

    const updateRefreshStatus = () => {
        canRefresh.value = financialService.canRefresh()
        refreshCountdown.value = financialService.getTimeUntilNextRefresh()
    }

    const startRefreshTimer = () => {
        if (countdownTimer) return
        updateRefreshStatus()
        countdownTimer = setInterval(updateRefreshStatus, 1000)
    }

    const stopRefreshTimer = () => {
        if (countdownTimer) {
            clearInterval(countdownTimer)
            countdownTimer = null
        }
    }

    /**
     * Roll snapshot store *before* computing change% so the baseline used
     * is always the previous session (not today's first fetch).
     *
     * Rules:
     *  - First ever fetch: current = today; previous = null. Change% = 0.
     *  - Same session, same base: current updated to latest mids; previous unchanged.
     *  - New session (or base change): demote current → previous; create fresh current.
     */
    const rollSnapshots = (
        sessionKey: string,
        baseCode: string,
        currentMids: Record<string, number>
    ) => {
        const cur = snapshots.current
        const sessionChanged = !cur || cur.sessionKey !== sessionKey || cur.baseCode !== baseCode

        const nextCurrent: Snapshot = {
            sessionKey,
            baseCode,
            mids: currentMids,
            capturedAt: Date.now()
        }

        if (sessionChanged) {
            // Demote existing current (if any & matching base) to previous baseline.
            const nextPrevious =
                cur && cur.baseCode === baseCode ? cur : snapshots.previous
            snapshots = { previous: nextPrevious, current: nextCurrent }
        } else {
            snapshots = { previous: snapshots.previous, current: nextCurrent }
        }

        marketStorage.saveSnapshots(snapshots)
    }

    const normalize = (
        baseCode: string,
        conversionRates: Record<string, number>,
        nameOf: (code: string) => string
    ): MarketCurrency[] => {
        const sessionKey = currentSessionKey()
        const currentMids: Record<string, number> = {}

        for (const [code, rate] of Object.entries(conversionRates)) {
            if (code === baseCode) continue
            currentMids[code] = 1 / rate
        }

        // Roll first so `previous` reflects yesterday/last-session by the time we compare.
        rollSnapshots(sessionKey, baseCode, currentMids)

        // Decide which baseline mids to compare against, based on mode.
        const baselineMids: Record<string, number> | null =
            changeMode.value === 'fetch'
                ? Object.fromEntries(prevFetchMids)
                : snapshots.previous && snapshots.previous.baseCode === baseCode
                    ? snapshots.previous.mids
                    : null

        const rows = Object.entries(currentMids)
            .map(([code, mid]) => {
                const baseMid = baselineMids ? baselineMids[code] : undefined
                const change = baseMid && baseMid > 0 ? ((mid - baseMid) / baseMid) * 100 : 0

                return {
                    code,
                    name: nameOf(code) || code,
                    mid,
                    buying: mid * (1 - DEFAULT_SPREAD),
                    selling: mid * (1 + DEFAULT_SPREAD),
                    change
                }
            })
            .sort((a, b) => a.code.localeCompare(b.code))

        // Update the in-memory "previous fetch" snapshot for the 'fetch' mode.
        for (const [code, mid] of Object.entries(currentMids)) {
            prevFetchMids.set(code, mid)
        }

        return rows
    }

    const fetchCurrencies = async (force = false) => {
        if (isLoading.value) return

        isLoading.value = true
        error.value = null

        try {
            const appStore = useAppStore()
            const currenciesStore = useCurrenciesStore()
            const baseCode = appStore.baseCurrency?.code ?? 'USD'

            if (!currenciesStore.currencies.length) {
                await currenciesStore.loadCurrencies()
            }

            const data = force
                ? await financialService.refresh(baseCode)
                : await financialService.getExchangeRateData(baseCode)

            if (!data) {
                throw new Error(i18n.global.t('exchangeRates.dataUnavailable'))
            }

            const nameOf = (code: string) =>
                currenciesStore.currencies.find(c => c.code === code)?.name ?? code

            fiat.value = normalize(baseCode, data.conversionRates, nameOf)
            lastUpdate.value = data.fetchedAt
            nextUpdateAt.value = data.nextUpdateAt
        } catch (err) {
            if (err instanceof ExchangeRateCooldownError) {
                error.value = i18n.global.t('exchangeRates.cooldown', { seconds: err.remainingSeconds })
            } else {
                error.value = err instanceof Error ? err.message : i18n.global.t('exchangeRates.fetchFailed')
            }
            throw err
        } finally {
            isLoading.value = false
            updateRefreshStatus()
        }
    }

    const refreshCurrencies = async () => {
        try {
            await fetchCurrencies(true)
        } catch {
            // error already in state
        }
    }

    const setSegment = (next: MarketSegment) => {
        segment.value = next
    }

    const setChangeMode = (next: ChangeMode) => {
        if (changeMode.value === next) return
        changeMode.value = next
        marketStorage.saveMode(next)

        // Recompute change% over current rows without refetching.
        if (fiat.value.length === 0) return

        const baselineMids: Record<string, number> =
            next === 'fetch'
                ? Object.fromEntries(prevFetchMids)
                : snapshots.previous?.mids ?? {}

        fiat.value = fiat.value.map(c => {
            const baseMid = baselineMids[c.code]
            const change = baseMid && baseMid > 0 ? ((c.mid - baseMid) / baseMid) * 100 : 0
            return { ...c, change }
        })
    }

    const toggleFavorite = (code: string) => {
        const idx = favorites.value.indexOf(code)
        if (idx >= 0) {
            favorites.value.splice(idx, 1)
        } else {
            favorites.value.push(code)
        }
        marketStorage.saveFavorites(favorites.value)
    }

    const isFavorite = (code: string) => favorites.value.includes(code)

    const initialize = async () => {
        startRefreshTimer()
        if (fiat.value.length === 0) {
            try {
                await fetchCurrencies(false)
            } catch {
                // surfaced via error state
            }
        }
    }

    return {
        // state
        segment,
        changeMode,
        fiat,
        metal,
        crypto,
        isLoading,
        lastUpdate,
        nextUpdateAt,
        error,
        favorites,

        // getters
        visibleCurrencies,
        favoriteCurrencies,
        isDataStale,
        lastUpdateLabel,
        canRefresh,
        refreshCountdown,

        // actions
        fetchCurrencies,
        refreshCurrencies,
        setSegment,
        setChangeMode,
        toggleFavorite,
        isFavorite,
        initialize,
        stopRefreshTimer
    }
})
