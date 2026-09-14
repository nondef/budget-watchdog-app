import { describe, expect, it } from 'vitest'
import { Budget } from '@/domain/entities/budget'
import { Money } from '@/domain/value-objects/money'
import { UpdateBudgetUseCase } from '@/application/use-cases/budget/update-budget.use-case'
import { TransactionCategorizationService } from '@/domain/services/transaction-categorization.service'
import { Transaction } from '@/domain/entities/transaction'
import { DomainErrorCode } from '@/domain/exceptions/domain.exception'

const TRY = 'try-id'

function monthlyBudget(startDate: Date, now = startDate) {
    return Budget.create({
        name: 'Market',
        amount: 1000,
        accountId: 'acc1',
        currencyId: TRY,
        type: 'monthly',
        categoryIds: ['cat1'],
        startDate,
        icon: { name: 'walletOutline', color: 'bg-blue-500' },
    }, now)
}

function updateBudgetUseCase(
    budget: Budget,
    overrides: {
        transactions?: Transaction[]
        saved?: Budget[]
        deletedPeriods?: Date[]
        savedEffects?: unknown[]
    } = {}
) {
    return new UpdateBudgetUseCase(
        {
            async findById() { return budget },
            async save(b: Budget) { overrides.saved?.push(b) },
        } as any,
        { async findByIds(ids: string[]) { return ids.map(id => ({ id, type: 'expense' })) } } as any,
        { async findById(id: string) { return { id, currencyId: TRY, isActive: true } } } as any,
        {
            async findByBudgetCriteria() {
                return overrides.transactions ?? []
            },
        } as any,
        {
            async deleteByBudgetPeriod(_id: string, period: Date) {
                overrides.deletedPeriods?.push(period)
            },
            async saveMany(effects: unknown[]) {
                overrides.savedEffects?.push(...effects)
            },
        } as any,
        new TransactionCategorizationService(),
        { async run<T>(work: () => Promise<T>) { return work() } },
    )
}

describe('Budget.changePeriod', () => {
    it('sıfırlama sınırını bugünü aşana kadar ilerletir', () => {
        const start = new Date(2026, 0, 1)
        const budget = monthlyBudget(start, new Date(2026, 6, 1))
        const now = new Date(2026, 6, 23)

        // Düzenleme formu her kaydetmede orijinal startDate'i geri gönderiyor.
        budget.changePeriod('monthly', start, undefined, now)

        // Tek adımlık hesap 1 Şubat'ı verirdi: sınır geçmişte kalır, bütçe bir
        // sonraki açılışta "sıfırlanmalı" sayılıp harcamasını kaybederdi.
        expect(budget.nextResetDate).toEqual(new Date(2026, 7, 1))
        // `now` geçilmezse gerçek saat kullanılır ve test tarih geçince kırılır.
        expect(budget.shouldReset(now)).toBe(false)
    })

    it('düzenleme sonrası dönem harcaması korunur', async () => {
        const start = new Date(2026, 0, 1)
        const now = new Date(2026, 6, 15)
        const budget = monthlyBudget(start, new Date(2026, 6, 1))

        budget.addSpending(Money.create(400, TRY), new Date(2026, 6, 10))

        const saved: Budget[] = []

        const useCase = updateBudgetUseCase(budget, { saved })

        // Yalnızca ad değişiyor; form dönem alanlarını da aynen geri gönderiyor.
        await useCase.execute({
            id: budget.id,
            name: 'Market ve Gıda',
            type: 'monthly',
            startDate: start,
        })

        expect(saved).toHaveLength(1)
        expect(budget.shouldReset(now)).toBe(false)
        expect(budget.spentAmount.amount).toBe(400)
    })

    it('bütçe kaydı tek transaction sınırında yazılır', async () => {
        const budget = monthlyBudget(new Date(2026, 0, 1))
        let inTransaction = 0

        const useCase = new UpdateBudgetUseCase(
            {
                async findById() { return budget },
                // `save` budgets + iki junction tabloya yazıyor: sınır olmadan
                // yarıda kalan kayıt bütçeyi kategorisiz bırakırdı.
                async save() { expect(inTransaction).toBe(1) },
            } as any,
            { async findByIds(ids: string[]) { return ids.map(id => ({ id })) } } as any,
            {} as any,
            {} as any,
            {} as any,
            new TransactionCategorizationService(),
            {
                async run<T>(work: () => Promise<T>) {
                    inTransaction++
                    try { return await work() } finally { inTransaction-- }
                },
            },
        )

        await useCase.execute({ id: budget.id, name: 'Yeni ad' })
    })

    it('kapsam değişince toplamı ve effect ledgerını işlemlerden birlikte kurar', async () => {
        const now = new Date()
        const start = new Date(now.getFullYear(), now.getMonth(), 1)
        const transactionDate = new Date(now.getTime() - 60 * 60 * 1000)
        const budget = monthlyBudget(start, now)
        const transaction = Transaction.create({
            title: 'Market',
            amount: 325,
            currencyId: TRY,
            date: transactionDate,
            type: 'expense',
            categoryId: 'cat1',
            accountId: 'acc1',
        })
        budget.addSpending(transaction.amount, transaction.date)

        const deletedPeriods: Date[] = []
        const savedEffects: unknown[] = []
        const useCase = updateBudgetUseCase(budget, {
            transactions: [transaction],
            deletedPeriods,
            savedEffects,
        })

        await useCase.execute({
            id: budget.id,
            endDate: new Date(now.getFullYear() + 1, now.getMonth(), 1),
        })

        expect(budget.spentAmount.amount).toBe(325)
        expect(deletedPeriods).toEqual([budget.periodStart])
        expect(savedEffects).toHaveLength(1)
    })

    it('period değişince eski effect periodStart temizlenir', async () => {
        const now = new Date()
        const budget = monthlyBudget(
            new Date(now.getFullYear(), now.getMonth(), 1),
            now
        )
        const oldPeriodStart = new Date(budget.periodStart)
        const deletedPeriods: Date[] = []

        await updateBudgetUseCase(budget, { deletedPeriods }).execute({
            id: budget.id,
            type: 'weekly',
            startDate: new Date(now.getFullYear(), now.getMonth(), 1),
        })

        expect(deletedPeriods.some(period =>
            period.getTime() === oldPeriodStart.getTime()
        )).toBe(true)
    })
})

