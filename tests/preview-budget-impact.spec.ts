import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AddTransactionUseCase } from '@/application/use-cases/transaction/add-transaction.use-case'
import {
    PreviewTransactionBudgetImpactUseCase
} from '@/application/use-cases/transaction/preview-transaction-budget-impact.use-case'
import { TransactionCategorizationService } from '@/domain/services/transaction-categorization.service'
import { Account } from '@/domain/entities/account'
import { Budget } from '@/domain/entities/budget'

const TRY = 'try-id'
const DATE = new Date(2026, 6, 23, 10)

// Bütçe devri gerçek saate göre yapılıyor; saat dondurulmazsa DATE geçmişte
// kalır ve bütçe her çalıştırmada sıfırlanır (kardeş testle aynı gerekçe).
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

function budgetFor(
    accountId: string,
    amount: number,
    options: { notifications?: boolean; name?: string; categoryIds?: string[] } = {}
) {
    return Budget.create({
        name: options.name ?? 'Market',
        amount,
        accountId,
        currencyId: TRY,
        type: 'monthly',
        categoryIds: options.categoryIds ?? ['cat1'],
        startDate: new Date(2026, 6, 1),
        warningPercentage: 80,
        enableNotifications: options.notifications ?? true,
        icon: { name: 'walletOutline', color: 'bg-blue-500' },
    }, new Date(2026, 6, 1))
}

function deps(accounts: Account[], budgets: Budget[]) {
    const effects: any[] = []

    return {
        effects,
        transactionRepository: {
            async findById() { return null },
            async save() { /* noop */ },
        } as any,
        accountRepository: {
            async findById(id: string) { return accounts.find(a => a.id === id) ?? null },
            async save() { /* noop */ },
        } as any,
        budgetRepository: {
            async findById(id: string) { return budgets.find(b => b.id === id) ?? null },
            async findActive() { return budgets.filter(b => b.isActive()) },
            async save() { /* noop */ },
        } as any,
        categoryRepository: { async findById(id: string) { return { id, type: 'expense' } } } as any,
        currencyRepository: { async findById(id: string) { return { id, minorUnit: 2 } } } as any,
        effectRepository: {
            async saveMany(items: any[]) { effects.push(...items) },
            async deleteByBudgetPeriod() { /* noop */ },
            async findByTransaction(transactionId: string) {
                return effects.filter(e => e.transactionId === transactionId)
            },
        } as any,
        unitOfWork: { async run<T>(work: () => Promise<T>) { return work() } },
    }
}

