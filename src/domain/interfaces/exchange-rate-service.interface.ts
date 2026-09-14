export interface ExchangeRateSnapshot {
    baseCode: string
    fetchedAt: Date
    /** "USD" → 30.42 gibi. Anahtar her zaman currency CODE. */
    conversionRates: Record<string, number>
    provider: string
    /** Sağlayıcılara ulaşılamayıp eski veri sunulduğunda true. */
    isStale?: boolean
}

export interface IExchangeRateService {
    getExchangeRateData(
        baseCode: string,
        opts?: { force?: boolean, signal?: AbortSignal }
    ): Promise<ExchangeRateSnapshot>
}