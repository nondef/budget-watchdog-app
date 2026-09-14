import { IBudgetRepository } from '@/domain/interfaces/budget-repository.interface';
import { EntityNotFoundException } from '@/domain/exceptions/domain.exception';
import { BudgetDTO } from '@/application/dto/budget.dto';
import { BudgetMapper } from '@/application/mappers/budget.mapper';
import {
    ITransactionBudgetEffectRepository,
    ITransactionRepository,
    IUnitOfWork
} from '@/domain';
import {
    TransactionCategorizationService
} from '@/domain/services/transaction-categorization.service';
import {
    reconcileBudgetPeriod
} from '@/application/shared/reconcile-budget-period';

export interface ResetBudgetInput {
    id: string;
}

/**
 * Tek bir bütçenin güncel dönem harcama aggregate'ini elle temizler.
 *
 * `ResetBudgetsUseCase` yalnızca dönemi dolanları toplu işliyor; kullanıcının
 * bütçe detayından tetiklediği "sıfırla" eylemi için karşılık yoktu ve UI
 * "özellik mevcut değil" mesajı basıyordu (bkz. ShowBudgetPage).
 *
 * Dönem sınırlarını ilerletmez; zamanlanmış rollover `ResetBudgetsUseCase`
 * üzerinden yürür. Bu nedenle tek seferlik bütçelerde de manuel temizlik
 * yapılabilir.
 */
export class ResetBudgetUseCase {
    constructor(
        private budgetRepository: IBudgetRepository,
        private transactionRepository: ITransactionRepository,
        private effectRepository: ITransactionBudgetEffectRepository,
        private categorizationService: TransactionCategorizationService,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: ResetBudgetInput): Promise<BudgetDTO> {
        return this.unitOfWork.run(async () => {
            const budget = await this.budgetRepository.findById(input.id);

            if (!budget) {
                throw new EntityNotFoundException('Budget', input.id);
            }

            const now = new Date();
            const previousPeriodStart = new Date(budget.periodStart);

            if (budget.shouldReset(now)) {
                budget.reset(now);
            }

            budget.clearSpending(now);
            await reconcileBudgetPeriod(
                budget,
                {
                    budgetRepository: this.budgetRepository,
                    transactionRepository: this.transactionRepository,
                    effectRepository: this.effectRepository,
                    categorizationService: this.categorizationService
                },
                { previousPeriodStart }
            );

            return BudgetMapper.toDTO(budget);
        });
    }
}
