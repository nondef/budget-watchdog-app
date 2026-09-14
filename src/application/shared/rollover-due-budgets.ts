import { Budget } from "@/domain";
import { IBudgetRepository } from "@/domain/interfaces/budget-repository.interface";
import { ITransactionBudgetEffectRepository } from "@/domain/interfaces/transaction-budget-effect-repository.interface";

/**
 * Verilen aktif bütçelerden dönemi dolmuş olanları yerinde sıfırlar ve kapanan
 * dönemin efekt kayıtlarını temizler (`ResetBudgetsUseCase` ile aynı bakım).
 *
 * İşlem ekleme/güncelleme, harcamayı bütçelerle eşleştirmeden **önce** bunu
 * çağırmalı. Aksi halde zamanlanmış rollover (App.vue timer'ları) henüz
 * çalışmadıysa, yeni döneme ait bir harcama `Budget.coversSpendingAt` guard'ına
 * takılıp hiç kaydedilmiyor ve sonraki reset onu geri getirmediği için kalıcı
 * olarak kayboluyordu.
 *
 * Sıfırlama sınırı gerçek "şimdi"ye göre hesaplanır; geriye dönük tarihli bir
 * işlem rollover'ı tetiklemez (kapanmış döneme harcama eklenmesi zaten
 * `coversSpendingAt` tarafından reddedilir).
 *
 * @param budgets Yerinde sıfırlanacak aktif bütçeler (çağıran `findActive()`
 *   sonucunu verir; aynı diziyi eşleştirmede kullanmaya devam edebilir).
 * @param now
 * @param budgetRepository
 * @param effectRepository
 */
export async function rolloverDueBudgets(
    budgets: Budget[],
    now: Date,
    budgetRepository: IBudgetRepository,
    effectRepository: ITransactionBudgetEffectRepository
): Promise<void> {
    for (const budget of budgets) {
        if (!budget.shouldReset(now)) {
            continue;
        }

        const closingPeriodStart = budget.periodStart;
        budget.reset(now);

        await effectRepository.deleteByBudgetPeriod(budget.id, closingPeriodStart);
        await budgetRepository.save(budget);
    }
}
