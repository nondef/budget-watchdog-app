import { Budget } from '@/domain';

export type BudgetAlertLevel = 'none' | 'warning' | 'exceeded';

export const BUDGET_ALERT_RANK: Record<BudgetAlertLevel, number> = {
    none: 0,
    warning: 1,
    exceeded: 2
};

/**
 * Bütçenin o anki bildirim seviyesi.
 *
 * `enableNotifications` kapalıysa her zaman `'none'` döner; böylece "seviye
 * yükseldi mi?" karşılaştırması yapan çağıranlar kapalı bildirimde asla
 * tetiklenmez. Aktiflik burada kontrol edilmez — o, çağıranın kararıdır
 * (ör. `UpdateBudgetUseCase` yalnız aktif bütçede bildirir).
 */
export function budgetAlertLevel(budget: Budget): BudgetAlertLevel {
    if (!budget.enableNotifications) return 'none';
    if (budget.isExceeded()) return 'exceeded';
    if (budget.isWarning()) return 'warning';
    return 'none';
}
