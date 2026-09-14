import {
    EntityNotFoundException,
    ExchangeRatesUnavailableException,
    IAppSettingsRepository,
    ICurrencyRepository,
    IExchangeRateRepository,
    IUnitOfWork,
    StateNotInitializedException
} from '@/domain';
import { ExchangeRate } from '@/domain/entities/exchange-rate';
import { ChangeBaseCurrencyInput, ChangeBaseCurrencyOutput } from '@/application/dto/app.dto';
import { AppMapper } from '@/application/mappers/app.mapper';
import { RefreshExchangeRateUseCase } from '@/application/use-cases/exchange-rate/refresh-exchange-rate.use-case';

export class ChangeBaseCurrencyUseCase {
    constructor(
        private appSettingsRepository: IAppSettingsRepository,
        private currencyRepository: ICurrencyRepository,
        private rateRepository: IExchangeRateRepository,
        private refreshRates: RefreshExchangeRateUseCase,
        private unitOfWork: IUnitOfWork,
    ) {}

    async execute(input: ChangeBaseCurrencyInput): Promise<ChangeBaseCurrencyOutput> {
        const currency = await this.currencyRepository.findById(input.currencyId);
        if (!currency) throw new EntityNotFoundException('Currency', input.currencyId);

        const initialSettings = await this.appSettingsRepository.get();
        if (!initialSettings) throw new StateNotInitializedException('AppSettings');

        if (initialSettings.baseCurrencyId === input.currencyId) {
            return {
                settings: AppMapper.toDTO(initialSettings),
                previousCurrencyId: initialSettings.baseCurrencyId,
                ratesRefreshed: false
            };
        }

        let ratesRefreshed = true;
        // Ağ çağrısını transaction dışında yap; dönen kurları aşağıda ayar
        // yazımıyla **aynı** unit-of-work içinde sakla. Eskiden kur yenileme ile
        // baz para birimi ayarı iki ayrı transaction'daydı: yenileme başarılı
        // olup ayar yazımı patlarsa kurlar yeni tabana göre güncellenmiş ama
        // `baseCurrencyId` eskisinde kalıyordu (kısmi, tutarsız durum).
        let freshRates: ExchangeRate[] | null = null;

        try {
            const { rates } = await this.refreshRates.fetchRates(input.currencyId);
            freshRates = rates;
        } catch (cause) {
            const currencies = await this.currencyRepository.findAll();
            const expectedIds = currencies
                .filter(item => item.id !== input.currencyId)
                .map(item => item.id);
            const existingRates = await this.rateRepository.findAllByBase(input.currencyId);
            const byTarget = new Map(existingRates.map(rate => [rate.targetCurrencyId, rate]));
            const completeAndFresh = expectedIds.every(id => {
                const rate = byTarget.get(id);
                return Boolean(rate && rate.rate > 0 && !rate.isStale());
            });

            if (!completeAndFresh) {
                throw new ExchangeRatesUnavailableException(input.currencyId, { cause });
            }

            ratesRefreshed = false;
        }

        return this.unitOfWork.run(async () => {
            const settings = await this.appSettingsRepository.get();
            if (!settings) throw new StateNotInitializedException('AppSettings');

            // Kur çekimi transaction dışında yapıldı; bu arada baz para birimi
            // başka bir akışta zaten hedefe çekilmişse tekrar yazma — kurları
            // gereksiz yeniden yazmayı ve ayar `updatedAt`'ini kirletmeyi önler.
            if (settings.baseCurrencyId === input.currencyId) {
                return {
                    settings: AppMapper.toDTO(settings),
                    previousCurrencyId: settings.baseCurrencyId,
                    ratesRefreshed: false
                };
            }

            const previousCurrencyId = settings.baseCurrencyId;

            if (freshRates) {
                await this.rateRepository.replaceForBase(input.currencyId, freshRates);
            }

            settings.changeBaseCurrency(input.currencyId);
            await this.appSettingsRepository.save(settings);

            return {
                settings: AppMapper.toDTO(settings),
                previousCurrencyId,
                ratesRefreshed
            };
        });
    }
}
