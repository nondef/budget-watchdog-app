import { Transaction } from '../entities/transaction'
import { Budget } from '../entities/budget'
import { Category } from '../entities/category'
import { Money } from '../value-objects/money'
import { DateRange } from '../value-objects/date-range'
import { CurrencyMismatchException } from '../exceptions/domain.exception'

export interface CategorySpending {
    categoryId: string
    categoryName: string
    total: Money
    count: number
    percentage: number
}

export interface BudgetMatchingOptions {
    requiredActive?: boolean
}

/**
 * Transaction Categorization Domain Service
 * İşlem kategorilendirme ve analiz için domain logic
 */
export class TransactionCategorizationService {

    /** Günlük kova anahtarı (YYYY-MM-DD), yerel takvim gününe göre. */
    private static toDateKey(date: Date): string {
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')

        return `${date.getFullYear()}-${month}-${day}`
    }

    /**
     * Toplama metodları tek para birimi varsayar (görüntüleme katmanı bunları
     * para birimi başına çağırır). Karışık para birimi geldiğinde bazı yollar
     * (`getTopSpendingCategories` ham sayı toplamı) sessizce yanlış toplarken
     * bazıları (`Money.add`) fırlatıyordu; guard hepsini tek ve açık davranışa —
     * fail-fast — alır.
     */
    private static assertSingleCurrency(transactions: Transaction[]): void {
        const first = transactions[0]
        if (!first) return

        const mismatch = transactions.find(t => t.currencyId !== first.currencyId)
        if (mismatch) {
            throw new CurrencyMismatchException(first.currencyId, mismatch.currencyId)
        }
    }

    /**
     * İşlem için eşleşen bütçeleri bul
     */
    findMatchingBudgets(transaction: Transaction, budgets: Budget[], options: BudgetMatchingOptions = {}): Budget[] {
        const categoryId = transaction.categoryId

        if (!transaction.isExpense() || !transaction.accountId || !categoryId) {
            return [];
        }

        const requiredActive = options.requiredActive ?? true

        return budgets.filter(budget =>
            (!requiredActive || budget.isActive()) &&
            budget.accountId === transaction.accountId &&
            budget.currencyId === transaction.currencyId &&
            budget.hasCategory(categoryId) &&
            // Dönem kontrolü entity'ye ait: açık uçlu aralık + `reset()` sonrası
            // kapanmış dönemler `coversSpendingAt` içinde ele alınıyor.
            budget.coversSpendingAt(transaction.date)
        );
    }

    /**
     * İşlemle hesap + kategori + para birimi bakımından eşleşen ama harcama
     * tarihi bütçenin **güncel dönemi dışında** kaldığı için harcamayı almayan
     * aktif bütçeler.
     *
     * `findMatchingBudgets` bunları sessizce eler: geriye (kapanmış döneme) ya
     * da ileriye (sonraki döneme) tarihli bir gider hiçbir bütçeye yazılmadan
     * kaybolur ve kullanıcı bunu göremezdi. Ekleme/güncelleme akışı bu listeyi
     * "yansıtılamayan bütçe" olarak bildirir — `coversSpendingAt` guard'ına
     * takılan `addSpending` ile aynı geri bildirim kanalı.
     */
    findOutOfPeriodBudgets(transaction: Transaction, budgets: Budget[]): Budget[] {
        const categoryId = transaction.categoryId

        if (!transaction.isExpense() || !transaction.accountId || !categoryId) {
            return [];
        }

        return budgets.filter(budget =>
            budget.isActive() &&
            budget.accountId === transaction.accountId &&
            budget.currencyId === transaction.currencyId &&
            budget.hasCategory(categoryId) &&
            !budget.coversSpendingAt(transaction.date)
        );
    }

    /**
     * Kategori bazlı harcama toplamını hesapla
     */
    calculateCategorySpending(
        transactions: Transaction[],
        categoryId: string,
        dateRange: DateRange
    ): Money {
        TransactionCategorizationService.assertSingleCurrency(transactions);

        const currencyId = transactions[0]?.currencyId ?? 'TRY';
        const minorUnit = transactions[0]?.amount.minorUnit ?? 2;

        return transactions
            .filter(t =>
                t.categoryId === categoryId &&
                t.isExpense() &&
                dateRange.contains(t.date)
            )
            .reduce(
                (total, t) => total.add(t.amount),
                Money.zero(currencyId, minorUnit)
            );
    }

    /**
     * Tüm kategorilerin harcama dağılımını hesapla
     */
    calculateCategoryDistribution(
        transactions: Transaction[],
        categories: Category[],
        dateRange: DateRange
    ): CategorySpending[] {
        TransactionCategorizationService.assertSingleCurrency(transactions);

        const currencyId = transactions[0]?.currencyId ?? 'TRY';
        const minorUnit = transactions[0]?.amount.minorUnit ?? 2;

        // Expense transactions in date range
        const expenseTransactions = transactions.filter(
            t => t.isExpense() && dateRange.contains(t.date)
        );

        // Total spending
        const totalSpending = expenseTransactions.reduce(
            (sum, t) => sum.add(t.amount),
            Money.zero(currencyId, minorUnit)
        );

        // Group by category
        const categoryMap = this.groupSpendingByCategory(expenseTransactions, categories);

        // Convert to array and calculate percentages
        const result: CategorySpending[] = [];

        for (const [categoryId, data] of categoryMap.entries()) {
            result.push({
                categoryId,
                categoryName: data.name,
                total: Money.create(data.amount, currencyId, minorUnit),
                count: data.count,
                percentage: totalSpending.isZero()
                    ? 0
                    : (data.amount / totalSpending.amount) * 100
            });
        }

        // Sort by total descending
        return result.sort((a, b) => b.total.amount - a.total.amount);
    }

