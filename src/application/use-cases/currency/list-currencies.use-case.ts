import { ICurrencyRepository } from '@/domain';
import { CurrencyDTO } from '@/application/dto/currency.dto';
import { CurrencyMapper } from '@/application/mappers';

export interface ListCurrenciesOutput {
    items: CurrencyDTO[];
}

export class ListCurrenciesUseCase {
    constructor(
        private currencyRepository: ICurrencyRepository
    ) {}

    async execute(): Promise<ListCurrenciesOutput> {
        return {
            items: CurrencyMapper.toDTOList(
                await this.currencyRepository.findAll()
            )
        };
    }
}
