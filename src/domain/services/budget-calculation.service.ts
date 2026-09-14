import { Budget } from '../entities/budget';
import { Money } from '../value-objects/money';
import { Percentage } from '../value-objects/percentage';

export interface BudgetStats {
    totalBudgets: number;
    activeBudgets: number;
    warningBudgets: number;
    exceededBudgets: number;
    totalAmount: Money;
    totalSpent: Money;
    averageProgress: Percentage;
}

/**
 * Budget Calculation Domain Service
 * Bütçe hesaplamaları için domain logic
 */
export class BudgetCalculationService {
    
    /**
     * Bütçe ilerleme yüzdesini hesapla
     */
    calculateProgress(spent: Money, total: Money): Percentage {
        if (!spent.hasSameCurrency(total)) {
            throw new Error('Currency mismatch');
        }
        return Percentage.fromRatio(spent.amount, total.amount);
    }

    /**
     * Günlük harcama limitini hesapla
     */
    calculateDailyAllowance(budget: Budget): Money {
        const daysRemaining = budget.dateRange.getDaysRemaining();
        
        if (!daysRemaining || daysRemaining <= 0) {
            return Money.zero(budget.currencyId, budget.amount.minorUnit);
        }
        
        const remaining = budget.getRemainingAmount();
        
        if (remaining.isNegative() || remaining.isZero()) {
            return Money.zero(budget.currencyId, budget.amount.minorUnit);
        }

        return remaining.divide(daysRemaining);
    }

    /**
     * Bütçenin sıfırlanması gerekip gerekmediğini kontrol et
     */
    shouldResetBudget(budget: Budget): boolean {
        return budget.shouldReset();
    }

    /**
     * Bütçe istatistiklerini hesapla
     */
    calculateStats(budgets: Budget[], currencyId: string): BudgetStats {
        const activeBudgets = budgets.filter(b => b.isActive());
        const warningBudgets = activeBudgets.filter(b => b.isWarning());
        const exceededBudgets = activeBudgets.filter(b => b.isExceeded());

        // Sadece aynı para birimindeki bütçeleri hesapla
        const sameCurrencyBudgets = activeBudgets.filter(b => b.currencyId === currencyId);
        const minorUnit = sameCurrencyBudgets[0]?.amount.minorUnit ?? 2;

        const totalAmount = sameCurrencyBudgets.reduce(
            (sum, b) => sum.add(b.amount),
            Money.zero(currencyId, minorUnit)
        );

        const totalSpent = sameCurrencyBudgets.reduce(
            (sum, b) => sum.add(b.spentAmount),
            Money.zero(currencyId, minorUnit)
        );

        const avgProgress = sameCurrencyBudgets.length > 0
            ? sameCurrencyBudgets.reduce((sum, b) => sum + b.getProgress().value, 0) / sameCurrencyBudgets.length
            : 0;

        return {
            totalBudgets: budgets.length,
            activeBudgets: activeBudgets.length,
            warningBudgets: warningBudgets.length,
            exceededBudgets: exceededBudgets.length,
            totalAmount,
            totalSpent,
            averageProgress: Percentage.create(Math.min(100, avgProgress))
        };
    }

    /**
     * Bütçe uyarı durumunu belirle
     */
    getBudgetAlertLevel(budget: Budget): 'normal' | 'warning' | 'danger' {
        if (budget.isExceeded()) {
            return 'danger';
        }
        if (budget.isWarning()) {
            return 'warning';
        }
        return 'normal';
    }

    /**
     * Aylık bütçe özeti
     */
    getMonthlyBudgetSummary(budgets: Budget[], currencyId: string): {
        monthlyBudgets: Budget[];
        totalMonthlyLimit: Money;
        totalMonthlySpent: Money;
        remainingMonthlyBudget: Money;
    } {
        const monthlyBudgets = budgets.filter(
            b => b.type === 'monthly' && b.isActive() && b.currencyId === currencyId
        );
        const minorUnit = monthlyBudgets[0]?.amount.minorUnit ?? 2;

        const totalMonthlyLimit = monthlyBudgets.reduce(
            (sum, b) => sum.add(b.amount),
            Money.zero(currencyId, minorUnit)
        );

        const totalMonthlySpent = monthlyBudgets.reduce(
            (sum, b) => sum.add(b.spentAmount),
            Money.zero(currencyId, minorUnit)
        );

        return {
            monthlyBudgets,
            totalMonthlyLimit,
            totalMonthlySpent,
            remainingMonthlyBudget: totalMonthlyLimit.subtract(totalMonthlySpent)
        };
    }
}