    /**
     * En çok harcama yapılan kategorileri getir
     */
    getTopSpendingCategories(
        transactions: Transaction[],
        categories: Category[],
        dateRange: DateRange,
        limit: number = 5
    ): CategorySpending[] {
        TransactionCategorizationService.assertSingleCurrency(transactions);

        const currencyId = transactions[0]?.currencyId ?? 'TRY';
        const minorUnit = transactions[0]?.amount.minorUnit ?? 2;

        const expenseTransactions = transactions.filter(
            t => t.isExpense() && dateRange.contains(t.date)
        );

        const categoryMap = this.groupSpendingByCategory(expenseTransactions, categories);

        const totalSpending = expenseTransactions.reduce(
            (sum, t) => sum + t.amount.amount,
            0
        );

        const result: CategorySpending[] = [];

        for (const [categoryId, data] of categoryMap.entries()) {
            result.push({
                categoryId,
                categoryName: data.name,
                total: Money.create(data.amount, currencyId, minorUnit),
                count: data.count,
                percentage: totalSpending === 0 ? 0 : (data.amount / totalSpending) * 100
            });
        }

        return result
            .sort((a, b) => b.total.amount - a.total.amount)
            .slice(0, limit);
    }

    /**
     * İşlemleri kategoriye göre gruplar; kategori adını verilen listeden alır.
     * Ad ham haliyle taşınır (varsayılan kategorilerde "defaultCategories.*"
     * i18n anahtarı olabilir); çeviri görüntüleme katmanının işidir.
     */
    private groupSpendingByCategory(
        expenseTransactions: Transaction[],
        categories: Category[]
    ): Map<string, { amount: number; count: number; name: string }> {
        const nameById = new Map(categories.map(c => [c.id, c.name]));
        const categoryMap = new Map<string, { amount: number; count: number; name: string }>();

        for (const transaction of expenseTransactions) {
            const categoryId = transaction.categoryId;

            // Kategorisiz işlem (transfer) dağılıma girmez.
            if (!categoryId) continue;

            const existing = categoryMap.get(categoryId);
            if (existing) {
                existing.amount += transaction.amount.amount;
                existing.count += 1;
            } else {
                categoryMap.set(categoryId, {
                    amount: transaction.amount.amount,
                    count: 1,
                    name: nameById.get(categoryId) ?? categoryId
                });
            }
        }

        return categoryMap;
    }

    /**
     * Günlük harcama trendi
     */
    getDailySpendingTrend(
        transactions: Transaction[],
        dateRange: DateRange
    ): Map<string, Money> {
        TransactionCategorizationService.assertSingleCurrency(transactions);

        const dailySpending = new Map<string, Money>();

        const expenseTransactions = transactions.filter(
            t => t.isExpense() && dateRange.contains(t.date)
        );

        for (const transaction of expenseTransactions) {
            // Yerel takvim günü — `toISOString()` UTC'ye çevirdiği için gece
            // yarısına yakın işlemler bir önceki güne düşüyordu (Budget'taki
            // `toDateKey` ile aynı kural).
            const dateKey = TransactionCategorizationService.toDateKey(transaction.date);
            const existing = dailySpending.get(dateKey);

            if (existing) {
                dailySpending.set(dateKey, existing.add(transaction.amount));
            } else {
                dailySpending.set(dateKey, transaction.amount);
            }
        }

        return dailySpending;
    }

    /**
     * Gelir vs Gider özeti
     */
    getIncomeExpenseSummary(
        transactions: Transaction[],
        dateRange: DateRange
    ): {
        totalIncome: Money;
        totalExpense: Money;
        netAmount: Money;
        incomeCount: number;
        expenseCount: number;
    } {
        TransactionCategorizationService.assertSingleCurrency(transactions);

        const currencyId = transactions[0]?.currencyId ?? 'TRY';
        const minorUnit = transactions[0]?.amount.minorUnit ?? 2;

        const filtered = transactions.filter(t => dateRange.contains(t.date));

        const incomeTransactions = filtered.filter(t => t.isIncome());
        const expenseTransactions = filtered.filter(t => t.isExpense());

        const totalIncome = incomeTransactions.reduce(
            (sum, t) => sum.add(t.amount),
            Money.zero(currencyId, minorUnit)
        );

        const totalExpense = expenseTransactions.reduce(
            (sum, t) => sum.add(t.amount),
            Money.zero(currencyId, minorUnit)
        );

        return {
            totalIncome,
            totalExpense,
            netAmount: totalIncome.subtract(totalExpense),
            incomeCount: incomeTransactions.length,
            expenseCount: expenseTransactions.length
        };
    }
}
