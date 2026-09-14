import {
    Budget,
    IBudgetRepository,
    ITransactionBudgetEffectRepository,
    ITransactionRepository
} from '@/domain';
import {
    TransactionCategorizationService
} from '@/domain/services/transaction-categorization.service';

export interface ReconcileBudgetPeriodDependencies {
    budgetRepository: IBudgetRepository;
    transactionRepository: ITransactionRepository;
    effectRepository: ITransactionBudgetEffectRepository;
    categorizationService: TransactionCategorizationService;
}

export interface ReconcileBudgetPeriodOptions {
    /** Coverage değişmeden önceki effect anahtarı. */
    previousPeriodStart?: Date;
}

/**
 * Bütçenin güncel dönem aggregate'ini transaction ledger'ından yeniden kurar.
 * Budget + effect yazımları çağıranın unit-of-work transaction'ı içinde olmalı.
 */
export async function reconcileBudgetPeriod(
    budget: Budget,
    dependencies: ReconcileBudgetPeriodDependencies,
    options: ReconcileBudgetPeriodOptions = {}
): Promise<void> {
    const {
        budgetRepository,
        transactionRepository,
        effectRepository,
        categorizationService
    } = dependencies;

    const resetBoundary = budget.nextResetDate
        ? new Date(budget.nextResetDate.getTime() - 1)
        : undefined;
    const configuredEnd = budget.dateRange.endDate;
    const periodEnd =
        configuredEnd && resetBoundary
            ? (configuredEnd < resetBoundary ? configuredEnd : resetBoundary)
            : configuredEnd ?? resetBoundary;

    const candidates = await transactionRepository.findByBudgetCriteria(
        budget.categoryIds,
        budget.accountId,
        budget.spendingStartDate,
        periodEnd
    );
    const matching = candidates.filter(transaction =>
        categorizationService.findMatchingBudgets(
            transaction,
            [budget],
            { requiredActive: false }
        ).length > 0
    );

    budget.reconcileSpending(
        matching.map(transaction => ({
            amount: transaction.amount,
            occurredAt: transaction.date,
        }))
    );

    // Create akışında budget FK'sı effectlerden önce mevcut olmalı.
    await budgetRepository.save(budget);

    // Dönem değişiminde hem eski hem yeni effect anahtarını temizle.
    const periodsToDelete = new Map<number, Date>();
    if (options.previousPeriodStart) {
        periodsToDelete.set(
            options.previousPeriodStart.getTime(),
            options.previousPeriodStart
        );
    }
    periodsToDelete.set(budget.periodStart.getTime(), budget.periodStart);

    for (const periodStart of periodsToDelete.values()) {
        await effectRepository.deleteByBudgetPeriod(budget.id, periodStart);
    }

    await effectRepository.saveMany(
        matching.map(transaction => ({
            transactionId: transaction.id,
            budgetId: budget.id,
            periodStart: budget.periodStart,
            amount: transaction.amount.amount,
            currencyId: transaction.amount.currencyId,
            occurredAt: transaction.date,
        }))
    );
}
