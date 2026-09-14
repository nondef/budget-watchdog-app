import {
    BusinessRuleViolationException,
    EntityNotFoundException,
    ICurrencyRepository,
    IExchangeRateRepository,
    IUnitOfWork
} from "@/domain";
import { ExchangeRate } from "@/domain/entities/exchange-rate";
import { IExchangeRateService } from "@/domain/interfaces/exchange-rate-service.interface";

export class RefreshExchangeRateUseCase {
    constructor(
        private rateRepository: IExchangeRateRepository,
        private currencyRepository: ICurrencyRepository,
        private exchangeRateService: IExchangeRateService,
        private unitOfWork: IUnitOfWork
    ) {}

    /**
     * Sağlayıcıdan kuru çeker, doğrular ve `ExchangeRate` listesine dönüştürür —
     * **kalıcılaştırmaz**. Ağ çağrısı transaction sınırının dışında tutulmalı;
     * çağıran, dönen kurları başka yazmalarla birlikte tek bir unit-of-work
     * içinde saklayabilir (ör. `ChangeBaseCurrencyUseCase` kur + baz para birimi
     * ayarını atomik yazar).
     */
    async fetchRates(
        baseCurrencyId: string,
        opts: { signal?: AbortSignal } = {}
    ): Promise<{ rates: ExchangeRate[]; fetchedAt: Date, missingCodes: string[] }> {
        const baseCurrency = await this.currencyRepository.findById(baseCurrencyId)

        if (!baseCurrency) {
            throw new EntityNotFoundException('Currency', baseCurrencyId)
        }

        const data = await this.exchangeRateService.getExchangeRateData(baseCurrency.code, { force: true, signal: opts.signal })
        const currencies = await this.currencyRepository.findAll()
        const targets = currencies.filter(currency => currency.id !== baseCurrencyId)

        if (data.isStale === true) {
            throw new BusinessRuleViolationException(
                'Exchange rate provider returned stale data',
                { baseCode: baseCurrency.code, provider: data.provider }
            )
        }

        // `fetchDate` = kuru **bizim** çektiğimiz an; sağlayıcının yayın anı
        // (`data.fetchedAt`) değil. open-er-api gibi sağlayıcılar günde bir
        // güncellendiği için `time_last_update_utc` saatlerce eski olabilir;
        // bunu `fetchDate` olarak yazsaydık kur kalıcılaştığı anda "bayat"
        // sayılırdı (tazelik penceresi 30 dk) ve `missingRates` banner'ı
        // yenilemeye rağmen hiç kaybolmazdı.
        const fetchedAt = new Date()

        const rates: ExchangeRate[] = []
        const missingCodes: string[] = []

        for (const currency of targets) {
            const value = data.conversionRates[currency.code]

            if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
                missingCodes.push(currency.code)
                continue
            }

            rates.push(ExchangeRate.create({
                baseCurrencyId,
                targetCurrencyId: currency.id,
                rate: value,
                fetchDate: fetchedAt
            }))
        }

        if (!rates.length) {
            throw new BusinessRuleViolationException(
                'Exchange rate provider returned no usable rates',
                { baseCode: baseCurrency.code, provider: data.provider }
            )
        }

        return { rates, fetchedAt, missingCodes }
    }

    async execute(baseCurrencyId: string, opts: { signal?: AbortSignal } = {}) {
        const { rates, fetchedAt, missingCodes } = await this.fetchRates(baseCurrencyId, opts)

        await this.unitOfWork.run(async () => {
            if (missingCodes.length) {
                await this.rateRepository.upsertMany(rates)
            } else {
                await this.rateRepository.replaceForBase(baseCurrencyId, rates)
            }
        })

        return {
            upserted: rates.length,
            isStale: false,
            fetchedAt,
            missingCodes
        }
    }
}
