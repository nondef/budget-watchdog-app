import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { resolveRepository } from "@/infrastructure/database/repositories/resolve";
import { resolveUnitOfWork } from "@/infrastructure/database/repositories/resolve";
import { AppSettingsRepository } from "@/infrastructure/database/repositories/app-settings-repository";
import { CurrencyDTO } from "@/application/dto/currency.dto";
import { Theme } from "@/domain/value-objects/theme";
import {
    ChangeBaseCurrencyUseCase,
    CompleteOnboardingUseCase,
    InitializeAppUseCase,
    UpdateCurrencyFormatUseCase,
    UpdatePrivacySettingsUseCase,
    UpdateWeekStartDayUseCase,
    UpdateThemeUseCase,
    UpdateLanguageUseCase,
    AppDTO
} from "@/application";
import { Language } from "@/domain/value-objects/language";
import { setLocale, getDeviceLocale } from "@/i18n";
import { CurrencyFormat } from "@/domain/value-objects/currency-format";
import { WeekDay } from "@/domain/value-objects/week-day";
import { PrivacySettings } from "@/domain/value-objects/privacy-settings";
import { AccountRepository, CurrencyRepository } from "@/infrastructure/database/repositories";
import { RefreshExchangeRateUseCase } from "@/application/use-cases/exchange-rate/refresh-exchange-rate.use-case";
import { ExchangeRateRepository } from "@/infrastructure/database/repositories/exchange-rate-repository";
import { useExchangeRateStore } from "@/stores/exchange-rates";
import { useThemeStore } from "@/stores/theme";
import { CreateAccountProps, ValidationException } from "@/domain";
import { financialService } from "@/infrastructure/services/financial";
import { logger } from '@/infrastructure/logging';

