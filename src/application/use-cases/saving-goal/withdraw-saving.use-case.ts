import { Money } from '@/domain/value-objects/money';
import { ISavingGoalRepository } from '@/domain/interfaces/saving-goal-repository.interface';
import { EntityNotFoundException } from '@/domain/exceptions/domain.exception';
import { WithdrawSavingInput, WithdrawSavingOutput } from '@/application/dto/saving-goal.dto';
import { SavingGoalMapper } from '@/application/mappers/saving-goal.mapper';
import { assertExists } from "@/application/shared/assert-exists";
import { recordSavingGoalContribution } from "@/application/shared/saving-goal-ledger";
import {
    IAccountRepository,
    ICurrencyRepository,
    ISavingGoalContributionRepository,
    IUnitOfWork
} from "@/domain";

export class WithdrawSavingUseCase {
    constructor(
        private savingGoalRepository: ISavingGoalRepository,
        private accountRepository: IAccountRepository,
        private currencyRepository: ICurrencyRepository,
        private unitOfWork: IUnitOfWork,
        private contributionRepository?: ISavingGoalContributionRepository
    ) {}

    async execute(input: WithdrawSavingInput): Promise<WithdrawSavingOutput> {
        return this.unitOfWork.run(async () => {
            const savingGoal = await this.savingGoalRepository.findById(input.goalId);

            if (!savingGoal) {
                throw new EntityNotFoundException('SavingGoal', input.goalId);
            }

            const currency = await assertExists(
                'Currency',
                input.currencyId,
                id => this.currencyRepository.findById(id)
            )
            const amount = Money.create(input.amount, input.currencyId, currency.minorUnit);

            // Hedeften çıkar (yetersiz birikim guard'ı), sonra parayı fon hesabına
            // iade et. Deposit aktiflik istemez — geri dönen para pasif hesaba da
            // yatabilir (işlem geri almalarıyla aynı mantık).
            savingGoal.withdrawSaving(amount);

            if (savingGoal.accountId) {
                const account = await assertExists(
                    'Account',
                    savingGoal.accountId,
                    id => this.accountRepository.findById(id)
                )

                account.deposit(amount);
                await this.accountRepository.save(account);
            }

            await this.savingGoalRepository.save(savingGoal);

            await recordSavingGoalContribution(this.contributionRepository, {
                goal: savingGoal,
                type: 'withdrawal',
                amount: amount.amount,
                note: input.note,
            });

            return { savingGoal: SavingGoalMapper.toDTO(savingGoal) };
        })
    }
}
