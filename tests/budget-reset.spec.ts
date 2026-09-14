import { describe, expect, it } from 'vitest'
import { Budget } from '@/domain/entities/budget'
import { Money } from '@/domain/value-objects/money'
import { ResetBudgetsUseCase } from '@/application/use-cases/budget/reset-budgets.use-case'

function monthlyBudget(startDate: Date, amount = 1000) {
    // `now` = startDate: bütçe kurulduğu anda oluşturulmuş sayılır, ilk sıfırlama
    // sınırı bir sonraki dönem başı olur. (Gerçek "şimdi" verilseydi sınır
    // bugünün ötesine itilirdi — bkz. `Budget.create`'in `advanceResetDate`'i.)
    return Budget.create({
        name: 'Market',
        amount,
        accountId: 'acc1',
        currencyId: 'try-id',
        type: 'monthly',
        categoryIds: ['cat1'],
        startDate,
        icon: { name: 'walletOutline', color: 'bg-blue-500' },
    }, startDate)
}

describe('Budget.reset', () => {
    it('yeni dönem, "şimdi"den değil önceki dönem sınırından ilerler', () => {
        const budget = monthlyBudget(new Date(2026, 0, 1))

        // Sıfırlama, dönem sınırından 5 gün sonra çalışıyor (uygulama geç açıldı).
        budget.reset(new Date(2026, 1, 6))

        // Şubat sınırından bir ay: 1 Mart. "Şimdi"den hesaplansaydı 6 Mart olurdu.
        expect(budget.nextResetDate).toEqual(new Date(2026, 2, 1))
    })

    it('manuel temizlik dönem sınırını ilerletmez', () => {
        const budget = monthlyBudget(new Date(2026, 0, 1))
        const originalStart = budget.periodStart
        const originalEnd = budget.nextResetDate
        budget.addSpending(Money.create(250, 'try-id'), new Date(2026, 0, 15))

        budget.clearSpending()

        expect(budget.spentAmount.amount).toBe(0)
        expect(budget.periodStart).toEqual(originalStart)
        expect(budget.nextResetDate).toEqual(originalEnd)
    })

    it('manuel reset öncesi transaction tarihini dışlar', () => {
        const now = new Date(2026, 6, 15, 12)
        const budget = monthlyBudget(new Date(2026, 6, 1))

        budget.clearSpending(now)

        expect(budget.coversSpendingAt(new Date(2026, 6, 10))).toBe(false)
        expect(budget.coversSpendingAt(new Date(2026, 6, 16))).toBe(true)
        expect(budget.trackingStartDate).toEqual(now)
    })

    it('rollover manuel reset sınırını temizler', () => {
        const budget = monthlyBudget(new Date(2026, 5, 1))

        budget.clearSpending(new Date(2026, 5, 20))
        budget.reset(new Date(2026, 6, 15))

        expect(budget.trackingStartDate).toBeUndefined()
    })

    it('kaçırılan dönemleri atlar', () => {
        const budget = monthlyBudget(new Date(2026, 0, 1))

        // Uygulama üç ay açılmadı.
        budget.reset(new Date(2026, 3, 10))

        expect(budget.nextResetDate).toEqual(new Date(2026, 4, 1))
    })

    it('harcamayı ve günlük dağılımı temizler', () => {
        const budget = monthlyBudget(new Date(2026, 0, 1))
        budget.addSpending(Money.create(250, 'try-id'), new Date(2026, 0, 15))

        expect(budget.spentAmount.amount).toBe(250)

        budget.reset(new Date(2026, 1, 1))

        expect(budget.spentAmount.amount).toBe(0)
        expect(budget.dailySpent).toEqual([])
    })
})

describe('ResetBudgetsUseCase', () => {
    /** Silinen (budgetId, periodStart) çiftlerini toplayan sahte effect deposu. */
    function effectRepository(deleted: Array<{ budgetId: string; periodStart: Date }> = []) {
        return {
            deleted,
            repository: {
                async deleteByBudgetPeriod(budgetId: string, periodStart: Date) {
                    deleted.push({ budgetId, periodStart })
                },
            } as any,
        }
    }

    it('tüm sıfırlamaları tek transaction sınırında yürütür', async () => {
        const budgets = [monthlyBudget(new Date(2026, 0, 1)), monthlyBudget(new Date(2026, 0, 1))]
        const saved: string[] = []
        let inTransaction = 0

        const useCase = new ResetBudgetsUseCase(
            {
                async findNeedingReset() { return budgets },
                async save(b: Budget) {
                    // Kayıtların hepsi açık transaction içinde olmalı.
                    expect(inTransaction).toBe(1)
                    saved.push(b.id)
                    return b
                },
            } as any,
            effectRepository().repository,
            {
                async run<T>(work: () => Promise<T>) {
                    inTransaction++
                    try { return await work() } finally { inTransaction-- }
                },
            },
        )

        const result = await useCase.execute()

        expect(result.resetCount).toBe(2)
        expect(saved).toHaveLength(2)
    })

    it('kapanan dönemin etki kayıtlarını temizler', async () => {
        const budget = monthlyBudget(new Date(2026, 0, 1))
        const closingPeriodStart = budget.periodStart
        const effects = effectRepository()

        const useCase = new ResetBudgetsUseCase(
            {
                async findNeedingReset() { return [budget] },
                async save(b: Budget) { return b },
            } as any,
            effects.repository,
            { async run<T>(work: () => Promise<T>) { return work() } },
        )

        await useCase.execute()

        // Yeni dönemin değil, kapanan dönemin kayıtları silinmeli; aksi halde
        // tablo her rollover'da bir dönem daha biriktiriyordu.
        expect(effects.deleted).toEqual([
            { budgetId: budget.id, periodStart: closingPeriodStart },
        ])
        expect(budget.periodStart).not.toEqual(closingPeriodStart)
    })

    it('bir kayıt patlarsa hata yukarı taşınır (rollback UoW’a kalır)', async () => {
        const useCase = new ResetBudgetsUseCase(
            {
                async findNeedingReset() { return [monthlyBudget(new Date(2026, 0, 1))] },
                async save() { throw new Error('disk dolu') },
            } as any,
            effectRepository().repository,
            { async run<T>(work: () => Promise<T>) { return work() } },
        )

        await expect(useCase.execute()).rejects.toThrow('disk dolu')
    })
})
