import { IBudgetRepository } from '@/domain/interfaces/budget-repository.interface';
import {
    AccountInactiveException,
    BusinessRuleViolationException,
    CurrencyMismatchException,
    EntityNotFoundException
} from '@/domain/exceptions/domain.exception';
import { UpdateBudgetInput, UpdateBudgetOutput } from '@/application/dto/budget.dto';
import { BudgetMapper } from '@/application/mappers/budget.mapper';
import {
    Icon,
    IAccountRepository,
    ICategoryRepository,
    ITransactionBudgetEffectRepository,
    ITransactionRepository,
    IUnitOfWork
} from "@/domain";
import { assertAllExist } from "@/application/shared/assert-all-exist";
import { assertExists } from "@/application/shared/assert-exists";
import { buildBudgetNotification } from "@/application/shared/build-budget-notification";
import { budgetAlertLevel, BUDGET_ALERT_RANK } from "@/application/shared/budget-alert-level";
import { TransactionCategorizationService } from '@/domain/services/transaction-categorization.service';
import {
    reconcileBudgetPeriod
} from '@/application/shared/reconcile-budget-period';

export class UpdateBudgetUseCase {
    constructor(
        private budgetRepository: IBudgetRepository,
        private categoryRepository: ICategoryRepository,
        private accountRepository: IAccountRepository,
        private transactionRepository: ITransactionRepository,
        private effectRepository: ITransactionBudgetEffectRepository,
        private categorizationService: TransactionCategorizationService,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: UpdateBudgetInput): Promise<UpdateBudgetOutput> {
        return this.unitOfWork.run(async () => {
            const budget = await this.budgetRepository.findById(input.id);

            if (!budget) {
                throw new EntityNotFoundException('Budget', input.id);
            }

            // Düzenleme öncesi seviye: bildirim yalnız gerçek bir seviye
            // yükselişinde çıksın. Aksi halde zaten aşılmış bir bütçede yalnız
            // ad/not/ikon değiştirmek tekrar "aşıldı" bildirimi üretiyordu.
            const alertLevelBefore = budgetAlertLevel(budget);

            const previousCoverage = {
                accountId: budget.accountId,
                categoryIds: [...budget.categoryIds].sort(),
                type: budget.type,
                startDate: budget.dateRange.startDate.getTime(),
                endDate: budget.dateRange.endDate?.getTime() ?? null,
                periodStart: new Date(budget.periodStart),
            };

            if (input.categoryIds) {
                const categories = await assertAllExist(
                    'Category',
                    input.categoryIds,
                    ids => this.categoryRepository.findByIds(ids)
                )

                if (categories.some(category => category.type !== 'expense')) {
                    throw new BusinessRuleViolationException(
                        'Budgets can only use expense categories',
                        { categoryIds: input.categoryIds }
                    )
                }
            }

            budget.updateDetails({
                name: input.name,
                amount: input.amount,
                warningPercentage: input.warningPercentage,
                enableNotifications: input.enableNotifications,
                note: input.note,
                categoryIds: input.categoryIds
            });

            if (input.icon !== undefined) {
                budget.changeIcon(Icon.create(
                    input.icon.name ?? budget.icon.name,
                    input.icon.color ?? budget.icon.color
                ));
            }

            if (input.accountId !== undefined && input.accountId !== budget.accountId) {
                const account = await assertExists(
                    'Account',
                    input.accountId,
                    id => this.accountRepository.findById(id)
                )

                if (!account.isActive) {
                    throw new AccountInactiveException(account.id)
                }
                if (account.currencyId !== budget.currencyId) {
                    throw new CurrencyMismatchException(budget.currencyId, account.currencyId)
                }

                budget.changeAccount(input.accountId);
            }

            if (input.type !== undefined || input.startDate !== undefined || 'endDate' in input) {
                const endDate = 'endDate' in input ? input.endDate : budget.dateRange.endDate;

                budget.changePeriod(
                    input.type ?? budget.type,
                    input.startDate ?? budget.dateRange.startDate,
                    endDate
                );
            }

            const coverageChanged =
                previousCoverage.accountId !== budget.accountId ||
                previousCoverage.type !== budget.type ||
                previousCoverage.startDate !== budget.dateRange.startDate.getTime() ||
                previousCoverage.endDate !== (budget.dateRange.endDate?.getTime() ?? null) ||
                previousCoverage.categoryIds.join('\u0000') !== [...budget.categoryIds].sort().join('\u0000');

            if (coverageChanged) {
                await reconcileBudgetPeriod(
                    budget,
                    {
                        budgetRepository: this.budgetRepository,
                        transactionRepository: this.transactionRepository,
                        effectRepository: this.effectRepository,
                        categorizationService: this.categorizationService,
                    },
                    {
                        previousPeriodStart: previousCoverage.periodStart,
                    }
                );
            } else {
                await this.budgetRepository.save(budget);
            }

            // Yalnız aktif bütçede ve seviye yükselince bildir; paused/completed
            // bütçe düzenlemesi bildirim çıkarmamalı (`buildBudgetNotification`
            // tek başına aktifliği kontrol etmiyor).
            const shouldNotify =
                budget.isActive() &&
                BUDGET_ALERT_RANK[budgetAlertLevel(budget)] > BUDGET_ALERT_RANK[alertLevelBefore];

            return {
                budget: BudgetMapper.toDTO(budget),
                budgetNotification: shouldNotify ? buildBudgetNotification(budget) : null
            };
        });
    }

}
