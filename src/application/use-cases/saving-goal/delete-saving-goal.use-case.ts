import { ISavingGoalRepository } from '@/domain/interfaces/saving-goal-repository.interface';
import { EntityNotFoundException } from '@/domain/exceptions/domain.exception';
import { IAccountRepository, ISavingGoalContributionRepository, IUnitOfWork } from '@/domain';
import { assertExists } from '@/application/shared/assert-exists';

export class DeleteSavingGoalUseCase {
    constructor(
        private savingGoalRepository: ISavingGoalRepository,
        private accountRepository: IAccountRepository,
        private unitOfWork: IUnitOfWork,
        private contributionRepository?: ISavingGoalContributionRepository
    ) {}

    async execute(input: { id: string }): Promise<void> {
        await this.unitOfWork.run(async () => {
            const savingGoal = await this.savingGoalRepository.findById(input.id);

            if (!savingGoal) {
                throw new EntityNotFoundException('SavingGoal', input.id);
            }

            if (savingGoal.accountId && savingGoal.savedAmount.isPositive()) {
                const account = await assertExists(
                    'Account',
                    savingGoal.accountId,
                    id => this.accountRepository.findById(id)
                );
                account.deposit(savingGoal.savedAmount);
                await this.accountRepository.save(account);
            }

            // Hedefin defter satırları da gider. Silme ayrılmış fonun TAMAMINI
            // hesaba iade ettiği için o satırların net etkisi sıfırdır: hesabın
            // hareket geçmişinden düşmeleri bakiyeyle tutarlılığı bozmaz, aksi
            // halde silinmiş bir hedefe ait satırlar geride kalırdı. Şemadaki
            // ON DELETE CASCADE zaten bunu yapar; FK zorlamasının kapalı
            // olabileceği adapter'lar için açıkça da siliyoruz.
            await this.contributionRepository?.deleteByGoal(input.id);

            await this.savingGoalRepository.delete(input.id);
        })
    }
}
