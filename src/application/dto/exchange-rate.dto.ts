export interface ExchangeRateDTO {
    id: string;
    baseCurrencyId: string;
    targetCurrencyId: string;
    rate: number;
    buyingRate?: number | null;
    sellingRate?: number | null;
    changeRate?: number | null;
    fetchDate: Date;
}
