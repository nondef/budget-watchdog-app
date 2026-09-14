import { ExchangeRateData } from "@/infrastructure/services/financial/types";

export class ExchangeRateCache {
    private store = new Map<string, ExchangeRateData>()

    get(baseCode: string) {
        return this.store.get(baseCode.toUpperCase()) ?? null
    }

    set(data: ExchangeRateData) {
        this.store.set(data.baseCode.toUpperCase(), data)
    }

    invalidate(baseCode?: string) {
        if (baseCode) {
            this.store.delete(baseCode.toUpperCase())
        } else {
            this.store.clear()
        }
    }

    getFresh(baseCode: string, maxAgeMs: number) {
        const entry = this.get(baseCode)

        if (!entry) {
            return false
        }

        return Date.now() - entry.fetchedAt.getTime() < maxAgeMs ? entry : null
    }
}