import { IExchangeRateRepository } from '@/domain';
import { ExchangeRateDTO } from '@/application/dto/exchange-rate.dto';

export interface ListExchangeRatesByBaseOutput {
    items: ExchangeRateDTO[];
    hasStaleRates: boolean;
}

export class ListExchangeRatesByBaseUseCase {
    constructor(
        private repository: IExchangeRateRepository
    ) {}

    async execute(input: {
        baseCurrencyId: string;
    }): Promise<ListExchangeRatesByBaseOutput> {
        const rates = await this.repository.findAllByBase(
            input.baseCurrencyId
        );

        return {
            items: rates.map(rate => ({
                id: rate.id,
                baseCurrencyId: rate.baseCurrencyId,
                targetCurrencyId: rate.targetCurrencyId,
                rate: rate.rate,
                buyingRate: rate.buyingRate,
                sellingRate: rate.sellingRate,
                changeRate: rate.changeRate,
                fetchDate: rate.fetchDate
            })),
            hasStaleRates: rates.some(
                rate => rate.isStale() || rate.rate <= 0
            )
        };
    }
}
