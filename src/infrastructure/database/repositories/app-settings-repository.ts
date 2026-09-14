import { BaseRepository } from './base-repository';
import { AppSettings } from '@/domain/entities/app-settings';
import { Theme } from '@/domain/value-objects/theme';
import { Language } from '@/domain/value-objects/language';
import { CurrencyFormat, DecimalPlaces } from '@/domain/value-objects/currency-format';
import { WeekDay } from '@/domain/value-objects/week-day';
import { PrivacySettings } from '@/domain/value-objects/privacy-settings';
import { BooleanCast, Cast, WrappedCast } from './casts';
import { DatabaseAdapter } from '@/domain/interfaces/database-adapter';
import { IAppSettingsRepository } from '@/domain/interfaces/app-settings-repository.interface';

export class AppSettingsRepository extends BaseRepository<AppSettings> implements IAppSettingsRepository {
    protected readonly table = 'app_settings';
    protected readonly timestamps = { createdAt: true, updatedAt: false };
    protected readonly entityClass = AppSettings;
    protected readonly casts: Record<string, Cast<any>> = {
        theme:        WrappedCast('theme', Theme.from, (v: Theme) => v.value, 'system'),
        language:     WrappedCast('language', Language.from, (v: Language) => v.code, 'tr'),
        weekStartDay: WrappedCast('week_start_day', WeekDay.from, (v: WeekDay) => v.value),
        privacy: {
            columns: ['hide_amounts'],
            get: (row) => PrivacySettings.create({ hideAmounts: Boolean(row.hide_amounts) }),
            set: (v: PrivacySettings) => ({ hide_amounts: v.hideAmounts ? 1 : 0 }),
        },
        currencyFormat: {
            columns: [
                'currency_position',
                'use_digit_grouping',
                'show_decimal_places',
                'decimal_places',
            ],
            get: (row) => CurrencyFormat.create({
                position: row.currency_position ?? 'end',
                useDigitGrouping: row.use_digit_grouping == null ? true : Boolean(row.use_digit_grouping),
                showDecimalPlaces: row.show_decimal_places == null ? true : Boolean(row.show_decimal_places),
                decimalPlaces: (row.decimal_places ?? 2) as DecimalPlaces,
            }),
            set: (v: CurrencyFormat) => ({
                currency_position: v.position,
                use_digit_grouping: v.useDigitGrouping ? 1 : 0,
                show_decimal_places: v.showDecimalPlaces ? 1 : 0,
                decimal_places: v.decimalPlaces,
            }),
        },
        onboardingCompleted: BooleanCast('onboarding_completed', false),
    };

    constructor(db: DatabaseAdapter) {
        super(db);
    }

    // ========== Singleton Accessor ==========

    /**
     * Singleton settings'i getir (tablo en fazla bir satır içerir).
     * Henüz yaratılmadıysa null. Yaratma sorumluluğu use case'in (onboarding).
     */
    async get(): Promise<AppSettings | null> {
        return this.findOne({});
    }
}
