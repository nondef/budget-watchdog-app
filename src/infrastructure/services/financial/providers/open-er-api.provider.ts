import { IExchangeRateProvider } from "@/infrastructure/services/financial/providers/exchange-rate-provider.interface";
import {
    ExchangeRateData,
    ExchangeRateError,
    ExchangeRateTimeoutError
} from "@/infrastructure/services/financial/types";
import { fetchJson, HttpStatusError, HttpTimeoutError } from "@/infrastructure/http";

interface OpenErApiResponse {
    result: 'success' | 'error'
    'error-type'?: string
    base_code: string
    rates: Record<string, number>
    time_last_update_utc: string
    time_next_update_utc?: string
}

export class OpenErApiProvider implements IExchangeRateProvider {
    readonly name = 'open-er-provider'
    private readonly baseUrl = 'https://open.er-api.com/v6/latest'
    private readonly timeoutMs: number

    constructor(opts: { timeoutMs?: number } = {}) {
        this.timeoutMs = opts.timeoutMs ?? 10_000
    }

    async fetch(baseCode: string, signal?: AbortSignal): Promise<ExchangeRateData> {
        const url = `${this.baseUrl}/${encodeURIComponent(baseCode.toUpperCase())}`

        let data: OpenErApiResponse
        try {
            data = await fetchJson<OpenErApiResponse>(url, { timeoutMs: this.timeoutMs, signal })
        } catch (err) {
            if (err instanceof HttpTimeoutError) {
                throw new ExchangeRateTimeoutError(this.name, this.timeoutMs)
            }
            if (err instanceof HttpStatusError) {
                throw new ExchangeRateError(`HTTP ${err.status}`, { provider: this.name, cause: err })
            }
            throw err // AbortError vb. — servis katmanı signal.aborted kontrolüyle ele alıyor
        }

        if (data.result !== 'success') {
            throw new ExchangeRateError(`Provider error: ${data['error-type'] ?? 'unknown'}`, { provider: this.name })
        }

        if (!data.rates || Object.keys(data.rates).length === 0) {
            throw new ExchangeRateError(`Empty rates payload`, { provider: this.name })
        }

        return {
            baseCode: data.base_code,
            conversionRates: data.rates,
            fetchedAt: new Date(data.time_last_update_utc),
            nextUpdateAt: data.time_next_update_utc ? new Date(data.time_next_update_utc) : null,
            provider: this.name
        }
    }
}