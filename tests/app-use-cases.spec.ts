import { describe, expect, it } from 'vitest';
import {
    Account,
    AppSettings,
    Currency,
    CurrencyFormat,
    Language,
    PrivacySettings,
    Theme,
    WeekDay,
} from '@/domain';
import { InitializeAppUseCase } from '@/application/use-cases/app/initialize-app.use-case';
import { CompleteOnboardingUseCase } from '@/application/use-cases/app/complete-onboarding.use-case';
import { ChangeBaseCurrencyUseCase } from '@/application/use-cases/app/change-base-currency.use-case';
import { UpdateThemeUseCase } from '@/application/use-cases/app/update-theme.use-case';
import { UpdateLanguageUseCase } from '@/application/use-cases/app/update-language.use-case';
import { UpdateCurrencyFormatUseCase } from '@/application/use-cases/app/update-currency-format.use-case';
import { UpdatePrivacySettingsUseCase } from '@/application/use-cases/app/update-privacy-settings.use-case';
import { UpdateWeekStartDayUseCase } from '@/application/use-cases/app/update-week-start-day.use-case';

const immediateUow = {
    async run<T>(work: () => Promise<T>): Promise<T> {
        return work();
    },
};

function currency(id: string, code: string, minorUnit = 2): Currency {
    return Currency.create({
        id,
        code,
        name: code,
        symbol: code,
        country: 'Test',
        minorUnit,
    });
}

function settings(baseCurrencyId = 'try-id'): AppSettings {
    return AppSettings.create({ baseCurrencyId });
}

describe('App use-cases', () => {
    it('InitializeApp settings DTO döner', async () => {
        const entity = settings();
        const result = await new InitializeAppUseCase({
            async get() { return entity; },
        } as any).execute();

        expect(result?.baseCurrencyId).toBe('try-id');
    });

    it('CompleteOnboarding ilk hesabı currency minor-unit ile atomik kaydeder', async () => {
        const savedAccounts: unknown[] = [];
        let savedSettings: AppSettings | undefined;
        const useCase = new CompleteOnboardingUseCase(
            {
                async get() { return null; },
                async save(value: AppSettings) { savedSettings = value; },
            } as any,
            {
                async findActive() { return []; },
                async findAll() { return []; },
                async save(value: unknown) { savedAccounts.push(value); },
            } as any,
            { async findById() { return currency('kwd-id', 'KWD', 3); } } as any,
            immediateUow
        );

        const result = await useCase.execute({
            baseCurrencyId: 'kwd-id',
            language: 'tr',
            account: {
                name: 'KWD hesabı',
                type: 'cash',
                balance: 1.005,
                icon: { name: 'wallet-outline', color: 'blue' },
            },
        });

        expect(savedAccounts).toHaveLength(1);
        expect((savedAccounts[0] as { balance: { minorUnit: number } }).balance.minorUnit).toBe(3);
        expect(savedSettings?.isOnboardingCompleted).toBe(true);
        expect(result.settings.onboardingCompleted).toBe(true);
    });

    it('CompleteOnboarding var olan hesabı kullanıcının girdisiyle günceller', async () => {
        const existing = Account.create({
            name: 'Eski',
            type: 'bank',
            currencyId: 'try-id',
            balance: 250,
            icon: { name: 'card-outline', color: 'gray' },
        });
        let savedSettings: AppSettings | undefined;

        const result = await new CompleteOnboardingUseCase(
            {
                async get() { return null; },
                async save(value: AppSettings) { savedSettings = value; },
            } as any,
            {
                async findActive() { return [existing]; },
                async findAll() { return [existing]; },
                async save() {},
            } as any,
            { async findById() { return currency('try-id', 'TRY', 2); } } as any,
            immediateUow
        ).execute({
            baseCurrencyId: 'try-id',
            account: {
                name: 'Yeni cüzdan',
                type: 'cash',
                balance: 999,
                icon: { name: 'wallet-outline', color: 'blue' },
            },
        });

        // Var olan hesap yeniden kullanıldı ama kullanıcının girdisi uygulandı.
        expect(result.accountCreated).toBe(false);
        expect(result.account.name).toBe('Yeni cüzdan');
        expect(result.account.type).toBe('cash');
        // Bakiye retroaktif değişmez.
        expect(existing.balance.amount).toBe(250);
        expect(savedSettings?.isOnboardingCompleted).toBe(true);
    });

    it('ChangeBaseCurrency kurları doğruladıktan sonra ayarı değiştirir', async () => {
        const entity = settings();
        const fetchCalls: string[] = [];
        const replaceCalls: string[] = [];
        const refresh = {
            async fetchRates(currencyId: string) {
                fetchCalls.push(currencyId);
                return { rates: [], fetchedAt: new Date() };
            },
        };
        const useCase = new ChangeBaseCurrencyUseCase(
            {
                async get() { return entity; },
                async save() {},
            } as any,
            {
                async findById() { return currency('usd-id', 'USD'); },
            } as any,
            {
                async replaceForBase(baseCurrencyId: string) { replaceCalls.push(baseCurrencyId); },
            } as any,
            refresh as any,
            immediateUow
        );

        const result = await useCase.execute({ currencyId: 'usd-id' });
        // Kur çekimi ve ayar yazımı aynı akışta: kurlar (varsa) ayar yazımıyla
        // aynı unit-of-work içinde `replaceForBase` ile saklanır.
        expect(fetchCalls).toEqual(['usd-id']);
        expect(replaceCalls).toEqual(['usd-id']);
        expect(result.settings.baseCurrencyId).toBe('usd-id');
    });

    it('UpdateTheme ayarı kaydeder', async () => {
        const entity = settings();
        const result = await new UpdateThemeUseCase(
            { async get() { return entity; }, async save() {} } as any,
            immediateUow
        ).execute({ theme: Theme.dark() });
        expect(result.theme).toBe('dark');
    });

    it('UpdateLanguage ayarı kaydeder', async () => {
        const entity = settings();
        const result = await new UpdateLanguageUseCase(
            { async get() { return entity; }, async save() {} } as any,
            immediateUow
        ).execute({ language: Language.english() });
        expect(result.language).toBe('en');
    });

    it('UpdateCurrencyFormat ayarı kaydeder', async () => {
        const entity = settings();
        const format = CurrencyFormat.create({ position: 'start', decimalPlaces: 0 });
        const result = await new UpdateCurrencyFormatUseCase(
            { async get() { return entity; }, async save() {} } as any,
            immediateUow
        ).execute({ format });
        expect(result.currencyFormat.position).toBe('start');
    });

    it('UpdatePrivacySettings ayarı kaydeder', async () => {
        const entity = settings();
        const result = await new UpdatePrivacySettingsUseCase(
            { async get() { return entity; }, async save() {} } as any,
            immediateUow
        ).execute({ privacy: PrivacySettings.create({ hideAmounts: true }) });
        expect(result.privacy.hideAmounts).toBe(true);
    });

    it('UpdateWeekStartDay ayarı kaydeder', async () => {
        const entity = settings();
        const result = await new UpdateWeekStartDayUseCase(
            { async get() { return entity; }, async save() {} } as any,
            immediateUow
        ).execute({ day: WeekDay.sunday() });
        expect(result.weekStartDay).toBe('sunday');
    });
});
