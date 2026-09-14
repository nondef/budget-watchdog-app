import { Budget } from "@/domain";
import { BudgetNotification } from "@/application/dto/transaction.dto";

/**
 * Harcama işlendikten sonra bütçenin uyarı/aşım bildirimini üretir.
 *
 * Ekleme ve güncelleme akışları aynı kuralı kullanmalı: kural yalnızca
 * `AddTransactionUseCase` içinde gömülü durduğu için güncelleme hiç bildirim
 * üretmiyordu.
 *
 * @return Bildirim gerekmiyorsa (kapalı bildirim ayarı veya limit altı) `null`.
 */
export function buildBudgetNotification(budget: Budget): BudgetNotification | null {
    if (!budget.enableNotifications) {
        return null;
    }

    const type = budget.isExceeded()
        ? 'exceeded'
        : budget.isWarning()
            ? 'warning'
            : null;

    if (!type) {
        return null;
    }

    return {
        budgetId: budget.id,
        budgetName: budget.name,
        type,
        progress: budget.getProgress().value
    };
}
