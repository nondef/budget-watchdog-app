import { Currency } from '@/domain/entities/currency'
import { CurrencyDTO } from "@/application";

/**
 * Currency entity → plain DTO (CurrencyDTO) dönüşümü.
 */
export const CurrencyMapper = {
    toDTO(entity: Currency): CurrencyDTO {
        return {
            id: entity.id,
            name: entity.name,
            code: entity.code,
            symbol: entity.symbol,
            country: entity.country,
            minorUnit: entity.minorUnit,
        }
    },

    toDTOList(entities: Currency[]): CurrencyDTO[] {
        return entities.map(entity => this.toDTO(entity))
    },
}
