import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AddTransactionUseCase } from '@/application/use-cases/transaction/add-transaction.use-case'
import { UpdateTransactionUseCase } from '@/application/use-cases/transaction/update-transaction.use-case'
import { TransactionCategorizationService } from '@/domain/services/transaction-categorization.service'
import { Account } from '@/domain/entities/account'
import { Budget } from '@/domain/entities/budget'
import { Transaction } from '@/domain/entities/transaction'

const TRY = 'try-id'
const DATE = new Date(2026, 6, 23, 10)

/**
 * Use case'ler bütçe devrini gerçek saate göre yapıyor
 * (add/update-transaction → rolloverDueBudgets(..., new Date(), ...)).
 * Saat dondurulmazsa DATE geçmişte kalır, bütçe her çalıştırmada devredilir,
 * harcama sıfırlanır ve testler tarih ilerledikçe kendiliğinden kırılır.
 * Yalnızca Date sahteleniyor — timer/promise davranışı değişmesin.
 */
beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(DATE)
})

afterAll(() => {
    vi.useRealTimers()
})

function account(balance: number) {
    return Account.create({
        name: 'Kasa',
        type: 'bank',
        currencyId: TRY,
        balance,
        icon: { name: 'walletOutline', color: 'bg-blue-500' },
    })
}

function budgetFor(accountId: string, amount: number) {
    return Budget.create({
        name: 'Market',
        amount,
        accountId,
        currencyId: TRY,
        type: 'monthly',
        categoryIds: ['cat1'],
        startDate: new Date(2026, 6, 1),
        warningPercentage: 80,
        icon: { name: 'walletOutline', color: 'bg-blue-500' },
    }, new Date(2026, 6, 1))
}

function deps(accounts: Account[], budgets: Budget[], transactions: Transaction[] = []) {
    const effects = transactions.flatMap(transaction =>
        transaction.isExpense()
            ? budgets
                .filter(budget =>
                    budget.accountId === transaction.accountId &&
                    budget.hasCategory(transaction.categoryId ?? '') &&
                    budget.coversSpendingAt(transaction.date)
                )
                .map(budget => ({
                    transactionId: transaction.id,
                    budgetId: budget.id,
                    periodStart: budget.periodStart,
                    amount: transaction.amount.amount,
                    currencyId: transaction.currencyId,
                    occurredAt: transaction.date,
                }))
            : []
    )

    return {
        transactionRepository: {
            async findById(id: string) { return transactions.find(t => t.id === id) ?? null },
            async save() { /* noop */ },
            async delete() { return true },
        } as any,
        accountRepository: {
            async findById(id: string) { return accounts.find(a => a.id === id) ?? null },
            async save() { /* noop */ },
        } as any,
        budgetRepository: {
            async findById(id: string) { return budgets.find(b => b.id === id) ?? null },
            async findActive() { return budgets.filter(b => b.isActive()) },
            async findAll() { return budgets },
            async save() { /* noop */ },
        } as any,
        categoryRepository: { async findById(id: string) { return { id, type: 'expense' } } } as any,
        currencyRepository: { async findById(id: string) { return { id } } } as any,
        effectRepository: {
            async findByTransaction(transactionId: string) {
                return effects.filter(effect => effect.transactionId === transactionId)
            },
            async findByBudgetPeriod(budgetId: string, periodStart: Date) {
                return effects.filter(effect =>
                    effect.budgetId === budgetId &&
                    effect.periodStart.getTime() === periodStart.getTime()
                )
            },
            async saveMany(items: typeof effects) { effects.push(...items) },
            async deleteByTransaction(transactionId: string) {
                for (let i = effects.length - 1; i >= 0; i--) {
                    if (effects[i].transactionId === transactionId) effects.splice(i, 1)
                }
            },
            async deleteByBudgetPeriod(budgetId: string, periodStart: Date) {
                for (let i = effects.length - 1; i >= 0; i--) {
                    if (
                        effects[i].budgetId === budgetId &&
                        effects[i].periodStart.getTime() === periodStart.getTime()
                    ) effects.splice(i, 1)
                }
            },
        } as any,
        unitOfWork: { async run<T>(work: () => Promise<T>) { return work() } },
    }
}

