import { describe, expect, it } from 'vitest';
import { Currency, SavingGoal } from '@/domain';
import { CreateSavingGoalUseCase } from '@/application/use-cases/saving-goal/create-saving-goal.use-case';
import { UpdateSavingGoalUseCase } from '@/application/use-cases/saving-goal/update-saving-goal.use-case';
import { DeleteSavingGoalUseCase } from '@/application/use-cases/saving-goal/delete-saving-goal.use-case';
import { AddSavingUseCase } from '@/application/use-cases/saving-goal/add-saving.use-case';
import { WithdrawSavingUseCase } from '@/application/use-cases/saving-goal/withdraw-saving.use-case';
import { ChangeSavingGoalStatusUseCase } from '@/application/use-cases/saving-goal/change-saving-goal-status.use-case';

const immediateUow = {
    async run<T>(work: () => Promise<T>): Promise<T> {
        return work();
    },
};

/** Fon hesabı mock'u: use-case para hareketi için kullanır. */
function accountRepo(currencyId = 'try-id') {
    return {
        async findById(id: string) {
            return { id, isActive: true, currencyId, withdraw() {}, deposit() {} };
        },
        async save() {},
    } as any;
}

function currency(id = 'try-id', code = 'TRY', minorUnit = 2): Currency {
    return Currency.create({
        id,
        code,
        name: code,
        symbol: code,
        country: 'Test',
        minorUnit,
    });
}

function goal(initialAmount = 100): SavingGoal {
    return SavingGoal.create({
        name: 'Tatil',
        targetAmount: 1000,
        initialAmount,
        currencyId: 'try-id',
        icon: 'flag-outline',
        iconColor: 'blue',
    });
}

describe('Saving goal mutation use-cases', () => {
    it('CreateSavingGoal currency minor-unit bilgisini taşır', async () => {
        let saved: SavingGoal | undefined;
        const result = await new CreateSavingGoalUseCase(
            { async save(value: SavingGoal) { saved = value; } } as any,
            accountRepo('kwd-id'),
            { async findById() { return currency('kwd-id', 'KWD', 3); } } as any,
            immediateUow
        ).execute({
            name: 'KWD hedefi',
            targetAmount: 10.005,
            initialAmount: 1.005,
            currencyId: 'kwd-id',
            accountId: 'acc-kwd',
            icon: 'flag-outline',
            iconColor: 'blue',
        });

        expect(saved?.targetAmount.minorUnit).toBe(3);
        expect(result.savingGoal.targetAmount.amount).toBe(10.005);
    });

    it('UpdateSavingGoal alanları kaydeder', async () => {
        const entity = goal();
        const result = await new UpdateSavingGoalUseCase(
            { async findById() { return entity; }, async save() {} } as any,
            immediateUow
        ).execute({ id: entity.id, name: 'Yeni Tatil', targetAmount: 1500 });

        expect(result.savingGoal.name).toBe('Yeni Tatil');
        expect(result.savingGoal.targetAmount.amount).toBe(1500);
    });

    it('DeleteSavingGoal bulunan hedefi siler', async () => {
        const entity = goal();
        let deleted: string | undefined;
        await new DeleteSavingGoalUseCase(
            {
                async findById() { return entity; },
                async delete(id: string) { deleted = id; return true; },
            } as any,
            accountRepo(),
            immediateUow
        ).execute({ id: entity.id });

        expect(deleted).toBe(entity.id);
    });

    it('AddSaving hedef tutarını artırır', async () => {
        const entity = goal();
        const result = await new AddSavingUseCase(
            { async findById() { return entity; }, async save() {} } as any,
            accountRepo(),
            { async findById() { return currency(); } } as any,
            immediateUow
        ).execute({ goalId: entity.id, amount: 50, currencyId: 'try-id' });

        expect(result.savingGoal.savedAmount.amount).toBe(150);
    });

    it('WithdrawSaving hedef tutarını azaltır', async () => {
        const entity = goal();
        const result = await new WithdrawSavingUseCase(
            { async findById() { return entity; }, async save() {} } as any,
            accountRepo(),
            { async findById() { return currency(); } } as any,
            immediateUow
        ).execute({ goalId: entity.id, amount: 40, currencyId: 'try-id' });

        expect(result.savingGoal.savedAmount.amount).toBe(60);
    });

    it('ChangeSavingGoalStatus geçişi entity üzerinden uygular', async () => {
        const entity = goal();
        const result = await new ChangeSavingGoalStatusUseCase(
            { async findById() { return entity; }, async save() {} } as any,
            accountRepo(),
            immediateUow
        ).execute({ id: entity.id, action: 'pause' });

        expect(result.status).toBe('paused');
    });
});
