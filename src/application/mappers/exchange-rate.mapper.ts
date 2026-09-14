import { ExchangeRate } from '@/domain/entities/exchange-rate'
import { ExchangeRateDTO } from "@/application";

/**
 * ExchangeRate entity → plain DTO (ExchangeRateDTO) dönüşümü.
 */
export const ExchangeRateMapper = {
    toDTO(entity: ExchangeRate): ExchangeRateDTO {
        return {
            id: entity.id,
            baseCurrencyId: entity.baseCurrencyId,
            targetCurrencyId: entity.targetCurrencyId,
            rate: entity.rate,
            buyingRate: entity.buyingRate,
            sellingRate: entity.sellingRate,
            changeRate: entity.changeRate,
            fetchDate: entity.fetchDate,
        }
    },

    toDTOList(entities: ExchangeRate[]): ExchangeRateDTO[] {
        return entities.map(entity => this.toDTO(entity))
    },
}
