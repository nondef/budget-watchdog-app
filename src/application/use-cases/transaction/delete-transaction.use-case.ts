import {
    Account,
    EntityNotFoundException,
    IAccountRepository,
    IBudgetRepository,
    ITransactionBudgetEffectRepository,
    ITransactionRepository,
    IUnitOfWork,
    Money
} from '@/domain';
import { DeleteTransactionInput, DeleteTransactionOutput } from '@/application/dto/transaction.dto';

export class DeleteTransactionUseCase {
    constructor(
        private transactionRepository: ITransactionRepository,
        private accountRepository: IAccountRepository,
        private budgetRepository: IBudgetRepository,
        private effectRepository: ITransactionBudgetEffectRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: DeleteTransactionInput): Promise<DeleteTransactionOutput> {
        return this.unitOfWork.run(async () => {
            const transaction = await this.transactionRepository.findById(input.id);

            if (!transaction) {
                throw new EntityNotFoundException('Transaction', input.id);
            }

            const accounts = new Map<string, Account>();
            for (const id of [transaction.accountId, transaction.toAccountId]) {
                if (!id || accounts.has(id)) continue;
                const account = await this.accountRepository.findById(id);
                if (!account) throw new EntityNotFoundException('Account', id);
                accounts.set(id, account);
            }

            // Geri alma `withdraw` değil `reverseDeposit` kullanır: yetersiz
            // bakiye guard'ı burada işlerse harcanmış bir gelir kaydı hiç
            // silinemez hale geliyordu.
            if (transaction.accountId) {
                const source = accounts.get(transaction.accountId)!;
                if (transaction.isIncome()) source.reverseDeposit(transaction.amount);
                else source.deposit(transaction.amount);
            }
            if (transaction.isTransfer() && transaction.toAccountId) {
                // Hedef bacak hedef hesabın para biriminde geri alınır. Eski
                // (bu özellikten önceki) transferlerde `toAmount` yoktur; onlar
                // hep aynı-para olduğu için `amount`'a düşülür.
                const toAmount = transaction.toAmount ?? transaction.amount;
                accounts.get(transaction.toAccountId)!.reverseDeposit(toAmount);
            }

            const effects = await this.effectRepository.findByTransaction(transaction.id);

            for (const effect of effects) {
                const budget = await this.budgetRepository.findById(effect.budgetId);

                if (!budget) {
                    throw new EntityNotFoundException('Budget', effect.budgetId);
                }
                if (budget.periodStart.getTime() !== effect.periodStart.getTime()) {
                    continue;
                }

                budget.removeSpending(
                    Money.create(effect.amount, effect.currencyId, budget.amount.minorUnit),
                    effect.occurredAt
                );

                await this.budgetRepository.save(budget);
            }

            for (const account of accounts.values()) {
                await this.accountRepository.save(account);
            }

            await this.effectRepository.deleteByTransaction(transaction.id);
            await this.transactionRepository.delete(transaction.id);

            return { success: true, skippedBudgets: [] };
        });
    }
}
