import { describe, expect, it } from 'vitest'
import { SavingGoal } from '@/domain/entities/saving-goal'
import { DomainErrorCode } from '@/domain/exceptions/domain.exception'
import { ListSavingGoalsUseCase } from '@/application/use-cases/saving-goal/list-saving-goals.use-case'
import { GetSavingGoalUseCase } from '@/application/use-cases/saving-goal/get-saving-goal.use-case'

const TRY = 'try-id'

function goal(overrides: Partial<Parameters<typeof SavingGoal.create>[0]> = {}) {
    return SavingGoal.create({
        name: 'Tatil',
        targetAmount: 1000,
        currencyId: TRY,
        icon: 'walletOutline',
        iconColor: 'bg-blue-500',
        ...overrides,
    })
}

describe('SavingGoal.create', () => {
    it('başlangıç tutarı hedefi karşılıyorsa hedef tamamlanmış olur', () => {
        // `addSaving` ve `updateDetails` bu geçişi yapıyordu; `create` yapmıyor
        // ve hedef "aktif ama %100" halinde takılı kalıyordu.
        expect(goal({ initialAmount: 1000 }).status).toBe('completed')
        expect(goal({ initialAmount: 1500 }).status).toBe('completed')
    })

    it('hedefin altındaki başlangıç tutarı aktif bırakır', () => {
        expect(goal({ initialAmount: 400 }).status).toBe('active')
        expect(goal().status).toBe('active')
    })

    it('negatif başlangıç tutarı reddedilir', () => {
        // `Money` negatifi kabul ettiği için eksi bakiyeli hedef kurulabiliyordu.
        expect(() => goal({ initialAmount: -50 }))
            .toThrowError(expect.objectContaining({ code: DomainErrorCode.NEGATIVE_AMOUNT }))
    })

    it('tamamlanmış hedef yükseltilince yeniden aktif olur', () => {
        const entity = goal({ targetAmount: 1000, initialAmount: 1000 })

        entity.updateDetails({ targetAmount: 1500 })

        expect(entity.status).toBe('active')
    })

    it('hedef tarihi açıkça temizlenebilir', () => {
        const entity = goal({ targetDate: new Date(2026, 11, 31) })

        entity.updateDetails({ targetDate: null })

        expect(entity.targetDate).toBeUndefined()
    })
})

describe('ListSavingGoalsUseCase', () => {
    it('en yeni önce sıralar', async () => {
        const older = goal({ name: 'Eski' })
        const newer = goal({ name: 'Yeni' })

        // `IRepository.findAll()` sıralama almıyor; sıralama use-case'in işi.
        Object.defineProperty(older, 'createdAt', { value: new Date(2026, 0, 1) })
        Object.defineProperty(newer, 'createdAt', { value: new Date(2026, 6, 1) })

        const useCase = new ListSavingGoalsUseCase({
            async findAll() { return [older, newer] },
        } as any)

        const result = await useCase.execute()

        expect(result.savingGoals.map(g => g.name)).toEqual(['Yeni', 'Eski'])
    })

    it('status verilince o duruma göre sorgular', async () => {
        const asked: string[] = []

        const useCase = new ListSavingGoalsUseCase({
            async findByStatus(status: string) { asked.push(status); return [] },
            async findAll() { throw new Error('findAll çağrılmamalı') },
        } as any)

        await useCase.execute({ status: 'completed' })

        expect(asked).toEqual(['completed'])
    })
})

describe('GetSavingGoalUseCase', () => {
    it('bulunamayan hedef için null döner', async () => {
        const useCase = new GetSavingGoalUseCase({ async findById() { return null } } as any)

        expect(await useCase.execute({ id: 'yok' })).toBeNull()
    })

    it('domain entity değil DTO döner', async () => {
        const entity = goal()
        const useCase = new GetSavingGoalUseCase({ async findById() { return entity } } as any)

        const dto = await useCase.execute({ id: entity.id })

        expect(dto).not.toBeInstanceOf(SavingGoal)
        expect(dto).toMatchObject({ id: entity.id, name: 'Tatil' })
    })
})
