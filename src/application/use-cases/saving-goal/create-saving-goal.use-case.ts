import { SavingGoal } from '@/domain/entities/saving-goal';
import { ISavingGoalRepository } from '@/domain/interfaces/saving-goal-repository.interface';
import { CreateSavingGoalInput, CreateSavingGoalOutput } from '@/application/dto/saving-goal.dto';
import { SavingGoalMapper } from '@/application/mappers/saving-goal.mapper';
import {
    AccountInactiveException,
    CurrencyMismatchException,
    IAccountRepository,
    ICurrencyRepository,
    ISavingGoalContributionRepository,
    IUnitOfWork,
    Money
} from "@/domain";
import { assertExists } from "@/application/shared/assert-exists";
import { recordSavingGoalContribution } from "@/application/shared/saving-goal-ledger";

export class CreateSavingGoalUseCase {
    constructor(
        private savingGoalRepository: ISavingGoalRepository,
        private accountRepository: IAccountRepository,
        private currencyRepository: ICurrencyRepository,
        private unitOfWork: IUnitOfWork,
        private contributionRepository?: ISavingGoalContributionRepository
    ) {}

    async execute(input: CreateSavingGoalInput): Promise<CreateSavingGoalOutput> {
        return this.unitOfWork.run(async () => {
            const currency = await assertExists(
                'Currency',
                input.currencyId,
                id => this.currencyRepository.findById(id)
            )

            // Fon hesabı: hedefin para birimiyle uyumlu ve aktif olmalı. Başlangıç
            // tutarı bu hesaptan düşülür ki "biriken para" hesap bakiyesiyle çift
            // sayılmasın.
            const account = await assertExists(
                'Account',
                input.accountId,
                id => this.accountRepository.findById(id)
            )

            if (!account.isActive) {
                throw new AccountInactiveException(account.id)
            }
            if (account.currencyId !== input.currencyId) {
                throw new CurrencyMismatchException(account.currencyId, input.currencyId)
            }

            const savingGoal = SavingGoal.create({
                name: input.name,
                targetAmount: input.targetAmount,
                currencyId: input.currencyId,
                minorUnit: currency.minorUnit,
                targetDate: input.targetDate ?? undefined,
                icon: input.icon,
                iconColor: input.iconColor,
                description: input.description,
                initialAmount: input.initialAmount,
                accountId: input.accountId,
            });

            if (input.initialAmount && input.initialAmount > 0) {
                account.withdraw(Money.create(input.initialAmount, input.currencyId, currency.minorUnit));
                await this.accountRepository.save(account);
            }

            await this.savingGoalRepository.save(savingGoal);

            // Defter satırı hedef yazıldıktan SONRA: `goal_id` foreign key'i
            // henüz var olmayan bir hedefe işaret edemez.
            if (input.initialAmount && input.initialAmount > 0) {
                await recordSavingGoalContribution(this.contributionRepository, {
                    goal: savingGoal,
                    type: 'initial',
                    amount: input.initialAmount,
                });
            }

            return { savingGoal: SavingGoalMapper.toDTO(savingGoal) };
        })
    }
}
