export interface ExchangeRateData {
    baseCode: string
    fetchedAt: Date
    /** "USD" → 30.42 gibi. Anahtar her zaman currency CODE. */
    conversionRates: Record<string, number>
    /** Sağlayıcının belirttiği bir sonraki güncelleme zamanı (varsa). */
    nextUpdateAt: Date | null
    provider: string
    /** Provider çağrısı başarısız olduğunda eski cache'in döndürüldüğünü belirtir. */
    isStale?: boolean
}

export type ExchangeRateProviderName = 'open-er-api' | 'frankfurter'

export class ExchangeRateError extends Error {
    constructor(
        message: string,
        options?: { cause?: unknown; provider?: string },
    ) {
        super(message, options?.cause !== undefined ? { cause: options.cause } : undefined)
        this.name = "ExchangeRateError"
        this.provider = options?.provider
    }
    readonly provider?: string
}

export class ExchangeRateProvider extends ExchangeRateError {
    constructor(provider: string, timeoutMs: number) {
        super(`Provider: ${provider} timed out after ${timeoutMs}ms`, { provider });
        this.name = 'ExchangeRateTimeoutError'
    }
}

export class ExchangeRateTimeoutError extends ExchangeRateError {
    constructor(provider: string, timeoutMs: number) {
        super(`Provider "${provider}" timed out after ${timeoutMs}ms`, { provider })
        this.name = "ExchangeRateTimeoutError"
    }
}

export class ExchangeRateCooldownError extends ExchangeRateError {
    constructor(readonly remainingSeconds: number) {
        super(`Cooldown active. Try again in ${remainingSeconds}s.`);
        this.name = 'ExchangeRateCooldownError';
    }
}

export class UnsupportedBaseCodeError extends ExchangeRateError {
    constructor(readonly baseCode: string) {
        super(`No provider supports base currency "${baseCode}"`)
        this.name = 'UnsupportedBaseCodeError'
    }
}

export class AllProvidersFailedError extends ExchangeRateError {
    constructor(
        readonly baseCode: string,
        readonly providerErrors: ExchangeRateError[],
    ) {
        const summary = providerErrors
            .map(e => `  - ${e.provider ?? "unknown"}: ${e.message}`)
            .join("\n")
        super(
            `All providers failed for base "${baseCode}":\n${summary}`,
            { cause: providerErrors[0] }, // standart Error.cause'a sadece ilkini ver
        )
        this.name = "AllProvidersFailedError"
    }
    /** Belirli bir provider için hata var mıydı? */
    errorFor(providerName: string): ExchangeRateError | undefined {
        return this.providerErrors.find(e => e.provider === providerName)
    }
}
