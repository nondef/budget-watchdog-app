import { Money } from '@/domain/value-objects/money';
import { ISavingGoalRepository } from '@/domain/interfaces/saving-goal-repository.interface';
import { EntityNotFoundException } from '@/domain/exceptions/domain.exception';
import { AddSavingInput, AddSavingOutput } from '@/application/dto/saving-goal.dto';
import { SavingGoalMapper } from '@/application/mappers/saving-goal.mapper';
import { assertExists } from "@/application/shared/assert-exists";
import { recordSavingGoalContribution } from "@/application/shared/saving-goal-ledger";
import {
    AccountInactiveException,
    IAccountRepository,
    ICurrencyRepository,
    ISavingGoalContributionRepository,
    IUnitOfWork
} from "@/domain";

export class AddSavingUseCase {
    constructor(
        private savingGoalRepository: ISavingGoalRepository,
        private accountRepository: IAccountRepository,
        private currencyRepository: ICurrencyRepository,
        private unitOfWork: IUnitOfWork,
        private contributionRepository?: ISavingGoalContributionRepository
    ) {}

    async execute(input: AddSavingInput): Promise<AddSavingOutput> {
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

            // Önce hedefe ekle (durum/para birimi/tutar guard'ları). Sonra parayı
            // fon hesabından ayır — yetersiz bakiye guard'ı burada işler ve tümü
            // aynı transaction'da olduğu için biri patlarsa hiçbiri kalıcı olmaz.
            savingGoal.addSaving(amount);

            if (savingGoal.accountId) {
                const account = await assertExists(
                    'Account',
                    savingGoal.accountId,
                    id => this.accountRepository.findById(id)
                )

                if (!account.isActive) {
                    throw new AccountInactiveException(account.id);
                }

                account.withdraw(amount);
                await this.accountRepository.save(account);
            }

            await this.savingGoalRepository.save(savingGoal);

            // Defter satırı aynı transaction içinde yazılır: para hareketi olup
            // kaydı olmayan (ya da tersi) bir durum oluşamaz.
            await recordSavingGoalContribution(this.contributionRepository, {
                goal: savingGoal,
                type: 'deposit',
                amount: amount.amount,
                note: input.note,
            });

            return {
                savingGoal: SavingGoalMapper.toDTO(savingGoal),
                isCompleted: savingGoal.isCompleted()
            };
        })
    }
}