function addUseCase(d: ReturnType<typeof deps>) {
    return new AddTransactionUseCase(
        d.transactionRepository,
        d.accountRepository,
        d.budgetRepository,
        new TransactionCategorizationService(),
        d.categoryRepository,
        d.currencyRepository,
        d.effectRepository,
        d.unitOfWork,
    )
}

function updateUseCase(d: ReturnType<typeof deps>) {
    return new UpdateTransactionUseCase(
        d.transactionRepository,
        d.accountRepository,
        d.categoryRepository,
        d.budgetRepository,
        new TransactionCategorizationService(),
        d.effectRepository,
        d.currencyRepository,
        d.unitOfWork,
    )
}

describe('AddTransactionUseCase — notes', () => {
    it('not alanı kaydedilir', async () => {
        const acc = account(500)
        const d = deps([acc], [])

        const result = await addUseCase(d).execute({
            title: 'Market',
            amount: 100,
            currencyId: TRY,
            date: DATE,
            type: 'expense',
            categoryId: 'cat1',
            accountId: acc.id,
            notes: 'kasa fişi arkada',
        })

        // Alan `Transaction.create`'e hiç geçilmiyordu: girdi kabul ediliyor
        // ama not sessizce düşüyordu.
        expect(result.transaction.notes).toBe('kasa fişi arkada')
    })
})

describe('AddTransactionUseCase — dönem dışı bütçe geri bildirimi', () => {
    function onceBudgetFor(accountId: string, amount: number) {
        // `once` bütçe hiç rollover olmaz; dönem sınırı `new Date()`'e bağlı
        // değil, bu yüzden test gerçek saatten bağımsız deterministik kalır.
        return Budget.create({
            name: 'Tatil bütçesi',
            amount,
            accountId,
            currencyId: TRY,
            type: 'once',
            categoryIds: ['cat1'],
            startDate: new Date(2026, 6, 1),
            icon: { name: 'walletOutline', color: 'bg-blue-500' },
        }, new Date(2026, 6, 1))
    }

    it('güncel dönemin dışına tarihli gider eşleşen bütçeyi skipped olarak bildirir', async () => {
        const acc = account(500)
        const onceBudget = onceBudgetFor(acc.id, 1000)
        const d = deps([acc], [onceBudget])

        const result = await addUseCase(d).execute({
            title: 'Geçmiş market',
            amount: 100,
            currencyId: TRY,
            date: new Date(2026, 5, 15), // bütçe başlangıcından önce → dönem dışı
            type: 'expense',
            categoryId: 'cat1',
            accountId: acc.id,
        })

        expect(result.skippedBudgets).toEqual([
            {
                budgetId: onceBudget.id,
                budgetName: 'Tatil bütçesi',
                reason: 'out-of-period',
            },
        ])
        // Harcama hiçbir bütçeye yazılmadı — ama para yine de hesaptan çıktı.
        expect(onceBudget.spentAmount.amount).toBe(0)
        expect(acc.balance.amount).toBe(400)
    })

    it('elle sıfırlama sonrası daha erken tarihli gider ayrı sebeple bildirilir', async () => {
        const acc = account(500)
        const onceBudget = onceBudgetFor(acc.id, 1000)

        // Kullanıcı bütçeyi bugün öğlen elle sıfırladı; sabahki bir gider artık
        // dönem içinde ama `trackingStartDate` sınırının altında kalıyor.
        onceBudget.clearSpending(new Date(2026, 6, 23, 12))

        const d = deps([acc], [onceBudget])

        const result = await addUseCase(d).execute({
            title: 'Sabahki market',
            amount: 100,
            currencyId: TRY,
            date: new Date(2026, 6, 23, 9),
            type: 'expense',
            categoryId: 'cat1',
            accountId: acc.id,
        })

        // Genel "dönem dışı" değil: kullanıcı sıfırlamayı kendisi yaptı, mesaj
        // bunu söylemeli.
        expect(result.skippedBudgets).toEqual([
            {
                budgetId: onceBudget.id,
                budgetName: 'Tatil bütçesi',
                reason: 'before-manual-reset',
            },
        ])
        expect(onceBudget.spentAmount.amount).toBe(0)
    })

    it('dönem içindeki gider bütçeye yazılır, skipped boş kalır', async () => {
        const acc = account(500)
        const onceBudget = onceBudgetFor(acc.id, 1000)
        const d = deps([acc], [onceBudget])

        const result = await addUseCase(d).execute({
            title: 'Market',
            amount: 100,
            currencyId: TRY,
            date: new Date(2026, 6, 15), // bütçe başlangıcından sonra → dönem içi
            type: 'expense',
            categoryId: 'cat1',
            accountId: acc.id,
        })

        expect(result.skippedBudgets).toEqual([])
        expect(onceBudget.spentAmount.amount).toBe(100)
    })
})

