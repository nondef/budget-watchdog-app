import { IBudgetRepository } from '@/domain/interfaces/budget-repository.interface';
import { ResetBudgetsOutput } from '@/application/dto/budget.dto';
import { BudgetMapper } from '@/application/mappers/budget.mapper';
import { ITransactionBudgetEffectRepository, IUnitOfWork } from '@/domain';

export class ResetBudgetsUseCase {
    constructor(
        private budgetRepository: IBudgetRepository,
        private effectRepository: ITransactionBudgetEffectRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(): Promise<ResetBudgetsOutput> {
        // Tek "şimdi": döngü uzun sürerse bazı bütçeler farklı ana göre
        // sıfırlanıp dönem sınırları birbirinden kayardı.
        const now = new Date();
        return this.unitOfWork.run(async () => {
            const budgets = await this.budgetRepository.findNeedingReset(now);

            for (const budget of budgets) {
                // Kapanan dönemin etki kayıtları artık hiçbir hesaplamaya
                // girmiyor (silme/güncelleme `periodStart` eşleşmeyince atlıyor)
                // ama tablo süresiz büyüyordu. Manuel sıfırlama ve bütçe
                // düzenleme bu temizliği zaten yapıyor.
                const closingPeriodStart = budget.periodStart;

                budget.reset(now);

                await this.effectRepository.deleteByBudgetPeriod(budget.id, closingPeriodStart);
                await this.budgetRepository.save(budget);
            }

            return {
                resetCount: budgets.length,
                resetBudgets: BudgetMapper.toDTOList(budgets)
            };
        });
    }
}
