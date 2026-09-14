import { ExchangeRate } from '../entities/exchange-rate'

export interface IExchangeRateRepository {
    findRate(baseCurrencyId: string, targetCurrencyId: string): Promise<ExchangeRate | null>;
    findAllByBase(baseCurrencyId: string): Promise<ExchangeRate[]>;
    upsertMany(rates: ExchangeRate[]): Promise<void>;
    replaceForBase(baseCurrencyId: string, rates: ExchangeRate[]): Promise<void>;
    deleteByBase(baseCurrencyId: string): Promise<void>;
}
