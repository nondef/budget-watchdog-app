import {
    AccountBalanceService,
    AccountType,
    IAccountRepository,
    ICurrencyRepository,
    IMoney,
    IUnitOfWork
} from "@/domain";
import { assertExists } from '@/application/shared/assert-exists';

export interface AccountSummaryOutput {
    totalBalance: IMoney;
    /** Hesap tipi → o tipteki aktif hesapların toplamı. */
    byType: Record<string, IMoney>;
}

export class GetAccountSummaryUseCase {
    constructor(
        private accountRepository: IAccountRepository,
        private currencyRepository: ICurrencyRepository,
        private balanceService: AccountBalanceService,
        private unitOfWork?: IUnitOfWork
    ) {}

    async execute(currencyId: string): Promise<AccountSummaryOutput> {
        // Currency + hesaplar tek snapshot içinde okunmalı: aralarına giren bir
        // yazma (ör. hesap bakiyesi güncelleme) özeti bir veri durumundan,
        // toplamı başka durumdan getirebiliyordu. Kardeş okuma use-case'leriyle
        // (`ListTransactionUseCase`, `GetBudgetDetailUseCase`) aynı desen; `read`
        // yoksa (eski/test adapter'ı) iş doğrudan çalışır.
        const runRead =
            this.unitOfWork?.read?.bind(this.unitOfWork)
            ?? this.unitOfWork?.run?.bind(this.unitOfWork)
            ?? (<T>(work: () => Promise<T>) => work());

        return runRead(() => this.readSummary(currencyId));
    }

    private async readSummary(currencyId: string): Promise<AccountSummaryOutput> {
        const currency = await assertExists(
            'Currency',
            currencyId,
            id => this.currencyRepository.findById(id)
        )

        // Yalnızca ilgili para birimindeki aktif hesapları çek — balance service
        // zaten currencyId'ye göre filtreliyor; findActive'e vermezsek diğer para
        // birimindeki hesaplar boşuna yüklenip sessizce eleniyordu.
        const accounts = await this.accountRepository.findActive(currencyId)

        const totalBalance = this.balanceService.calculateTotalBalance(
            accounts,
            currencyId,
            currency.minorUnit
        )
        const byType = this.balanceService.getBalanceByAccountType(accounts, currencyId)

        // Domain nesneleri (Money, Map) presentation'a sızmasın: diğer tüm
        // use-case'ler gibi düz veri dön.
        return {
            totalBalance: totalBalance.toPlainObject(),
            byType: Object.fromEntries(
                [...byType.entries()].map(([type, money]) => [type as AccountType, money.toPlainObject()])
            )
        }
    }
}
