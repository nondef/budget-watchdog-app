import { Budget } from '@/domain';
import { SkippedBudgetReason } from '@/application/dto/transaction.dto';

/**
 * Harcamanın bütçeye neden işlenemediğini belirler.
 *
 * Ekleme ve güncelleme akışları aynı sebebi üretmeli: kural iki use-case'e
 * kopyalanırsa mesajlar zamanla ayrışır. Sıra önemli — bir bütçe aynı anda
 * birden çok şartı ihlal edebilir; kullanıcı için en açıklayıcı olan öne alınır
 * (manuel sıfırlama sınırı, "dönem dışı" genel ifadesinden daha bilgilendirici).
 *
 * @param budget Harcamayı alamayan bütçe.
 * @param occurredAt İşlemin tarihi.
 * @param currencyId İşlemin para birimi.
 */
export function skippedBudgetReason(
    budget: Budget,
    occurredAt: Date,
    currencyId: string
): SkippedBudgetReason {
    if (!budget.isActive()) {
        return 'inactive';
    }

    if (budget.currencyId !== currencyId) {
        return 'currency-mismatch';
    }

    // `trackingStartDate` yalnız manuel sıfırlamada kurulur; dönem başından
    // ilerideyse gerçek alt sınır odur (bkz. `Budget.spendingStartDate`).
    if (
        budget.trackingStartDate &&
        budget.trackingStartDate > budget.periodStart &&
        occurredAt < budget.trackingStartDate
    ) {
        return 'before-manual-reset';
    }

    if (!budget.coversSpendingAt(occurredAt)) {
        return 'out-of-period';
    }

    return 'unknown';
}