describe('AddTransactionUseCase — bütçe bildirim seviyesi', () => {
    it('zaten warning seviyesindeki bütçeye eklenen gider tekrar bildirim üretmez', async () => {
        const acc = account(10_000)
        const budget = budgetFor(acc.id, 1000)
        const d = deps([acc], [budget])

        const first = await addUseCase(d).execute({
            title: 'Market', amount: 850, currencyId: TRY, date: DATE,
            type: 'expense', categoryId: 'cat1', accountId: acc.id,
        })
        // İlk gider %80 eşiğini geçti → tek warning bildirimi.
        expect(first.budgetNotifications).toHaveLength(1)
        expect(first.budgetNotifications[0]).toMatchObject({ type: 'warning' })

        const second = await addUseCase(d).execute({
            title: 'Market 2', amount: 50, currencyId: TRY, date: DATE,
            type: 'expense', categoryId: 'cat1', accountId: acc.id,
        })
        // 900/1000 hâlâ warning — seviye yükselmedi, tekrar bildirmemeli.
        expect(second.budgetNotifications).toEqual([])
    })

    it('warning seviyesindeki bütçe exceeded olunca bir kez exceeded bildirir', async () => {
        const acc = account(10_000)
        const budget = budgetFor(acc.id, 1000)
        const d = deps([acc], [budget])

        await addUseCase(d).execute({
            title: 'Market', amount: 850, currencyId: TRY, date: DATE,
            type: 'expense', categoryId: 'cat1', accountId: acc.id,
        })
        const result = await addUseCase(d).execute({
            title: 'Market 2', amount: 300, currencyId: TRY, date: DATE,
            type: 'expense', categoryId: 'cat1', accountId: acc.id,
        })
        // warning → exceeded gerçek bir yükseliş: bildirilmeli.
        expect(result.budgetNotifications).toHaveLength(1)
        expect(result.budgetNotifications[0]).toMatchObject({ type: 'exceeded' })
    })
})