export const useAppStore = defineStore('app', () => {
    const settings = ref<AppDTO | null>(null)
    const baseCurrency = ref<CurrencyDTO | null>(null)

    const isInitialized = ref(false)

    const appRepository = resolveRepository(AppSettingsRepository)
    const currencyRepository = resolveRepository(CurrencyRepository)
    const accountRepository = resolveRepository(AccountRepository)
    const rateRepository = resolveRepository(ExchangeRateRepository)
    const unitOfWork = resolveUnitOfWork()

    const onBoardingCompleted = computed(() => settings.value?.onboardingCompleted ?? false)
    const hasBaseCurrency = computed(() => !!baseCurrency.value)
    const hasCurrencyId = computed(() => settings.value?.baseCurrencyId ?? null)
    const theme = computed(() => settings.value?.theme ?? null)
    const language = computed(() => settings.value?.language ?? null)
    const currencyFormat = computed(() => settings.value?.currencyFormat ?? CurrencyFormat.default().toJSON())
    const weekStartDay = computed(() => settings.value?.weekStartDay ?? WeekDay.default().value)
    const privacy = computed(() => settings.value?.privacy ?? PrivacySettings.default().toJSON())
    const hideAmounts = computed(() => privacy.value.hideAmounts)

    let initPromise: Promise<void> | null = null

    const initialize = async () => {
        if (isInitialized.value) {
            return
        }

        if (initPromise) {
            return initPromise
        }

        initPromise = (async () => {
            try {
                const useCase = new InitializeAppUseCase(appRepository)
                const result = await useCase.execute()
                settings.value = result

                if (!result) {
                    settings.value = null
                    isInitialized.value = true
                    return
                }

                // DB'deki dil tercihini i18n ile senkronla (kaynak-of-truth DB)
                if (result.language) {
                    setLocale(result.language)
                }

                if (result.theme) {
                    useThemeStore().initialize(result.theme)
                }

                // Buradan sonrası KRİTİK DEĞİL: yalnızca ayarların okunamaması
                // "init başarısız" sayılır. Kur/para birimi yüklemesi patladığında
                // hatayı yukarı fırlatmak, router'ın kullanıcıyı onboarding'e
                // düşürmesine yol açıyordu — kurulumla hiç ilgisi olmayan bir
                // hata için. Bunlar loglanır, açılış devam eder.
                if (result.baseCurrencyId) {
                    try {
                        await loadBaseCurrency(result.baseCurrencyId)
                    } catch (error) {
                        // Baz para birimi olmadan tutarlar çevrilemez (banner
                        // görünür), o yüzden warn değil error.
                        logger.error('Base currency could not be loaded during initialization', {
                            context: 'AppStore',
                            error
                        })
                    }
                }

                const rates = useExchangeRateStore()

                try {
                    await rates.loadRates()
                } catch (error) {
                    logger.warn('Exchange rates could not be loaded during initialization', {
                        context: 'AppStore',
                        error
                    })
                }

                isInitialized.value = true

                void ensureFreshRates()
            } finally {
                initPromise = null
            }
        })()

        return  initPromise
    }

    const loadBaseCurrency = async (currencyId: string) => {
        const currency = await currencyRepository.findById(currencyId)

        if (currency) {
            baseCurrency.value = currency
        }
    }

    const setBaseCurrency = async (currency: CurrencyDTO) => {
        baseCurrency.value = currency
    }

    const assignBaseCurrency = async (currency: CurrencyDTO) => {
        const refreshUseCase = new RefreshExchangeRateUseCase(
            rateRepository,
            currencyRepository,
            financialService,
            unitOfWork
        )

        const useCase = new ChangeBaseCurrencyUseCase(
            appRepository,
            currencyRepository,
            rateRepository,
            refreshUseCase,
            unitOfWork
        )

        const result = (await useCase.execute({ currencyId: currency.id }))

        settings.value = result.settings
        baseCurrency.value = currency

        const exchangeStore = useExchangeRateStore()
        await exchangeStore.loadRates()

        return result
    }

    const completeOnboarding = async (account: Omit<CreateAccountProps, 'currencyId'>) => {
        const currencyId = baseCurrency.value?.id

        if (!currencyId) {
            throw new ValidationException('Base currency id not selected', 'baseCurrencyId')
        }

        const useCase = new CompleteOnboardingUseCase(
            appRepository,
            accountRepository,
            currencyRepository,
            unitOfWork
        )

        // İlk kurulumda varsayılan dil = cihaz dili (tr/en/de, yoksa tr)
        const deviceLanguage = Language.from(getDeviceLocale())

        const { settings: appSettings } = await useCase.execute({
            baseCurrencyId: currencyId,
            language: deviceLanguage.code,
            account
        })

        settings.value = appSettings
        setLocale(appSettings.language)

        const rates = useExchangeRateStore()

        const refreshUseCase = new RefreshExchangeRateUseCase(rateRepository, currencyRepository, financialService, unitOfWork)
        try {
            await refreshUseCase.execute(currencyId)
            await rates.loadRates()
        } catch (error) {
            // Hesap + settings başarıyla commit edildi. Kur sağlayıcısının
            // geçici hatası onboarding'i geriye dönük olarak başarısız yapamaz.
            logger.warn('Exchange rates could not be refreshed after onboarding', {
                context: 'AppStore',
                error
            })
            await rates.loadRates()
        }

        return appSettings
    }

    /**
     * Güncel baz para birimi için kurları yeniden çeker. Banner'ın "Yenile"
     * butonu bunu kullanır. Sağlayıcı hatası fırlatılmaz: `false` döner ki UI
     * banner'ı gösterecek durumu (eksik kur) korusun ama patlamasın.
     */
    const refreshRates = async (): Promise<boolean> => {
        if (!baseCurrency.value) return false

        const rates = useExchangeRateStore()
        const refreshUseCase = new RefreshExchangeRateUseCase(
            rateRepository,
            currencyRepository,
            financialService,
            unitOfWork
        )

        try {
            await refreshUseCase.execute(baseCurrency.value.id)
            await rates.loadRates()
            return true
        } catch (error) {
            logger.warn('Manual exchange rate refresh failed', { context: 'AppStore', error })
            await rates.loadRates()
            return false
        }
    }

    let ensureRatesPromise: Promise<boolean> | null = null

    /**
     * Kurlar bayatladıysa sessizce yeniler; tazeyse ağa hiç çıkmaz.
     *
     * Kur çekme eskiden yalnızca soğuk açılışta (`initialize`) yapılıyordu.
     * Mobilde süreç günlerce arka planda yaşadığı için uygulama öne geldiğinde
     * kurlar bayat kalıyor, kullanıcıdan banner üzerinden elle yenileme
     * bekleniyordu. Eşzamanlı çağrılar tek istekte birleştirilir.
     */
    const ensureFreshRates = async (): Promise<boolean> => {
        if (!baseCurrency.value) return false

        const rates = useExchangeRateStore()

        if (!rates.areRatesStale()) return true
        if (ensureRatesPromise) return ensureRatesPromise

        ensureRatesPromise = refreshRates().finally(() => {
            ensureRatesPromise = null
        })

        return ensureRatesPromise
    }

    const changeTheme = async (theme: Theme) => {
        return applySettingsChange(
            s => ({ ...s, theme: theme.value }),
            () => new UpdateThemeUseCase(appRepository, unitOfWork).execute({ theme }),
            'settings.theme.updateError'
        )
    }

    const changeLanguage = async (language: Language) => {
        const prevLang = settings.value?.language
        setLocale(language.code)

        return applySettingsChange(
            s => ({ ...s }),
            () => new UpdateLanguageUseCase(appRepository, unitOfWork).execute({ language }),
            'settings.language.updateError',
            () => {
                if (prevLang) {
                    setLocale(prevLang)
                }
            }
        )
    }

    const updateCurrencyFormat = async (format: CurrencyFormat) => {
        return applySettingsChange(
            s => ({ ...s, currencyFormat: format.toJSON() }),
            () => new UpdateCurrencyFormatUseCase(appRepository, unitOfWork).execute({ format }),
            'settings.currencyFormat.updateError',
        )
    }

    const updatePrivacy = async (next: PrivacySettings) => {
        return applySettingsChange(
            s => ({ ...s, privacy: next.toJSON() }),
            () => new UpdatePrivacySettingsUseCase(appRepository, unitOfWork).execute({ privacy: next }),
            'settings.privacy.updateError'
        )
    }

    const updateWeekStartDay = async (day: WeekDay) => {
        return applySettingsChange(
            s => ({ ...s, weekStartDay: day.value }),
            () => new UpdateWeekStartDayUseCase(appRepository, unitOfWork).execute({ day }),
            'settings.weekStartDay.updateError'
        )
    }

    async function applySettingsChange(
        optimistic: (s: AppDTO) => AppDTO,
        run: () => Promise<AppDTO>,
        errorKey: string,
        onRollback?: () => void
    ) {
        const previous = settings.value

        if (settings.value) {
            settings.value = optimistic(settings.value)
        }

         try {
            settings.value = await run()
         } catch (err) {
            settings.value = previous
             onRollback?.()
             throw err
         }
    }

    return {
        // State
        settings,
        baseCurrency,
        isInitialized,
        assignBaseCurrency,

        // Getters
        hasBaseCurrency,
        theme,
        language,
        hasCurrencyId,
        onBoardingCompleted,
        currencyFormat,
        weekStartDay,
        privacy,
        hideAmounts,

        // Actions
        initialize,
        setBaseCurrency,
        completeOnboarding,
        refreshRates,
        ensureFreshRates,
        changeTheme,
        changeLanguage,
        updateCurrencyFormat,
        updatePrivacy,
        updateWeekStartDay,
    }
})
