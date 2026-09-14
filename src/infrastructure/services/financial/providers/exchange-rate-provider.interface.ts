import { ExchangeRateData } from "@/infrastructure/services/financial/types";

export interface IExchangeRateProvider {
    readonly name: string
    fetch(baseCode: string, signal?: AbortSignal): Promise<ExchangeRateData>
    /** Tanımlı değilse provider tüm para birimlerini destekliyor varsayılır. */
    supports?(baseCode: string): boolean
}