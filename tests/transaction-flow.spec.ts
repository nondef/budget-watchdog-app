import { describe, expect, it } from 'vitest'
import { AddTransactionUseCase } from '@/application/use-cases/transaction/add-transaction.use-case'
import { UpdateTransactionUseCase } from '@/application/use-cases/transaction/update-transaction.use-case'
import { DeleteTransactionUseCase } from '@/application/use-cases/transaction/delete-transaction.use-case'
import { TransactionCategorizationService } from '@/domain/services/transaction-categorization.service'
import { Account } from '@/domain/entities/account'
import { Budget } from '@/domain/entities/budget'
import { Transaction } from '@/domain/entities/transaction'
import { DomainErrorCode } from '@/domain/exceptions/domain.exception'
import { TransactionRepository } from '@/infrastructure/database/repositories/transaction-repository'

const TRY = 'try-id'

function account(name: string, balance: number, opts: { active?: boolean; currencyId?: string } = {}) {
    const entity = Account.create({
        name,
        type: 'bank',
        currencyId: opts.currencyId ?? TRY,
        balance,
        icon: { name: 'walletOutline', color: 'bg-blue-500' },
    })

    if (opts.active === false) entity.deactivate()

    return entity
}

/** Bellekte çalışan repo seti; UoW'u da düz çalıştırır. */
function deps(accounts: Account[], transactions: Transaction[] = []) {
    const saved: Transaction[] = []
    const deleted: string[] = []

    return {
        saved,
        deleted,
        accounts,
        transactionRepository: {
            async findById(id: string) { return transactions.find(t => t.id === id) ?? null },
            async save(t: Transaction) { saved.push(t); return t },
            async delete(id: string) { deleted.push(id); return true },
        } as any,
        accountRepository: {
            async findById(id: string) { return accounts.find(a => a.id === id) ?? null },
            async save(a: Account) { return a },
        } as any,
        budgetRepository: {
            async findActive() { return [] },
            async findAll() { return [] },
            async save() { return null },
        } as any,
        categoryRepository: {
            async findById(id: string) {
                return { id, type: id.startsWith('income') ? 'income' : 'expense' }
            }
        } as any,
        currencyRepository: { async findById(id: string) { return { id } } } as any,
        effectRepository: {
            async findByTransaction() { return [] },
            async saveMany() { /* noop */ },
            async deleteByTransaction() { /* noop */ },
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

describe('AddTransactionUseCase', () => {
    const baseInput = {
        title: 'Test',
        amount: 100,
        currencyId: TRY,
        date: new Date('2026-07-23T10:00:00'),
    }

    it('transfer kategori olmadan kaydedilir ve bakiyeleri taşır', async () => {
        const from = account('Kaynak', 500)
        const to = account('Hedef', 0)
        const d = deps([from, to])

        const result = await addUseCase(d).execute({
            ...baseInput,
            type: 'transfer',
            accountId: from.id,
            toAccountId: to.id,
        })

        expect(result.transaction.categoryId).toBeUndefined()
        expect(from.balance.amount).toBe(400)
        expect(to.balance.amount).toBe(100)
    })

    it('gelir/gider kategorisiz reddedilir', async () => {
        const acc = account('Kasa', 500)
        const d = deps([acc])

        await expect(addUseCase(d).execute({
            ...baseInput,
            type: 'expense',
            accountId: acc.id,
        })).rejects.toMatchObject({ code: DomainErrorCode.ENTITY_NOT_FOUND })

        expect(acc.balance.amount).toBe(500)
    })

    it('pasif hesaba işlem eklenmez', async () => {
        const acc = account('Kapalı', 500, { active: false })
        const d = deps([acc])

        await expect(addUseCase(d).execute({
            ...baseInput,
            type: 'expense',
            categoryId: 'cat1',
            accountId: acc.id,
        })).rejects.toMatchObject({ code: DomainErrorCode.ACCOUNT_INACTIVE })
    })
})

describe('UpdateTransactionUseCase', () => {
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

    function transfer(fromId: string, toId: string, amount = 100) {
        return Transaction.create({
            title: 'Transfer',
            amount,
            currencyId: TRY,
            date: new Date('2026-07-23T10:00:00'),
            type: 'transfer',
            accountId: fromId,
            toAccountId: toId,
        })
    }

    it('hedef hesap değişikliği bakiyelere yansır', async () => {
        const from = account('Kaynak', 400)
        const oldTo = account('Eski hedef', 100)
        const newTo = account('Yeni hedef', 0)
        const tx = transfer(from.id, oldTo.id)
        const d = deps([from, oldTo, newTo], [tx])

        await updateUseCase(d).execute({ id: tx.id, toAccountId: newTo.id })

        expect(oldTo.balance.amount).toBe(0)
        expect(newTo.balance.amount).toBe(100)
        expect(from.balance.amount).toBe(400)
    })

    it('hedef hesap kaynakla aynı yapılamaz', async () => {
        const from = account('Kaynak', 400)
        const to = account('Hedef', 100)
        const tx = transfer(from.id, to.id)
        const d = deps([from, to], [tx])

        await expect(updateUseCase(d).execute({ id: tx.id, toAccountId: from.id }))
            .rejects.toMatchObject({ code: DomainErrorCode.TRANSFER_SAME_ACCOUNT })
    })

    it('pasif hesaba taşınamaz', async () => {
        const from = account('Kaynak', 400)
        const to = account('Hedef', 100)
        const closed = account('Kapalı', 0, { active: false })
        const tx = transfer(from.id, to.id)
        const d = deps([from, to, closed], [tx])

        await expect(updateUseCase(d).execute({ id: tx.id, accountId: closed.id }))
            .rejects.toMatchObject({ code: DomainErrorCode.ACCOUNT_INACTIVE })
    })

    it('harcanmış gelirin tutarı düşürülebilir, bakiye eksiye düşer', async () => {
        // 1000 gelir geldi, 900'ü harcandı; hesapta 100 kaldı.
        const acc = account('Kasa', 100)
        const tx = Transaction.create({
            title: 'Maaş',
            amount: 1000,
            currencyId: TRY,
            date: new Date('2026-07-01T10:00:00'),
            type: 'income',
            categoryId: 'income-cat',
            accountId: acc.id,
        })
        const d = deps([acc], [tx])

        await updateUseCase(d).execute({ id: tx.id, amount: 100 })

        // Regresyon: tek net delta üzerinden `withdraw` çağrıldığı için guard
        // devreye girip yanlış girilen gelir hiç düzeltilemiyordu.
        expect(acc.balance.amount).toBe(-800)
    })

    it('gelir tutarı azaltılırken yalnızca net fark bakiyeden düşer', async () => {
        const acc = account('Kasa', 50)
        const tx = Transaction.create({
            title: 'Gelir',
            amount: 100,
            currencyId: TRY,
            date: new Date('2026-07-23T10:00:00'),
            type: 'income',
            categoryId: 'income-cat',
            accountId: acc.id,
        })
        const d = deps([acc], [tx])

        await updateUseCase(d).execute({ id: tx.id, amount: 80 })

        expect(acc.balance.amount).toBe(30)
    })
})

describe('DeleteTransactionUseCase', () => {
    it('harcanmış gelir silinebilir, bakiye eksiye düşer', async () => {
        // 1000 gelir geldi, 900'ü harcandı; hesapta 100 kaldı.
        const acc = account('Kasa', 100)
        const tx = Transaction.create({
            title: 'Maaş',
            amount: 1000,
            currencyId: TRY,
            date: new Date('2026-07-01T10:00:00'),
            type: 'income',
            categoryId: 'income-cat',
            accountId: acc.id,
        })
        const d = deps([acc], [tx])

        const useCase = new DeleteTransactionUseCase(
            d.transactionRepository,
            d.accountRepository,
            d.budgetRepository,
            d.effectRepository,
            d.unitOfWork,
        )

        const result = await useCase.execute({ id: tx.id })

        // Regresyon: geri alma `withdraw` ile yapıldığı için yetersiz bakiye
        // guard'ı devreye giriyor ve kayıt hiç silinemiyordu.
        expect(result.success).toBe(true)
        expect(d.deleted).toEqual([tx.id])
        expect(acc.balance.amount).toBe(-900)
    })

    it('bozuk bütçe effectinde silmeyi durdurup işlem izini korur', async () => {
        const acc = account('Kasa', 500)
        const tx = Transaction.create({
            title: 'Market',
            amount: 100,
            currencyId: TRY,
            date: new Date('2026-07-01T10:00:00'),
            type: 'expense',
            categoryId: 'cat1',
            accountId: acc.id,
        })
        const periodStart = new Date('2026-07-01T00:00:00')
        const budget = Budget.create({
            name: 'Market',
            amount: 1000,
            accountId: acc.id,
            currencyId: TRY,
            type: 'monthly',
            categoryIds: ['cat1'],
            startDate: periodStart,
            icon: { name: 'walletOutline', color: 'bg-blue-500' },
        }, periodStart)

        const d = deps([acc], [tx])
        d.budgetRepository.findById = async () => budget
        // Bozuk defter kaydı: effect başka para biriminde, `removeSpending`
        // CurrencyMismatch fırlatıyor.
        d.effectRepository.findByTransaction = async () => ([{
            transactionId: tx.id,
            budgetId: budget.id,
            periodStart: budget.periodStart,
            amount: 100,
            currencyId: 'usd-id',
            occurredAt: tx.date,
        }])

        const useCase = new DeleteTransactionUseCase(
            d.transactionRepository,
            d.accountRepository,
            d.budgetRepository,
            d.effectRepository,
            d.unitOfWork,
        )

        await expect(useCase.execute({ id: tx.id })).rejects.toMatchObject({
            code: DomainErrorCode.CURRENCY_MISMATCH,
        })
        expect(d.deleted).toEqual([])
    })

    it('transfer silinince her iki bakiye de geri alınır', async () => {
        const from = account('Kaynak', 400)
        const to = account('Hedef', 100)
        const tx = Transaction.create({
            title: 'Transfer',
            amount: 100,
            currencyId: TRY,
            date: new Date('2026-07-23T10:00:00'),
            type: 'transfer',
            accountId: from.id,
            toAccountId: to.id,
        })
        const d = deps([from, to], [tx])

        const useCase = new DeleteTransactionUseCase(
            d.transactionRepository,
            d.accountRepository,
            d.budgetRepository,
            d.effectRepository,
            d.unitOfWork,
        )

        const result = await useCase.execute({ id: tx.id })

        expect(result.success).toBe(true)
        expect(d.deleted).toEqual([tx.id])
        expect(from.balance.amount).toBe(500)
        expect(to.balance.amount).toBe(0)
    })
})

describe('TransactionRepository.findPage', () => {
    it('hesap filtresinde gelen transferleri de dahil eder', async () => {
        const calls: { sql: string; params: unknown[] }[] = []
        const repository = new TransactionRepository({
            async query(query: string, values?: unknown[]) {
                calls.push({ sql: query, params: values ?? [] })
                return { rows: [], rowsAffected: 0 }
            },
        } as any)

        await repository.findPage({ accountId: 'acc-1' })

        // Şema sondası (PRAGMA) sayılmaz: kalan iki sorgudan biri sayfa SELECT'i,
        // diğeri toplam COUNT'u; ikisi de aynı filtreyi kullanmalı.
        const dataCalls = calls.filter(call => !call.sql.startsWith('PRAGMA'))

        expect(dataCalls).toHaveLength(2)
        for (const call of dataCalls) {
            expect(call.sql).toContain('("account_id" = ? OR "to_account_id" = ?)')
            expect(call.params).toEqual(['acc-1', 'acc-1'])
        }
    })
})
