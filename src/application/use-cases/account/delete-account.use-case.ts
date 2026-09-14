import { IAccountRepository } from '@/domain/interfaces/account-repository.interface';
import { ITransactionRepository } from '@/domain/interfaces/transaction-repository.interface';
import { IBudgetRepository } from '@/domain/interfaces/budget-repository.interface';
import { ISavingGoalRepository } from '@/domain/interfaces/saving-goal-repository.interface';
import { AccountInUseException, EntityNotFoundException } from '@/domain/exceptions/domain.exception';
import { IUnitOfWork } from '@/domain';

export class DeleteAccountUseCase {
    constructor(
        private accountRepository: IAccountRepository,
        private transactionRepository: ITransactionRepository,
        private budgetRepository: IBudgetRepository,
        private savingGoalRepository: ISavingGoalRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: { id: string }): Promise<void> {
        await this.unitOfWork.run(async () => {
            const account = await this.accountRepository.findById(input.id);

            if (!account) {
                throw new EntityNotFoundException('Account', input.id);
            }

            const [transactions, budgets, savingGoals] = await Promise.all([
                this.transactionRepository.findByAccount(input.id),
                this.budgetRepository.findByAccount(input.id),
                this.savingGoalRepository.findByAccount(input.id)
            ]);

            // Birikim hedefi de hesaba para bağlar: hesap silinirse hedefin fon
            // kaynağı yetim kalır ve iade edilemez. İşlem/bütçe ile aynı guard.
            if (transactions.length || budgets.length || savingGoals.length) {
                throw new AccountInUseException(input.id, {
                    transactions: transactions.length,
                    budgets: budgets.length,
                    savingGoals: savingGoals.length
                });
            }

            await this.accountRepository.delete(input.id);
        })
    }
}