function preview(d: ReturnType<typeof deps>) {
    return new PreviewTransactionBudgetImpactUseCase(
        d.budgetRepository,
        d.currencyRepository,
        new TransactionCategorizationService(),
        d.unitOfWork,
        d.effectRepository,
    )
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

const expenseInput = (accountId: string, amount: number, extra: Record<string, unknown> = {}) => ({
    title: 'Market',
    amount,
    currencyId: TRY,
    categoryId: 'cat1',
    accountId,
    date: DATE,
    type: 'expense' as const,
    ...extra,
})

describe('Bütçe limiti önizlemesi', () => {
    it('limiti aşacak işlem için bütçeyi bildirir', async () => {
        const acc = account(10_000)
        const budget = budgetFor(acc.id, 1000)
        const d = deps([acc], [budget])

        const { breaches } = await preview(d).execute({
            accountId: acc.id,
            categoryId: 'cat1',
            currencyId: TRY,
            amount: 1200,
            date: DATE,
            type: 'expense',
        })

        expect(breaches).toHaveLength(1)
        expect(breaches[0]).toMatchObject({
            budgetName: 'Market',
            limit: { amount: 1000 },
            spentBefore: { amount: 0 },
            spentAfter: { amount: 1200 },
            overBy: { amount: 200 },
        })
    })

    it('limitin altında kalan işlemde uyarı yok', async () => {
        const acc = account(10_000)
        const d = deps([acc], [budgetFor(acc.id, 1000)])

        const { breaches } = await preview(d).execute({
            accountId: acc.id,
            categoryId: 'cat1',
            currencyId: TRY,
            amount: 400,
            date: DATE,
            type: 'expense',
        })

        expect(breaches).toEqual([])
    })

    it('önizleme hiçbir şeyi değiştirmez', async () => {
        const acc = account(10_000)
        const budget = budgetFor(acc.id, 1000)
        const d = deps([acc], [budget])

        await preview(d).execute({
            accountId: acc.id,
            categoryId: 'cat1',
            currencyId: TRY,
            amount: 1200,
            date: DATE,
            type: 'expense',
        })

        expect(budget.spentAmount.amount).toBe(0)
        expect(acc.balance.amount).toBe(10_000)
    })

    it('art arda çağrılabilir; sonuç birikmez', async () => {
        const acc = account(10_000)
        const d = deps([acc], [budgetFor(acc.id, 1000)])
        const input = {
            accountId: acc.id,
            categoryId: 'cat1',
            currencyId: TRY,
            amount: 600,
            date: DATE,
            type: 'expense' as const,
        }

        // 600 tek başına limiti aşmaz; iki önizleme üst üste binseydi ikincisi
        // 1200 görüp yanlış uyarırdı.
        expect((await preview(d).execute(input)).breaches).toEqual([])
        expect((await preview(d).execute(input)).breaches).toEqual([])
    })

    // Kullanici bildirimi: zaten asilmis butcede hic diyalog cikmiyordu ve
    // butce sessizce daha da asiliyordu. Artik uyarilir, metin farklidir.
    it('zaten aşılmış bütçe için de uyarır', async () => {
        const acc = account(10_000)
        const budget = budgetFor(acc.id, 1000)
        const d = deps([acc], [budget])

        await addUseCase(d).execute(expenseInput(acc.id, 1100))
        expect(budget.isExceeded()).toBe(true)

        const { breaches } = await preview(d).execute({
            accountId: acc.id,
            categoryId: 'cat1',
            currencyId: TRY,
            amount: 50,
            date: DATE,
            type: 'expense',
        })

        expect(breaches).toHaveLength(1)
        expect(breaches[0]).toMatchObject({
            alreadyExceeded: true,
            overByBefore: { amount: 100 },
            spentAfter: { amount: 1150 },
            overBy: { amount: 150 },
        })
    })

    it('sınırı ilk kez geçen işlemde alreadyExceeded false olur', async () => {
        const acc = account(10_000)
        const d = deps([acc], [budgetFor(acc.id, 1000)])

        const { breaches } = await preview(d).execute({
            accountId: acc.id,
            categoryId: 'cat1',
            currencyId: TRY,
            amount: 1200,
            date: DATE,
            type: 'expense',
        })

        expect(breaches[0]).toMatchObject({
            alreadyExceeded: false,
            overByBefore: { amount: 0 },
        })
    })

    it('bildirimleri kapalı bütçe için uyarmaz', async () => {
        const acc = account(10_000)
        const d = deps([acc], [budgetFor(acc.id, 1000, { notifications: false })])

        const { breaches } = await preview(d).execute({
            accountId: acc.id,
            categoryId: 'cat1',
            currencyId: TRY,
            amount: 5000,
            date: DATE,
            type: 'expense',
        })

        expect(breaches).toEqual([])
    })

    it('gelir ve transfer bütçe tüketmez', async () => {
        const acc = account(10_000)
        const d = deps([acc], [budgetFor(acc.id, 1000)])
        const base = {
            accountId: acc.id,
            categoryId: 'cat1',
            currencyId: TRY,
            amount: 5000,
            date: DATE,
        }

        expect((await preview(d).execute({ ...base, type: 'income' })).breaches).toEqual([])
        expect((await preview(d).execute({ ...base, type: 'transfer' })).breaches).toEqual([])
    })

    it('eşleşmeyen kategoride uyarmaz', async () => {
        const acc = account(10_000)
        const d = deps([acc], [budgetFor(acc.id, 1000, { categoryIds: ['baska-kategori'] })])

        const { breaches } = await preview(d).execute({
            accountId: acc.id,
            categoryId: 'cat1',
            currencyId: TRY,
            amount: 5000,
            date: DATE,
            type: 'expense',
        })

        expect(breaches).toEqual([])
    })

    it('birden çok bütçe aşılıyorsa hepsini döner', async () => {
        const acc = account(10_000)
        const budgets = [
            budgetFor(acc.id, 1000, { name: 'Market' }),
            budgetFor(acc.id, 500, { name: 'Genel' }),
        ]
        const d = deps([acc], budgets)

        const { breaches } = await preview(d).execute({
            accountId: acc.id,
            categoryId: 'cat1',
            currencyId: TRY,
            amount: 1200,
            date: DATE,
            type: 'expense',
        })

        expect(breaches.map(b => b.budgetName).sort()).toEqual(['Genel', 'Market'])
    })

    it('önizleme ile gerçek kaydın sonucu aynıdır', async () => {
        // Bu testin asıl amacı: diyalogda "aşılacak" denen şey kaydettikten
        // sonra gerçekten aşılmış olmalı. Eşik ya da eşleştirme değişirse
        // ikisinin ayrışmasını burada yakalarız.
        for (const amount of [999, 1000, 1001, 2500]) {
            const acc = account(10_000)
            const budget = budgetFor(acc.id, 1000)
            const d = deps([acc], [budget])

            const { breaches } = await preview(d).execute({
                accountId: acc.id,
                categoryId: 'cat1',
                currencyId: TRY,
                amount,
                date: DATE,
                type: 'expense',
            })

            await addUseCase(d).execute(expenseInput(acc.id, amount))

            expect(
                breaches.length > 0,
                `${amount} için önizleme (${breaches.length > 0}) ile gerçek sonuç (${budget.isExceeded()}) ayrıştı`
            ).toBe(budget.isExceeded())
        }
    })
describe('düzenleme (mevcut işlem)', () => {
        /** Bütçeye 600 yazılmış bir gider kurar; limit 1000. */
        const withExistingExpense = async () => {
            const acc = account(10_000)
            const budget = budgetFor(acc.id, 1000)
            const d = deps([acc], [budget])

            const { transaction } = await addUseCase(d).execute(expenseInput(acc.id, 600))

            return { acc, budget, d, txId: transaction.id }
        }

        it('aynı tutarla kaydetmek uyarı üretmez', async () => {
            const { acc, budget, d, txId } = await withExistingExpense()
            expect(budget.spentAmount.amount).toBe(600)

            const { breaches } = await preview(d).execute({
                transactionId: txId,
                accountId: acc.id,
                categoryId: 'cat1',
                currencyId: TRY,
                amount: 600,
                date: DATE,
                type: 'expense',
            })

            expect(breaches).toEqual([])
        })

        it('tutarı düşüren düzenleme uyarı üretmez', async () => {
            const { acc, d, txId } = await withExistingExpense()

            const { breaches } = await preview(d).execute({
                transactionId: txId,
                accountId: acc.id,
                categoryId: 'cat1',
                currencyId: TRY,
                amount: 200,
                date: DATE,
                type: 'expense',
            })

            expect(breaches).toEqual([])
        })

        it('eski etki düşülür; tutar iki kez sayılmaz', async () => {
            const { acc, d, txId } = await withExistingExpense()

            // 600 -> 900. Eski etki düşülmezse 600 + 900 = 1500 görülüp yanlış
            // uyarı çıkardı; doğrusu 600 - 600 + 900 = 900 < 1000.
            const { breaches } = await preview(d).execute({
                transactionId: txId,
                accountId: acc.id,
                categoryId: 'cat1',
                currencyId: TRY,
                amount: 900,
                date: DATE,
                type: 'expense',
            })

            expect(breaches).toEqual([])
        })

        it('tutarı limiti aşacak kadar artıran düzenleme uyarır', async () => {
            const { acc, d, txId } = await withExistingExpense()

            const { breaches } = await preview(d).execute({
                transactionId: txId,
                accountId: acc.id,
                categoryId: 'cat1',
                currencyId: TRY,
                amount: 1200,
                date: DATE,
                type: 'expense',
            })

            expect(breaches).toHaveLength(1)
            expect(breaches[0]).toMatchObject({
                spentAfter: { amount: 1200 },
                overBy: { amount: 200 },
                alreadyExceeded: false,
            })
        })

        it('transactionId verilmezse eski etki düşülmez (yeni işlem yolu)', async () => {
            const { acc, d } = await withExistingExpense()

            // Aynı tutar ama YENİ işlem olarak: 600 + 900 = 1500 → aşım.
            const { breaches } = await preview(d).execute({
                accountId: acc.id,
                categoryId: 'cat1',
                currencyId: TRY,
                amount: 900,
                date: DATE,
                type: 'expense',
            })

            expect(breaches).toHaveLength(1)
            expect(breaches[0]).toMatchObject({ spentAfter: { amount: 1500 } })
        })

        it('başka bütçeye taşınan düzenlemede yeni bütçe tam tutarı görür', async () => {
            const acc = account(10_000)
            const market = budgetFor(acc.id, 1000, { name: 'Market' })
            const gezi = budgetFor(acc.id, 500, { name: 'Gezi', categoryIds: ['cat2'] })
            const d = deps([acc], [market, gezi])

            const { transaction } = await addUseCase(d).execute(expenseInput(acc.id, 600))
            expect(market.spentAmount.amount).toBe(600)
            expect(gezi.spentAmount.amount).toBe(0)

            // Kategori cat2'ye taşınıyor: Gezi bütçesinde hiç etki yok,
            // dolayısıyla 600 tam tutar olarak eklenir ve 500 limitini aşar.
            const { breaches } = await preview(d).execute({
                transactionId: transaction.id,
                accountId: acc.id,
                categoryId: 'cat2',
                currencyId: TRY,
                amount: 600,
                date: DATE,
                type: 'expense',
            })

            expect(breaches).toHaveLength(1)
            expect(breaches[0]).toMatchObject({
                budgetName: 'Gezi',
                spentAfter: { amount: 600 },
                overBy: { amount: 100 },
            })
        })

        it('önizleme düzenleme yolunda da hiçbir şeyi değiştirmez', async () => {
            const { acc, budget, d, txId } = await withExistingExpense()

            await preview(d).execute({
                transactionId: txId,
                accountId: acc.id,
                categoryId: 'cat1',
                currencyId: TRY,
                amount: 5000,
                date: DATE,
                type: 'expense',
            })

            expect(budget.spentAmount.amount).toBe(600)
            expect(acc.balance.amount).toBe(9400)
        })
    })
})
