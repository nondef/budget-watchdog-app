import { IExchangeRateProvider } from "@/infrastructure/services/financial/providers/exchange-rate-provider.interface";
import { ExchangeRateCache } from "@/infrastructure/services/financial/exchange-rate-cache";
import { OpenErApiProvider } from "@/infrastructure/services/financial/providers/open-er-api.provider";
import { FrankfurterProvider } from "@/infrastructure/services/financial/providers/frankfurter.provider";
import {
    AllProvidersFailedError,
    ExchangeRateCooldownError,
    ExchangeRateData,
    ExchangeRateError, UnsupportedBaseCodeError
} from "@/infrastructure/services/financial/types";

export interface FinancialServiceOptions {
    providers?: IExchangeRateProvider[]
    cacheMaxAgeMs?: number
    cooldownMs?: number
    logger?: (event: {
        level: 'info' | 'warn' | 'error',
        message: string,
        meta?: unknown
    }) => void
}

export class FinancialService {
    private readonly providers: IExchangeRateProvider[]
    private readonly cache = new ExchangeRateCache()
    private readonly cacheMaxAgeMs: number
    private readonly cooldownMs: number
    private readonly logger: NonNullable<FinancialServiceOptions['logger']>

    private lastFetchAt = 0
    private inflight: Map<string, Promise<ExchangeRateData>> = new Map()

    constructor(options: FinancialServiceOptions = {}) {
        this.providers = options.providers ?? [
            new OpenErApiProvider(),
            new FrankfurterProvider()
        ]

        this.cacheMaxAgeMs = options.cacheMaxAgeMs ?? 30 * 60 * 1000
        this.cooldownMs = options.cooldownMs ?? 5 * 60 * 1000
        this.logger = options.logger ?? (() => {})
    }

    canRefresh(): boolean {
        return Date.now() - this.lastFetchAt >= this.cooldownMs
    }

    getTimeUntilNextRefresh() {
        const remaining = this.cooldownMs - (Date.now() - this.lastFetchAt)
        return Math.max(0, Math.floor(remaining / 1000))
    }

    /**
     * Cache fresh ise oradan döner, değilse sağlayıcılara gider.
     * `force=true` cache'i bypass eder; cooldown yalnızca `refresh()` içinde uygulanır.
     */
    async getExchangeRateData(baseCode: string, opts: { force?: boolean, signal?: AbortSignal } = {}): Promise<ExchangeRateData> {
        const code = baseCode.toUpperCase()

        if (!opts.force) {
            const cached = this.cache.getFresh(code, this.cacheMaxAgeMs)

            if (cached) {
                return cached
            }
        }

        // Kendi signal'ı olan çağrı ortak in-flight promise'e katılmaz ve katmaz;
        // aksi halde bir çağıranın abort'u diğerlerinin isteğini de düşürür.
        if (opts.signal) {
            return this.fetchFromProviders(code, opts.signal)
        }

        const existing = this.inflight.get(code)
        if (existing) {
            return existing
        }

        const promise = this.fetchFromProviders(code)
            .finally(() => this.inflight.delete(code))

        this.inflight.set(code, promise)

        return promise
    }

    /**
     * Manuel "Kurları yenile" butonu için. Cooldown'u zorlar.
     */
    async refresh(baseCode: string, signal?: AbortSignal) {
        if (!this.canRefresh()) {
            throw new ExchangeRateCooldownError(this.getTimeUntilNextRefresh())
        }
        return this.getExchangeRateData(baseCode, { force: true, signal })
    }

    invalidateCache(baseCode?: string): void {
        this.cache.invalidate(baseCode)
    }

    private async fetchFromProviders(baseCode: string, signal?: AbortSignal): Promise<ExchangeRateData> {
        const supported = this.providers.filter(provider => provider.supports?.(baseCode) ?? true)

        if (!supported.length) {
            throw new UnsupportedBaseCodeError(baseCode)
        }

        const errors: ExchangeRateError[] = []

        for (const provider of supported) {
            try {
                this.logger({ level: 'info', message: `Fetching ${baseCode} via ${provider.name}` })

                const data = await provider.fetch(baseCode, signal)

                this.cache.set(data)
                this.lastFetchAt = Date.now()

                return data
            } catch (err) {
                // İptal, provider hatası değildir: sonraki provider'ı deneme, stale'e düşme.
                if (signal?.aborted) {
                    throw err
                }

                const wrapped = err instanceof ExchangeRateError
                    ? err
                    : new ExchangeRateError('Unknown provider error', {
                        cause: err,
                        provider: provider.name
                    })

                this.logger({ level: 'error', message: `Provider ${provider.name} failed`, meta: wrapped })

                errors.push(wrapped)
            }
        }

        const stale = this.cache.get(baseCode)

        if (stale) {
            this.logger({ level: 'warn', message: `All providers failed; serving stale cache for ${baseCode}`, meta: { errors }})

            return { ...stale, isStale: true }
        }

        throw new AllProvidersFailedError(baseCode, errors)
    }

}
