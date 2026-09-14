import { IBudgetRepository } from '@/domain/interfaces/budget-repository.interface';
import { EntityNotFoundException } from '@/domain/exceptions/domain.exception';
import { BudgetDTO } from '@/application/dto/budget.dto';
import { BudgetMapper } from '@/application/mappers/budget.mapper';
import {
    AccountInactiveException,
    IAccountRepository,
    ITransactionBudgetEffectRepository,
    IUnitOfWork
} from '@/domain';

/** Entity'nin durum geçişi davranışlarıyla birebir eşleşir. */
export type BudgetStatusAction = 'pause' | 'resume' | 'complete';

export interface ChangeBudgetStatusInput {
    id: string;
    action: BudgetStatusAction;
}

/**
 * Bütçenin durumunu değiştirir (duraklat / devam ettir / tamamla).
 *
 * Geçişin geçerliliğini entity doğrular (ör. yalnızca aktif bütçe duraklatılır)
 * ve uygun `OperationNotAllowedException`'ı fırlatır. Bu iş eskiden store içinde
 * doğrudan repository + entity ile yapılıyordu; hata tipleri ve doğrulama
 * `ChangeSavingGoalStatusUseCase` ile aynı yola alındı.
 */
export class ChangeBudgetStatusUseCase {
    constructor(
        private budgetRepository: IBudgetRepository,
        private accountRepository: IAccountRepository,
        private effectRepository: ITransactionBudgetEffectRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: ChangeBudgetStatusInput): Promise<BudgetDTO> {
        return this.unitOfWork.run(async () => {
            const budget = await this.budgetRepository.findById(input.id);

            if (!budget) {
                throw new EntityNotFoundException('Budget', input.id);
            }

            if (input.action === 'resume') {
                const account = await this.accountRepository.findById(budget.accountId);
                if (!account) {
                    throw new EntityNotFoundException('Account', budget.accountId);
                }
                if (!account.isActive) {
                    throw new AccountInactiveException(account.id);
                }
            }

            budget[input.action]();

            // Paused kaldığı sırada dönem sınırı geçmiş olabilir. Toplu reset
            // yalnız active bütçeleri gördüğü için resume ile aynı atomik sınırda
            // rollover yapılmazsa bütçe eski dönem toplamıyla yeniden açılır.
            if (input.action === 'resume') {
                const now = new Date();
                if (budget.shouldReset(now)) {
                    // Kapanan dönemin efekt kayıtlarını da temizle —
                    // `rolloverDueBudgets`/`ResetBudgetsUseCase` ile aynı bakım.
                    // Aksi halde bu satırlar hiçbir hesaplamaya girmese de
                    // (periodStart eşleşmez) tabloda süresiz birikir.
                    const closingPeriodStart = budget.periodStart;
                    budget.reset(now);
                    await this.effectRepository.deleteByBudgetPeriod(budget.id, closingPeriodStart);
                }
            }

            await this.budgetRepository.save(budget);

            return BudgetMapper.toDTO(budget);
        });
    }
}
