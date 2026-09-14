import { describe, expect, it } from 'vitest'
import { DeleteAccountUseCase } from '@/application/use-cases/account/delete-account.use-case'
import { DeleteCategoryUseCase } from '@/application/use-cases/category/delete-category.use-case'
import { DomainErrorCode } from '@/domain/exceptions/domain.exception'

const unitOfWork = { async run<T>(work: () => Promise<T>) { return work() } }

/** Belirtilen id'yi bulan, kalanına boş dönen minimal repo çifti. */
function repos(opts: { transactions?: unknown[]; budgets?: unknown[]; savingGoals?: unknown[] } = {}) {
    return {
        transactionRepository: {
            async findByAccount() { return opts.transactions ?? [] },
            async findByCategory() { return opts.transactions ?? [] },
        } as any,
        budgetRepository: {
            async findByAccount() { return opts.budgets ?? [] },
            async findByCategory() { return opts.budgets ?? [] },
        } as any,
        savingGoalRepository: {
            async findByAccount() { return opts.savingGoals ?? [] },
        } as any,
    }
}

describe('DeleteAccountUseCase', () => {
    const accountRepo = (deleted: string[]) => ({
        async findById(id: string) { return { id } },
        async delete(id: string) { deleted.push(id); return true },
    }) as any

    it('bağlı işlem varsa silmez', async () => {
        const deleted: string[] = []
        const { transactionRepository, budgetRepository, savingGoalRepository } = repos({ transactions: [{ id: 't1' }] })
        const useCase = new DeleteAccountUseCase(accountRepo(deleted), transactionRepository, budgetRepository, savingGoalRepository, unitOfWork)

        await expect(useCase.execute({ id: 'a1' })).rejects.toMatchObject({
            code: DomainErrorCode.ACCOUNT_IN_USE,
        })
        expect(deleted).toEqual([])
    })

    it('bağlı bütçe varsa silmez', async () => {
        const deleted: string[] = []
        const { transactionRepository, budgetRepository, savingGoalRepository } = repos({ budgets: [{ id: 'b1' }] })
        const useCase = new DeleteAccountUseCase(accountRepo(deleted), transactionRepository, budgetRepository, savingGoalRepository, unitOfWork)

        await expect(useCase.execute({ id: 'a1' })).rejects.toMatchObject({
            code: DomainErrorCode.ACCOUNT_IN_USE,
        })
        expect(deleted).toEqual([])
    })

    it('bağlı birikim hedefi varsa silmez', async () => {
        const deleted: string[] = []
        const { transactionRepository, budgetRepository, savingGoalRepository } = repos({ savingGoals: [{ id: 'g1' }] })
        const useCase = new DeleteAccountUseCase(accountRepo(deleted), transactionRepository, budgetRepository, savingGoalRepository, unitOfWork)

        await expect(useCase.execute({ id: 'a1' })).rejects.toMatchObject({
            code: DomainErrorCode.ACCOUNT_IN_USE,
        })
        expect(deleted).toEqual([])
    })

    it('referansı olmayan hesabı siler', async () => {
        const deleted: string[] = []
        const { transactionRepository, budgetRepository, savingGoalRepository } = repos()
        const useCase = new DeleteAccountUseCase(accountRepo(deleted), transactionRepository, budgetRepository, savingGoalRepository, unitOfWork)

        await useCase.execute({ id: 'a1' })

        expect(deleted).toEqual(['a1'])
    })

    it('olmayan hesap için ENTITY_NOT_FOUND fırlatır', async () => {
        const { transactionRepository, budgetRepository, savingGoalRepository } = repos()
        const useCase = new DeleteAccountUseCase(
            { async findById() { return null } } as any,
            transactionRepository,
            budgetRepository,
            savingGoalRepository,
            unitOfWork,
        )

        await expect(useCase.execute({ id: 'yok' })).rejects.toMatchObject({
            code: DomainErrorCode.ENTITY_NOT_FOUND,
        })
    })
})

describe('DeleteCategoryUseCase', () => {
    const categoryRepo = (isSystem: boolean, deleted: string[]) => ({
        async findById(id: string) { return { id, canDelete: () => !isSystem } },
        async delete(id: string) { deleted.push(id); return true },
    }) as any

    it('sistem kategorisini silmez', async () => {
        const deleted: string[] = []
        const { transactionRepository, budgetRepository } = repos()
        const useCase = new DeleteCategoryUseCase(categoryRepo(true, deleted), transactionRepository, budgetRepository, unitOfWork)

        await expect(useCase.execute({ id: 'c1' })).rejects.toMatchObject({
            code: DomainErrorCode.SYSTEM_CATEGORY_ERROR,
        })
        expect(deleted).toEqual([])
    })

    it('kullanımdaki kategoriyi silmez', async () => {
        const deleted: string[] = []
        const { transactionRepository, budgetRepository } = repos({ transactions: [{ id: 't1' }] })
        const useCase = new DeleteCategoryUseCase(categoryRepo(false, deleted), transactionRepository, budgetRepository, unitOfWork)

        await expect(useCase.execute({ id: 'c1' })).rejects.toMatchObject({
            code: DomainErrorCode.CATEGORY_IN_USE,
        })
        expect(deleted).toEqual([])
    })

    it('kullanılmayan özel kategoriyi siler', async () => {
        const deleted: string[] = []
        const { transactionRepository, budgetRepository } = repos()
        const useCase = new DeleteCategoryUseCase(categoryRepo(false, deleted), transactionRepository, budgetRepository, unitOfWork)

        await useCase.execute({ id: 'c1' })

        expect(deleted).toEqual(['c1'])
    })
})
