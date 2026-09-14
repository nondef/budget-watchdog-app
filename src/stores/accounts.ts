import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { resolveRepository } from "@/infrastructure/database/repositories/resolve";
import {
    AccountRepository,
    BudgetRepository,
    CurrencyRepository,
    SavingGoalContributionRepository,
    SavingGoalRepository,
    TransactionBudgetEffectRepository,
    TransactionRepository
} from "@/infrastructure/database/repositories";
import {
    AccountDTO,
    CreateAccountUseCase,
    DeleteAccountUseCase,
    GetAccountDetailOutput,
    GetAccountDetailUseCase,
    UpdateAccountInput,
    UpdateAccountUseCase
} from "@/application";
import { ListAccountsUseCase } from "@/application/use-cases/account/list-accounts.use-case";
import { GetAccountUseCase } from "@/application/use-cases/account/get-account.use-case";
import { CreateAccountProps } from "@/domain";
import { resolveUnitOfWork } from "@/infrastructure/database/repositories/resolve";
import { useExchangeRateStore } from '@/stores/exchange-rates';

export const useAccountsStore = defineStore('accounts', () => {
    const accounts = ref<AccountDTO[]>([])

    const unitOfWork = resolveUnitOfWork()
    const exchangeRateStore = useExchangeRateStore()

    const repository = resolveRepository(AccountRepository)
    const currencyRepository = resolveRepository(CurrencyRepository)
    const transactionRepository = resolveRepository(TransactionRepository)
    const budgetRepository = resolveRepository(BudgetRepository)
    const savingGoalRepository = resolveRepository(SavingGoalRepository)
    const contributionRepository = resolveRepository(SavingGoalContributionRepository)
    const effectRepository = resolveRepository(TransactionBudgetEffectRepository)

    const getAccountUseCase = new GetAccountUseCase(repository)
    const listAccountsUseCase = new ListAccountsUseCase(repository)

    const loadAccounts = async () => {
        accounts.value = await listAccountsUseCase.execute({ activeOnly: false })
    }

    const addAccount = async (input: CreateAccountProps) => {
        const useCase = new CreateAccountUseCase(
            repository,
            currencyRepository,
            unitOfWork
        )

        const result = await useCase.execute(input)

        accounts.value.push(result)

        return result
    }

    const updateAccount = async (input: UpdateAccountInput) => {
        const useCase = new UpdateAccountUseCase(
            repository,
            budgetRepository,
            savingGoalRepository,
            unitOfWork
        )
        const result = await useCase.execute(input)
        const index = accounts.value.findIndex(account => account.id === result.id)

        if (index !== -1) {
            accounts.value[index] = result
        }

        return result
    }

    const deleteAccount = async (id: string) => {
        const useCase = new DeleteAccountUseCase(
            repository,
            transactionRepository,
            budgetRepository,
            savingGoalRepository,
            unitOfWork
        )

        await useCase.execute({ id })

        const index = accounts.value.findIndex(account => account.id === id)

        if (index !== -1) {
            accounts.value.splice(index, 1)
        }
    };

    const activeAccounts = computed(() => {
        return accounts.value.filter(account => account.isActive)
    })

    /**
     * Aktif hesapların ana para birimindeki toplamı.
     *
     * Toplama `sumInBase` üzerinden yapılır (AccountsPage ile aynı yol): kuru
     * bulunamayan hesap toplama katılmaz ve `missing` içinde raporlanır — aksi
     * halde eksik kur, sessizce olduğundan düşük bir toplam üretirdi.
     */
    const totalBalanceSummary = computed(() =>
        exchangeRateStore.sumInBase(
            activeAccounts.value.map(account => ({
                amount: account.balance.amount,
                currencyId: account.balance.currencyId,
            }))
        )
    )

    const totalBalance = computed(() => totalBalanceSummary.value.total)

    /** Kuru bulunamadığı için toplama giremeyen hesap var mı. */
    const totalBalanceHasMissing = computed(() => totalBalanceSummary.value.missing.length > 0)

    const getAccountById = async (id: string) => {
        const cached = accounts.value.find(acc => acc.id === id)

        if (cached) {
            return cached
        }

        return await getAccountUseCase.execute({ id })
    }

    /**
     * Hesabın tam görünümü: işlemler + birikim hedefi hareketleri tek zaman
     * çizgisinde, bağlı bütçeler ve hedeflerle birlikte.
     *
     * Önbelleğe alınmaz: detay sayfası her açılışta güncel bakiyeyi ve
     * hareketleri görmek zorunda; ara katman bir tazeleme hatası burada
     * doğrudan yanlış para gösterirdi.
     */
    const getAccountDetail = async (id: string, movementLimit?: number): Promise<GetAccountDetailOutput> => {
        const useCase = new GetAccountDetailUseCase(
            repository,
            transactionRepository,
            budgetRepository,
            savingGoalRepository,
            contributionRepository,
            effectRepository,
            currencyRepository,
            unitOfWork
        )

        return useCase.execute({ accountId: id, movementLimit })
    }

    return {
        activeAccounts,
        totalBalance,
        totalBalanceHasMissing,
        accounts,
        addAccount,
        updateAccount,
        deleteAccount,
        loadAccounts,
        getAccountById,
        getAccountDetail
    };
});