describe('Budget.create', () => {
    it('geçmiş başlangıçlı bütçe ilk açılışta sıfırlanmaz', () => {
        const now = new Date(2026, 6, 23)
        const budget = monthlyBudget(new Date(2026, 0, 1), now)

        expect(budget.nextResetDate).toEqual(new Date(2026, 7, 1))
        expect(budget.shouldReset(now)).toBe(false)
    })
})

describe('Budget.coversSpendingAt', () => {
    const service = new TransactionCategorizationService()

    function expense(date: Date, accountId = 'acc1') {
        return Transaction.create({
            title: 'Market',
            amount: 300,
            currencyId: TRY,
            date,
            type: 'expense',
            categoryId: 'cat1',
            accountId,
        })
    }

    it('sıfırlamadan önceki bir harcama artık bütçeyle eşleşmez', () => {
        const budget = monthlyBudget(new Date(2026, 0, 1))

        budget.reset(new Date(2026, 6, 1))

        // Şubat'taki bir işlem: harcaması sıfırlamayla zaten silindi. Eşleşmeye
        // devam etseydi silinmesi güncel dönemin harcamasını düşürürdü.
        const old = expense(new Date(2026, 1, 5))
        const current = expense(new Date(2026, 6, 10))

        expect(service.findMatchingBudgets(old, [budget], { requiredActive: false })).toEqual([])
        expect(service.findMatchingBudgets(current, [budget], { requiredActive: false })).toEqual([budget])
    })

    it('kapanmış dönemdeki işlemi silmek güncel dönemi etkilemez', () => {
        const budget = monthlyBudget(new Date(2026, 0, 1))

        budget.reset(new Date(2026, 6, 1))
        budget.addSpending(Money.create(300, TRY), new Date(2026, 6, 10))

        const old = expense(new Date(2026, 1, 5))
        const matching = service.findMatchingBudgets(old, [budget], { requiredActive: false })

        for (const b of matching) {
            b.removeSpending(old.amount, old.date)
        }

        expect(budget.spentAmount.amount).toBe(300)
    })

    it('ekleme ve geri alma aynı kuralı kullanır (simetri)', () => {
        const budget = monthlyBudget(new Date(2026, 0, 1))

        budget.reset(new Date(2026, 6, 1))

        // Geriye dönük tarihli bir işlem kapanmış döneme aitse eklemede de
        // eşleşmez; aksi halde kapanmış dönem güncel döneme yazılırdı.
        const backdated = expense(new Date(2026, 1, 5))

        expect(service.findMatchingBudgets(backdated, [budget])).toEqual([])
    })

    it('hiç sıfırlanmamış bütçede yalnızca hesaplanan güncel dönem geçerlidir', () => {
        const budget = monthlyBudget(new Date(2026, 0, 1))

        expect(service.findMatchingBudgets(expense(new Date(2026, 0, 15)), [budget])).toEqual([budget])
        expect(service.findMatchingBudgets(expense(new Date(2026, 1, 5)), [budget])).toEqual([])
    })
})

describe('Budget.complete', () => {
    it('tamamlanmış bütçe yeniden tamamlanamaz', () => {
        const budget = monthlyBudget(new Date(2026, 0, 1))

        budget.complete()

        expect(() => budget.complete())
            .toThrowError(expect.objectContaining({ code: DomainErrorCode.OPERATION_NOT_ALLOWED }))
    })
})
