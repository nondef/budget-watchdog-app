import { BaseEntity } from './base-entity';
import { Theme } from '../value-objects/theme';
import { Language } from '../value-objects/language';
import { CurrencyFormat } from '../value-objects/currency-format';
import { WeekDay } from '../value-objects/week-day';
import { PrivacySettings } from '../value-objects/privacy-settings';
import { uuid } from "@/shared/utils/id/uuid";
import { RequiredFieldException } from '@/domain/exceptions/domain.exception';

export interface CreateAppSettingsProps {
    baseCurrencyId: string;
    language?: Language;
    theme?: Theme;
    currencyFormat?: CurrencyFormat;
    weekStartDay?: WeekDay;
    privacy?: PrivacySettings;
}

export interface AppSettingsProps {
    id: string;
    baseCurrencyId: string;
    theme: Theme;
    language: Language;
    onboardingCompleted: boolean;
    currencyFormat?: CurrencyFormat;
    weekStartDay?: WeekDay;
    privacy?: PrivacySettings;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * AppSettings Entity - Singleton
 * Uygulama genelindeki ayarları yönetir
 */
export class AppSettings extends BaseEntity {
    private _baseCurrencyId: string;
    private _theme: Theme;
    private _language: Language;
    private _onboardingCompleted: boolean;
    private _currencyFormat: CurrencyFormat;
    private _weekStartDay: WeekDay;
    private _privacy: PrivacySettings;

    private constructor(props: AppSettingsProps) {
        super(props.id, props.createdAt, props.updatedAt);
        this._baseCurrencyId = props.baseCurrencyId;
        this._theme = props.theme;
        this._language = props.language;
        this._onboardingCompleted = props.onboardingCompleted;
        this._currencyFormat = props.currencyFormat ?? CurrencyFormat.default();
        this._weekStartDay = props.weekStartDay ?? WeekDay.default();
        this._privacy = props.privacy ?? PrivacySettings.default();
    }

    /**
     * Yeni kurulum için varsayılan ayarlarla oluştur
     */
    static create(props: CreateAppSettingsProps): AppSettings {
        if (!props.baseCurrencyId) {
            throw new RequiredFieldException('baseCurrencyId');
        }

        return new AppSettings({
            id: uuid(),
            baseCurrencyId: props.baseCurrencyId,
            theme: props.theme ?? Theme.system(),
            language: props.language ?? Language.turkish(),
            onboardingCompleted: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            currencyFormat: props.currencyFormat,
            weekStartDay: props.weekStartDay,
            privacy: props.privacy,
        });
    }

    /**
     * Database'den yüklerken kullanılır
     */
    static reconstitute(props: AppSettingsProps): AppSettings {
        return new AppSettings(props);
    }

    completeOnboarding(): void {
        if (this._onboardingCompleted) {
            return; // Already completed, no-op
        }
        this._onboardingCompleted = true;
        this.touch();
    }

    resetOnboarding(): void {
        this._onboardingCompleted = false;
        this.touch();
    }

    changeBaseCurrency(currencyId: string): void {
        if (this._baseCurrencyId === currencyId) {
            return; // Same currency, no-op
        }
        this._baseCurrencyId = currencyId;
        this.touch();
    }

    changeTheme(theme: Theme): void {
        if (this._theme.equals(theme)) {
            return;
        }
        this._theme = theme;
        this.touch();
    }

    changeLanguage(language: Language): void {
        if (this._language.equals(language)) {
            return;
        }
        this._language = language;
        this.touch();
    }

    changeCurrencyFormat(format: CurrencyFormat): void {
        if (this._currencyFormat.equals(format)) {
            return;
        }
        this._currencyFormat = format;
        this.touch();
    }

    changeWeekStartDay(day: WeekDay): void {
        if (this._weekStartDay.equals(day)) {
            return;
        }
        this._weekStartDay = day;
        this.touch();
    }

    changePrivacy(privacy: PrivacySettings): void {
        if (this._privacy.equals(privacy)) {
            return;
        }
        this._privacy = privacy;
        this.touch();
    }

    get baseCurrencyId(): string {
        return this._baseCurrencyId;
    }

    get theme(): Theme {
        return this._theme;
    }

    get language(): Language {
        return this._language;
    }

    get isOnboardingCompleted(): boolean {
        return this._onboardingCompleted;
    }

    get currencyFormat(): CurrencyFormat {
        return this._currencyFormat;
    }

    get weekStartDay(): WeekDay {
        return this._weekStartDay;
    }

    get privacy(): PrivacySettings {
        return this._privacy;
    }

    needsOnboarding(): boolean {
        return !this._onboardingCompleted;
    }
}
