import { LanguageCode } from '@/domain/value-objects/language';
import { PrivacySettingsProps } from '@/domain/value-objects/privacy-settings';
import { CreateAccountProps, CurrencyFormatProps, ThemeMode, WeekDayValue } from "@/domain";
import { AccountDTO } from '@/application/dto/account.dto';

export interface AppDTO {
    id: string;
    baseCurrencyId: string;
    theme: ThemeMode;
    language: LanguageCode;
    onboardingCompleted: boolean;
    currencyFormat: CurrencyFormatProps;
    weekStartDay: WeekDayValue;
    privacy: PrivacySettingsProps;
    createdAt: string;
}

// ========== Initialize App ==========

// InitializeAppUseCase doğrudan `AppDTO | null` döner: `null` zaten "ilk açılış"
// demek, dolayısıyla ayrı bir `isFirstLaunch` bayrağı taşıyan sarmalayıcı tip
// gereksizdi (ve hiç kullanılmıyordu).

// ========== Complete Onboarding ==========

export interface CompleteOnboardingInput {
    baseCurrencyId: string;
    language?: LanguageCode;
    account: Omit<CreateAccountProps, 'currencyId'>
}

export interface CompleteOnboardingOutput {
    settings: AppDTO;
    account: AccountDTO;
    accountCreated: boolean;
}

// ========== Change Base Currency ==========

export interface ChangeBaseCurrencyInput {
    currencyId: string;
}

export interface ChangeBaseCurrencyOutput {
    settings: AppDTO;
    previousCurrencyId: string;
    ratesRefreshed: boolean
}

// ========== Update Settings ==========

// Tek bir toplu "settings güncelle" DTO'su yerine her ayar kendi use-case'ine
// sahip (UpdateTheme/UpdateLanguage/UpdateCurrencyFormat/UpdatePrivacy/
// UpdateWeekStartDay) ve hepsi `AppDTO` döner. Eski toplu tipler kullanılmıyordu;
// `theme`/`language` alanları da düz `string`'di, value object'lerle uyumsuz.

