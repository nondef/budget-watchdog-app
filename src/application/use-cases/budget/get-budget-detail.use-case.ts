import {
    IAccountRepository,
    IBudgetRepository,
    ICategoryRepository,
    ICurrencyRepository,
    ITransactionBudgetEffectRepository,
    ITransactionRepository,
    IUnitOfWork
} from "@/domain";
import { BudgetDetailOutput } from "@/application";
import { AccountMapper, BudgetMapper, CategoryMapper, CurrencyMapper, TransactionMapper } from "@/application/mappers";

export class GetBudgetDetailUseCase {
    constructor(
        private budgetRepository: IBudgetRepository,
        private accountRepository: IAccountRepository,
        private categoryRepository: ICategoryRepository,
        private currencyRepository: ICurrencyRepository,
        private transactionsRepository: ITransactionRepository,
        private effectRepository: ITransactionBudgetEffectRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: { id: string }): Promise<BudgetDetailOutput | null> {
        const read = this.unitOfWork.read?.bind(this.unitOfWork)
            ?? this.unitOfWork.run.bind(this.unitOfWork);

        return read(() => this.readDetail(input.id));
    }

    private async readDetail(id: string): Promise<BudgetDetailOutput | null> {
        const budget = await this.budgetRepository.findById(id);

        if (!budget) {
            return null;
        }

        const plain = BudgetMapper.toDTO(budget);

        const effects = await this.effectRepository.findByBudgetPeriod(
            budget.id,
            budget.periodStart
        );
        const transactions = await this.transactionsRepository.findByIds(
            effects.map(effect => effect.transactionId)
        );
        const categoryIds = Array.from(new Set([
            ...plain.categoryIds,
            ...transactions.flatMap(transaction => transaction.categoryId ? [transaction.categoryId] : [])
        ]));

        const [account, currency, categories] = await Promise.all([
            plain.accountId
                ? this.accountRepository.findById(plain.accountId)
                : Promise.resolve(null),
            this.currencyRepository.findById(plain.amount.currencyId),
            this.categoryRepository.findByIds(categoryIds),
        ]);

        const categoryMap = new Map(categories.map(c => [c.id, c]))

        return {
            budget: plain,
            account: account ? AccountMapper.toDTO(account) : null,
            categories: CategoryMapper.toDTOList(categories),
            currency: currency ? CurrencyMapper.toDTO(currency) : null,
            transactions: transactions.map(t => {
                // Kategorisiz işlem (transfer) bütçe kriterine hiç girmiyor ama
                // tip düzeyinde `categoryId` opsiyonel.
                const category = t.categoryId ? categoryMap.get(t.categoryId) : undefined

                return {
                    ...TransactionMapper.toDTO(t),
                    category: category ? CategoryMapper.toDTO(category) : null
                }
            })
        };
    }
}
