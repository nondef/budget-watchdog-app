import { AppSettings } from "@/domain";
import { AppDTO } from "@/application";

/**
 * AppSettings entity → plain DTO (AppDTO) dönüşümü.
 *
 * Value object'ler primitive/props haline indirgenir:
 * Theme → ThemeMode, Language → LanguageCode, WeekDay → WeekDayValue,
 * CurrencyFormat / PrivacySettings → kendi toJSON çıktıları.
 */
export const AppMapper = {
    toDTO(entity: AppSettings): AppDTO {
        return {
            id: entity.id,
            baseCurrencyId: entity.baseCurrencyId,
            theme: entity.theme.value,
            language: entity.language.code,
            onboardingCompleted: entity.isOnboardingCompleted,
            currencyFormat: entity.currencyFormat.toJSON(),
            weekStartDay: entity.weekStartDay.value,
            privacy: entity.privacy.toJSON(),
            createdAt: entity.createdAt!.toISOString(),
        }
    },

    toDTOList(entities: AppSettings[]): AppDTO[] {
        return entities.map(entity => this.toDTO(entity))
    },
}
