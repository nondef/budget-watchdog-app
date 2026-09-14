import { describe, expect, it } from 'vitest'
import { AddTransactionUseCase } from '@/application/use-cases/transaction/add-transaction.use-case'
import { UpdateTransactionUseCase } from '@/application/use-cases/transaction/update-transaction.use-case'
import { DeleteTransactionUseCase } from '@/application/use-cases/transaction/delete-transaction.use-case'
import { TransactionCategorizationService } from '@/domain/services/transaction-categorization.service'
import { Account } from '@/domain/entities/account'
import { Transaction } from '@/domain/entities/transaction'
import { DomainErrorCode } from '@/domain/exceptions/domain.exception'

const USD = 'usd-id'
const TRY = 'try-id'
const EUR = 'eur-id'

function account(name: string, balance: number, currencyId: string) {
    return Account.create({
        name,
        type: 'bank',
        currencyId,
        balance,
        icon: { name: 'walletOutline', color: 'bg-blue-500' },
    })
}

function deps(accounts: Account[], transactions: Transaction[] = []) {
    const saved: Transaction[] = []
    const deleted: string[] = []

    return {
        saved,
        deleted,
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
            async findById(id: string) { return { id, type: 'expense' } },
        } as any,
        currencyRepository: { async findById(id: string) { return { id, minorUnit: 2 } } } as any,
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

function deleteUseCase(d: ReturnType<typeof deps>) {
    return new DeleteTransactionUseCase(
        d.transactionRepository,
        d.accountRepository,
        d.budgetRepository,
        d.effectRepository,
        d.unitOfWork,
    )
}

const date = new Date('2026-07-23T10:00:00')

function crossTransfer(fromId: string, toId: string) {
    return Transaction.create({
        title: 'FX transfer',
        amount: 100,
        currencyId: USD,
        date,
        type: 'transfer',
        accountId: fromId,
        toAccountId: toId,
        toAmount: 3400,
        toCurrencyId: TRY,
        toMinorUnit: 2,
    })
}

describe('Cross-currency transfer', () => {
    it('kaynağı kaynak para biriminde düşer, hedefi hedef para biriminde artırır', async () => {
        const from = account('USD hesap', 500, USD)
        const to = account('TRY hesap', 0, TRY)
        const d = deps([from, to])

        const result = await addUseCase(d).execute({
            title: 'FX',
            amount: 100,
            currencyId: USD,
            date,
            type: 'transfer',
            accountId: from.id,
            toAccountId: to.id,
            toAmount: 3400,
        })

        expect(from.balance.amount).toBe(400)
        expect(to.balance.amount).toBe(3400)
        expect(result.transaction.toAmount).toMatchObject({ amount: 3400, currencyId: TRY })
    })

    it('farklı para birimine transferde hedef tutar zorunludur', async () => {
        const from = account('USD hesap', 500, USD)
        const to = account('TRY hesap', 0, TRY)
        const d = deps([from, to])

        await expect(addUseCase(d).execute({
            title: 'FX',
            amount: 100,
            currencyId: USD,
            date,
            type: 'transfer',
            accountId: from.id,
            toAccountId: to.id,
        })).rejects.toMatchObject({
            code: DomainErrorCode.TRANSFER_DESTINATION_AMOUNT_REQUIRED,
        })

        expect(from.balance.amount).toBe(500)
        expect(to.balance.amount).toBe(0)
    })

    it('silme her bacağı kendi para biriminde geri alır', async () => {
        const from = account('USD hesap', 400, USD)
        const to = account('TRY hesap', 3400, TRY)
        const tx = crossTransfer(from.id, to.id)
        const d = deps([from, to], [tx])

        const result = await deleteUseCase(d).execute({ id: tx.id })

        expect(result.success).toBe(true)
        expect(from.balance.amount).toBe(500)
        expect(to.balance.amount).toBe(0)
    })

    it('kaynak tutarı değişince hedef bacak (farklı para) sabit kalır', async () => {
        const from = account('USD hesap', 400, USD)
        const to = account('TRY hesap', 3400, TRY)
        const tx = crossTransfer(from.id, to.id)
        const d = deps([from, to], [tx])

        await updateUseCase(d).execute({ id: tx.id, amount: 120 })

        expect(from.balance.amount).toBe(380)
        expect(to.balance.amount).toBe(3400)
    })

    it('hedef tutar açıkça güncellenebilir', async () => {
        const from = account('USD hesap', 400, USD)
        const to = account('TRY hesap', 3400, TRY)
        const tx = crossTransfer(from.id, to.id)
        const d = deps([from, to], [tx])

        await updateUseCase(d).execute({ id: tx.id, toAmount: 3600 })

        expect(from.balance.amount).toBe(400)
        expect(to.balance.amount).toBe(3600)
    })

    it('aynı-para transferde tutar değişince hedef otomatik senkronlanır', async () => {
        const from = account('TRY kaynak', 400, TRY)
        const to = account('TRY hedef', 100, TRY)
        const tx = Transaction.create({
            title: 'Transfer',
            amount: 100,
            currencyId: TRY,
            date,
            type: 'transfer',
            accountId: from.id,
            toAccountId: to.id,
        })
        const d = deps([from, to], [tx])

        await updateUseCase(d).execute({ id: tx.id, amount: 150 })

        expect(from.balance.amount).toBe(350)
        expect(to.balance.amount).toBe(150)
    })

    it('hedef başka para birimli hesaba taşınabilir', async () => {
        const from = account('USD kaynak', 400, USD)
        const oldTo = account('TRY hedef', 3400, TRY)
        const newTo = account('EUR hedef', 0, EUR)
        const tx = crossTransfer(from.id, oldTo.id)
        const d = deps([from, oldTo, newTo], [tx])

        await updateUseCase(d).execute({
            id: tx.id,
            toAccountId: newTo.id,
            toAmount: 90,
        })

        expect(oldTo.balance.amount).toBe(0)
        expect(newTo.balance.amount).toBe(90)
        expect(tx.toAmount?.currencyId).toBe(EUR)
    })
})