describe('UpdateTransactionUseCase — bütçe bildirimleri', () => {
    function expense(accountId: string, amount: number) {
        return Transaction.create({
            title: 'Market',
            amount,
            currencyId: TRY,
            date: DATE,
            type: 'expense',
            categoryId: 'cat1',
            accountId,
        })
    }

    it('tutar artışı limiti aşıyorsa bildirim üretir', async () => {
        const acc = account(10_000)
        const budget = budgetFor(acc.id, 1000)
        const tx = expense(acc.id, 100)

        budget.addSpending(tx.amount, tx.date)
        acc.withdraw(tx.amount)

        const d = deps([acc], [budget], [tx])

        const result = await updateUseCase(d).execute({ id: tx.id, amount: 5000 })

        // Eskiden `UpdateTransactionOutput`'ta bildirim alanı yoktu: bütçeyi
        // patlatan bir düzenleme kullanıcıya hiç yansımıyordu.
        expect(result.budgetNotifications).toHaveLength(1)
        expect(result.budgetNotifications[0]).toMatchObject({
            budgetId: budget.id,
            type: 'exceeded',
        })
    })

    it('uyarı eşiğini geçince warning üretir', async () => {
        const acc = account(10_000)
        const budget = budgetFor(acc.id, 1000)
        const tx = expense(acc.id, 100)

        budget.addSpending(tx.amount, tx.date)
        acc.withdraw(tx.amount)

        const d = deps([acc], [budget], [tx])

        const result = await updateUseCase(d).execute({ id: tx.id, amount: 900 })

        expect(result.budgetNotifications[0]).toMatchObject({ type: 'warning' })
    })

    it('limit altında kalan düzenleme bildirim üretmez', async () => {
        const acc = account(10_000)
        const budget = budgetFor(acc.id, 1000)
        const tx = expense(acc.id, 100)

        budget.addSpending(tx.amount, tx.date)
        acc.withdraw(tx.amount)

        const d = deps([acc], [budget], [tx])

        const result = await updateUseCase(d).execute({ id: tx.id, amount: 200 })

        expect(result.budgetNotifications).toEqual([])
    })

    it('bildirimi kapalı bütçe için uyarı üretilmez', async () => {
        const acc = account(10_000)
        const budget = budgetFor(acc.id, 1000)
        const tx = expense(acc.id, 100)

        budget.updateDetails({ enableNotifications: false })
        budget.addSpending(tx.amount, tx.date)
        acc.withdraw(tx.amount)

        const d = deps([acc], [budget], [tx])

        const result = await updateUseCase(d).execute({ id: tx.id, amount: 5000 })

        expect(result.budgetNotifications).toEqual([])
    })

    it('kategori değişince eski bütçeyi gerçek etki kaydından geri alır', async () => {
        const acc = account(10_000)
        const oldBudget = budgetFor(acc.id, 1000)
        const newBudget = budgetFor(acc.id, 1000)
        newBudget.updateDetails({ categoryIds: ['cat2'] })
        const tx = expense(acc.id, 100)

        oldBudget.addSpending(tx.amount, tx.date)
        acc.withdraw(tx.amount)

        const d = deps([acc], [oldBudget, newBudget], [tx])
        await updateUseCase(d).execute({ id: tx.id, categoryId: 'cat2' })

        expect(oldBudget.spentAmount.amount).toBe(0)
        expect(newBudget.spentAmount.amount).toBe(100)
    })

    it('yalnız not değişikliğinde finansal etkileri yazmaz', async () => {
        const acc = account(10_000)
        const budget = budgetFor(acc.id, 1000)
        const tx = expense(acc.id, 900)

        budget.addSpending(tx.amount, tx.date)
        acc.withdraw(tx.amount)

        const d = deps([acc], [budget], [tx])
        let effectDeleteCount = 0
        let effectSaveCount = 0
        let accountSaveCount = 0
        d.effectRepository.deleteByTransaction =
            async () => { effectDeleteCount++ }
        d.effectRepository.saveMany =
            async () => { effectSaveCount++ }
        d.accountRepository.save =
            async () => { accountSaveCount++ }

        const result = await updateUseCase(d).execute({
            id: tx.id,
            notes: 'Fiş düzeltildi',
        })

        expect(budget.spentAmount.amount).toBe(900)
        expect(acc.balance.amount).toBe(9_100)
        expect(effectDeleteCount).toBe(0)
        expect(effectSaveCount).toBe(0)
        expect(accountSaveCount).toBe(0)
        expect(result.budgetNotifications).toEqual([])
    })

    it('warning seviyesinde kalınca tekrar bildirim üretmez', async () => {
        const acc = account(10_000)
        const budget = budgetFor(acc.id, 1000)
        const tx = expense(acc.id, 850)

        budget.addSpending(tx.amount, tx.date)
        acc.withdraw(tx.amount)

        const result = await updateUseCase(
            deps([acc], [budget], [tx])
        ).execute({
            id: tx.id,
            amount: 900,
        })

        expect(result.budgetNotifications).toEqual([])
    })
})
