import { ISavingGoalRepository } from '@/domain/interfaces/saving-goal-repository.interface';
import { EntityNotFoundException } from '@/domain/exceptions/domain.exception';
import { SavingGoalMapper } from '@/application/mappers/saving-goal.mapper';
import { SavingGoalDTO } from '@/application/dto/saving-goal.dto';
import {
    Account,
    AccountInactiveException,
    IAccountRepository,
    ISavingGoalContributionRepository,
    IUnitOfWork
} from '@/domain';
import { assertExists } from '@/application/shared/assert-exists';
import { recordSavingGoalContribution } from '@/application/shared/saving-goal-ledger';

/** Entity'nin durum geçişi davranışlarıyla birebir eşleşir. */
export type SavingGoalStatusAction = 'pause' | 'resume' | 'complete' | 'cancel';

export interface ChangeSavingGoalStatusInput {
    id: string;
    action: SavingGoalStatusAction;
}

/**
 * Hedefin durumunu değiştirir (duraklat / devam ettir / tamamla / iptal et).
 *
 * Geçişin geçerliliğini entity doğrular (ör. yalnızca aktif hedef duraklatılır)
 * ve uygun `OperationNotAllowedException`'ı fırlatır.
 *
 * İptal, ayrılmış fonu fon hesabına iade eder (silme ile aynı ilke): eskiden
 * iptal edilen hedefteki para hesaba dönmüyor, `withdrawSaving` da iptal
 * durumunda bloke olduğu için para yalnızca kaydı tümden silerek geri
 * alınabiliyordu. Diğer geçişler hesaba dokunmaz.
 */
export class ChangeSavingGoalStatusUseCase {
    constructor(
        private savingGoalRepository: ISavingGoalRepository,
        private accountRepository: IAccountRepository,
        private unitOfWork: IUnitOfWork,
        private contributionRepository?: ISavingGoalContributionRepository
    ) {}

    async execute(input: ChangeSavingGoalStatusInput): Promise<SavingGoalDTO> {
        return this.unitOfWork.run(async () => {
            const savingGoal = await this.savingGoalRepository.findById(input.id);

            if (!savingGoal) {
                throw new EntityNotFoundException('SavingGoal', input.id);
            }

            // İadeyi geçiş uygulanmadan snapshot'la: `cancel()` durumu değiştirir
            // ama `savedAmount`'ı korur, iade tutarı bu yüzden önce okunur.
            const refund = input.action === 'cancel' ? savingGoal.savedAmount : null;
            let refundAccount: Account | null = null;

            if (
                input.action === 'cancel' &&
                refund?.isPositive() &&
                savingGoal.accountId
            ) {
                refundAccount = await assertExists(
                    'Account',
                    savingGoal.accountId,
                    id => this.accountRepository.findById(id)
                );
            }

            if (input.action === 'resume' && savingGoal.accountId) {
                const account = await assertExists(
                    'Account',
                    savingGoal.accountId,
                    id => this.accountRepository.findById(id)
                );

                if (!account.isActive) {
                    throw new AccountInactiveException(account.id);
                }
            }

            savingGoal[input.action]();

            if (input.action === 'cancel' && refund?.isPositive()) {
                // Hesaplı hedefte ayrılmış fon önce fon hesabına iade edilir.
                // Hesapsız (legacy/sanal) hedefte iade edilecek bir hesap yok;
                // tutar tarihsel kapanış olarak sıfırlanır ki fon `cancelled`
                // kayıtta erişilemez şekilde kilitlenmesin.
                if (refundAccount) {
                    refundAccount.deposit(refund);
                    await this.accountRepository.save(refundAccount);
                }
                savingGoal.releaseSavedFunds();
            }

            await this.savingGoalRepository.save(savingGoal);

            // İade deftere de yazılır: hesap bakiyesindeki artışın karşılığı
            // olan tek kayıt budur. releaseSavedFunds() sonrası hedefte 0
            // kaldığı için satırın `balanceAfter`ı da 0 olur.
            if (input.action === 'cancel' && refund?.isPositive()) {
                await recordSavingGoalContribution(this.contributionRepository, {
                    goal: savingGoal,
                    type: 'refund',
                    amount: refund.amount,
                });
            }

            return SavingGoalMapper.toDTO(savingGoal);
        })
    }
}
