export interface TransactionBudgetEffect {
    transactionId: string;
    budgetId: string;
    periodStart: Date;
    amount: number;
    currencyId: string;
    occurredAt: Date;
}

export interface ITransactionBudgetEffectRepository {
    findByTransaction(transactionId: string): Promise<TransactionBudgetEffect[]>;
    /** Toplu okuma: hesap detayında işlem başına ayrı sorgu atmamak için. */
    findByTransactions(transactionIds: string[]): Promise<TransactionBudgetEffect[]>;
    findByBudgetPeriod(budgetId: string, periodStart: Date): Promise<TransactionBudgetEffect[]>;
    saveMany(effects: TransactionBudgetEffect[]): Promise<void>;
    deleteByTransaction(transactionId: string): Promise<void>;
    deleteByBudgetPeriod(budgetId: string, periodStart: Date): Promise<void>;
}
