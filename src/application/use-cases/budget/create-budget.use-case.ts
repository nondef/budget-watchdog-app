import { Budget } from '@/domain/entities/budget';
import { IBudgetRepository } from '@/domain/interfaces/budget-repository.interface';
import { ICategoryRepository } from '@/domain/interfaces/category-repository.interface';
import { CreateBudgetInput, CreateBudgetOutput } from '@/application/dto/budget.dto';
import { BudgetMapper } from '@/application/mappers/budget.mapper';
import { assertAllExist } from "@/application/shared/assert-all-exist";
import { assertExists } from "@/application/shared/assert-exists";
import {
    AccountInactiveException,
    BusinessRuleViolationException,
    CurrencyMismatchException,
    IAccountRepository,
    ICurrencyRepository,
    ITransactionBudgetEffectRepository,
    ITransactionRepository,
    IUnitOfWork
} from "@/domain";
import {
    TransactionCategorizationService
} from '@/domain/services/transaction-categorization.service';
import {
    reconcileBudgetPeriod
} from '@/application/shared/reconcile-budget-period';

export class CreateBudgetUseCase {
    constructor(
        private budgetRepository: IBudgetRepository,
        private categoryRepository: ICategoryRepository,
        private currencyRepository: ICurrencyRepository,
        private accountRepository: IAccountRepository,
        private transactionRepository: ITransactionRepository,
        private effectRepository: ITransactionBudgetEffectRepository,
        private categorizationService: TransactionCategorizationService,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: CreateBudgetInput): Promise<CreateBudgetOutput> {
        return this.unitOfWork.run(async () => {
            const currency = await assertExists(
                'Currency',
                input.currencyId,
                id => this.currencyRepository.findById(id)
            )
            const account = await assertExists('Account', input.accountId, id => this.accountRepository.findById(id))
            const categories = await assertAllExist(
                'Category',
                input.categoryIds,
                ids => this.categoryRepository.findByIds(ids)
            )

            if (!account.isActive) {
                throw new AccountInactiveException(account.id)
            }
            if (account.currencyId !== input.currencyId) {
                throw new CurrencyMismatchException(account.currencyId, input.currencyId)
            }
            if (categories.some(category => category.type !== 'expense')) {
                throw new BusinessRuleViolationException(
                    'Budgets can only use expense categories',
                    { categoryIds: input.categoryIds }
                )
            }

            const budget = Budget.create({
                name: input.name,
                categoryIds: input.categoryIds,
                amount: input.amount,
                accountId: input.accountId,
                currencyId: input.currencyId,
                minorUnit: currency.minorUnit,
                type: input.type,
                startDate: input.startDate,
                endDate: input.endDate,
                warningPercentage: input.warningPercentage,
                enableNotifications: input.enableNotifications,
                icon: input.icon,
                note: input.note
            });

            await reconcileBudgetPeriod(budget, {
                budgetRepository: this.budgetRepository,
                transactionRepository: this.transactionRepository,
                effectRepository: this.effectRepository,
                categorizationService: this.categorizationService,
            });

            return { budget: BudgetMapper.toDTO(budget) };
        });
    }
}
