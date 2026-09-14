import { ExchangeRateError, ExchangeRateTimeoutError, type ExchangeRateData } from "../types"
import { fetchJson, HttpStatusError, HttpTimeoutError } from "@/infrastructure/http"
import type { IExchangeRateProvider } from "./exchange-rate-provider.interface"

interface FrankfurterResponse {
    base: string
    date: string
    rates: Record<string, number>
}

export class FrankfurterProvider implements IExchangeRateProvider {
    readonly name = "frankfurter"
    private readonly baseUrl = "https://api.frankfurter.app/latest"
    private readonly timeoutMs: number

    constructor(opts: { timeoutMs?: number } = {}) {
        this.timeoutMs = opts.timeoutMs ?? 10_000
    }

    async fetch(baseCode: string, signal?: AbortSignal): Promise<ExchangeRateData> {
        const url = `${this.baseUrl}?from=${encodeURIComponent(baseCode.toUpperCase())}`

        let data: FrankfurterResponse
        try {
            data = await fetchJson<FrankfurterResponse>(url, { timeoutMs: this.timeoutMs, signal })
        } catch (err) {
            if (err instanceof HttpTimeoutError) {
                throw new ExchangeRateTimeoutError(this.name, this.timeoutMs)
            }
            if (err instanceof HttpStatusError) {
                throw new ExchangeRateError(`HTTP ${err.status}`, { provider: this.name, cause: err })
            }
            throw err // AbortError vb. — servis katmanı signal.aborted kontrolüyle ele alıyor
        }
        const rates = { ...data.rates, [data.base]: 1 }
        return {
            baseCode: data.base,
            conversionRates: rates,
            fetchedAt: new Date(data.date),
            nextUpdateAt: null,
            provider: this.name,
        }
    }
}