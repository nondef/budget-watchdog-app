import { Icon } from '@/domain/value-objects/icon';
import { IAccountRepository } from '@/domain/interfaces/account-repository.interface';
import { EntityNotFoundException } from '@/domain/exceptions/domain.exception';
import { AccountDTO, UpdateAccountInput } from '@/application/dto/account.dto';
import { AccountMapper } from "@/application/mappers";
import {
    BusinessRuleViolationException,
    IBudgetRepository,
    ISavingGoalRepository,
    IUnitOfWork
} from '@/domain';

export class UpdateAccountUseCase {
    constructor(
        private accountRepository: IAccountRepository,
        private budgetRepository: IBudgetRepository,
        private savingGoalRepository: ISavingGoalRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: UpdateAccountInput): Promise<AccountDTO> {
        return this.unitOfWork.run(async () => {
            const account = await this.accountRepository.findById(input.id)

            if (!account) {
                throw new EntityNotFoundException('Account', input.id);
            }

            if (input.isActive === false && account.isActive) {
                const [budgets, goals] = await Promise.all([
                    this.budgetRepository.findByAccount(account.id),
                    this.savingGoalRepository.findByAccount(account.id)
                ]);
                const activeBudgets = budgets.filter(budget => budget.isActive());
                const blockingGoals = goals.filter(
                    goal => goal.status === 'active' || goal.status === 'paused'
                );

                if (activeBudgets.length || blockingGoals.length) {
                    throw new BusinessRuleViolationException(
                        'An account with active budgets or saving goals cannot be deactivated',
                        {
                            accountId: account.id,
                            budgetIds: activeBudgets.map(budget => budget.id),
                            savingGoalIds: blockingGoals.map(goal => goal.id)
                        }
                    );
                }

                // Pasif hesap özet/toplam bakiyeye girmez (`AccountBalanceService`
                // yalnız aktif hesapları toplar). Bakiyesi olan bir hesabı
                // pasifleştirmek o parayı net toplamdan sessizce düşürürdü;
                // arşivlemeden önce fon başka hesaba aktarılıp bakiye sıfırlanmalı.
                if (!account.isZeroBalance()) {
                    throw new BusinessRuleViolationException(
                        'An account with a non-zero balance cannot be deactivated',
                        { accountId: account.id, balance: account.balance.amount }
                    );
                }
            }

            if (input.name !== undefined) account.rename(input.name);
            if (input.type !== undefined) account.changeType(input.type);
            if (input.notes !== undefined) account.updateNotes(input.notes);

            if (input.icon !== undefined) {
                account.changeIcon(Icon.create(
                    input.icon.name ?? account.icon.name,
                    input.icon.color ?? account.icon.color
                ));
            }

            if (input.isActive !== undefined) {
                input.isActive ? account.activate() : account.deactivate();
            }

            await this.accountRepository.save(account);
            return AccountMapper.toDTO(account)
        })
    }
}
