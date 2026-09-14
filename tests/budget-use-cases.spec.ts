import { describe, expect, it } from 'vitest';
import {
    Account,
    Budget,
    Category,
    Currency,
    Money,
    Transaction,
    TransactionBudgetEffect
} from '@/domain';
import { CreateBudgetUseCase } from '@/application/use-cases/budget/create-budget.use-case';
import { UpdateBudgetUseCase } from '@/application/use-cases/budget/update-budget.use-case';
import { DeleteBudgetUseCase } from '@/application/use-cases/budget/delete-budget.use-case';
import { ResetBudgetUseCase } from '@/application/use-cases/budget/reset-budget.use-case';
import { ChangeBudgetStatusUseCase } from '@/application/use-cases/budget/change-budget-status.use-case';
import { GetBudgetUseCase } from '@/application/use-cases/budget/get-budget.use-case';
import { ListBudgetsUseCase } from '@/application/use-cases/budget/list-budgets.use-case';
import { GetBudgetDetailUseCase } from '@/application/use-cases/budget/get-budget-detail.use-case';
import { TransactionCategorizationService } from '@/domain/services/transaction-categorization.service';

const immediateUow = {
    async run<T>(work: () => Promise<T>): Promise<T> {
        return work();
    },
};

function account(): Account {
    return Account.create({
        name: 'Kasa',
        type: 'cash',
        currencyId: 'try-id',
        balance: 1000,
        icon: { name: 'wallet-outline', color: 'blue' },
    });
}

function category(): Category {
    return Category.create({
        name: 'Market',
        type: 'expense',
        icon: 'cart-outline',
        color: 'blue',
    });
}

function currency(): Currency {
    return Currency.create({
        id: 'try-id',
        name: 'Türk Lirası',
        code: 'TRY',
        symbol: '₺',
        country: 'Türkiye',
        minorUnit: 2,
    });
}

function budget(startDate = new Date(2026, 0, 1), now = startDate): Budget {
    return Budget.create({
        name: 'Market',
        amount: 1000,
        accountId: 'account-1',
        currencyId: 'try-id',
        type: 'monthly',
        categoryIds: ['category-1'],
        startDate,
        icon: { name: 'wallet-outline', color: 'blue' },
    }, now);
}

describe('Budget use-cases', () => {
    it('CreateBudget ilişkileri doğrulayıp kaydeder', async () => {
        let saved: Budget | undefined;
        const acc = account();
        const cat = category();
        const useCase = new CreateBudgetUseCase(
            { async save(value: Budget) { saved = value; } } as any,
            { async findByIds() { return [cat]; } } as any,
            { async findById() { return currency(); } } as any,
            { async findById() { return acc; } } as any,
            { async findByBudgetCriteria() { return []; } } as any,
            {
                async deleteByBudgetPeriod() {},
                async saveMany() {},
            } as any,
            new TransactionCategorizationService(),
            immediateUow
        );

        const result = await useCase.execute({
            name: 'Market',
            amount: 500,
            accountId: acc.id,
            currencyId: 'try-id',
            type: 'monthly',
            categoryIds: [cat.id],
            startDate: new Date(2026, 6, 1),
            icon: { name: 'cart-outline', color: 'blue' },
        });

        expect(saved).not.toBeUndefined();
        expect(result.budget.amount.minorUnit).toBe(2);
    });

    it('CreateBudget güncel dönem transactionlarını toplar', async () => {
        const acc = account();
        const cat = category();
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const tx = Transaction.create({
            title: 'Market',
            amount: 120,
            accountId: acc.id,
            categoryId: cat.id,
            currencyId: 'try-id',
            type: 'expense',
            date: new Date(now.getFullYear(), now.getMonth(), 10),
        });
        const savedEffects: TransactionBudgetEffect[] = [];

        const result = await new CreateBudgetUseCase(
            { async save() {} } as any,
            { async findByIds() { return [cat]; } } as any,
            { async findById() { return currency(); } } as any,
            { async findById() { return acc; } } as any,
            { async findByBudgetCriteria() { return [tx]; } } as any,
            {
                async deleteByBudgetPeriod() {},
                async saveMany(effects: TransactionBudgetEffect[]) {
                    savedEffects.push(...effects);
                },
            } as any,
            new TransactionCategorizationService(),
            immediateUow
        ).execute({
            name: 'Market',
            amount: 500,
            accountId: acc.id,
            currencyId: 'try-id',
            type: 'monthly',
            categoryIds: [cat.id],
            startDate,
            icon: { name: 'cart-outline', color: 'blue' },
        });

        expect(result.budget.spentAmount.amount).toBe(120);
        expect(savedEffects).toHaveLength(1);
        expect(savedEffects[0].transactionId).toBe(tx.id);
    });

    it('DeleteBudget kaydı unit-of-work içinde siler', async () => {
        const entity = budget();
        let deleted: string | undefined;
        await new DeleteBudgetUseCase(
            {
                async findById() { return entity; },
                async delete(id: string) { deleted = id; return true; },
            } as any,
            immediateUow
        ).execute({ id: entity.id });

        expect(deleted).toBe(entity.id);
    });

    it('ResetBudget aynı dönem effectlerini ve aggregate harcamayı temizler', async () => {
        const entity = budget();
        entity.addSpending(entity.amount.divide(4), new Date(2026, 0, 10));
        let deletedPeriod: Date | undefined;

        const result = await new ResetBudgetUseCase(
            {
                async findById() { return entity; },
                async save() {},
            } as any,
            {
                async findByBudgetCriteria() { return []; },
            } as any,
            {
                async deleteByBudgetPeriod(_id: string, period: Date) {
                    deletedPeriod = period;
                },
                async saveMany() {},
            } as any,
            new TransactionCategorizationService(),
            immediateUow
        ).execute({ id: entity.id });

        expect(result.spentAmount.amount).toBe(0);
        expect(deletedPeriod).toEqual(entity.periodStart);
    });

    it('ChangeBudgetStatus süresi paused geçen bütçeyi resume sırasında rollover eder', async () => {
        const entity = budget(new Date(2020, 0, 1));
        entity.addSpending(entity.amount.divide(2), new Date(2020, 0, 10));
        entity.pause();
        const oldPeriodStart = entity.periodStart;
        let deletedPeriod: Date | undefined;

        const result = await new ChangeBudgetStatusUseCase(
            {
                async findById() { return entity; },
                async save() {},
            } as any,
            { async findById() { return account(); } } as any,
            {
                async deleteByBudgetPeriod(_id: string, period: Date) {
                    deletedPeriod = period;
                },
            } as any,
            immediateUow
        ).execute({ id: entity.id, action: 'resume' });

        expect(result.status).toBe('active');
        expect(result.spentAmount.amount).toBe(0);
        expect(result.periodStart.getTime()).toBeGreaterThan(oldPeriodStart.getTime());
        // Kapanan dönemin efekt kayıtları da temizlenmeli (rollover ile aynı bakım).
        expect(deletedPeriod).toEqual(oldPeriodStart);
    });

    function updateBudgetUseCase(entity: Budget) {
        return new UpdateBudgetUseCase(
            { async findById() { return entity; }, async save() {} } as any,
            { async findByIds() { return []; } } as any,
            { async findById() { return account(); } } as any,
            { async findByBudgetCriteria() { return []; } } as any,
            { async deleteByBudgetPeriod() {}, async saveMany() {} } as any,
            new TransactionCategorizationService(),
            immediateUow
        );
    }

    it('UpdateBudget aşılmış bütçede yalnız ad değişince bildirim üretmez', async () => {
        const entity = budget();
        entity.addSpending(Money.create(850, 'try-id', 2), new Date(2026, 0, 10)); // %85 → warning

        const result = await updateBudgetUseCase(entity).execute({
            id: entity.id,
            name: 'Yeni ad',
        });

        // Seviye değişmedi (warning → warning); finansal olmayan düzenleme
        // tekrar bildirim çıkarmamalı.
        expect(result.budgetNotification).toBeNull();
    });

    it('UpdateBudget gerçek seviye yükselişinde bildirir', async () => {
        const entity = budget();
        entity.addSpending(Money.create(850, 'try-id', 2), new Date(2026, 0, 10)); // %85 → warning

        const result = await updateBudgetUseCase(entity).execute({
            id: entity.id,
            amount: 800, // 850/800 → exceeded
        });

        expect(result.budgetNotification).toMatchObject({ type: 'exceeded' });
    });

    it('GetBudget bulunmayan bütçe için null döner', async () => {
        const result = await new GetBudgetUseCase({
            async findById() { return null; },
        } as any).execute({ id: 'missing' });
        expect(result).toBeNull();
    });

    it('ListBudgets status filtresini doğru repository metoduna yönlendirir', async () => {
        const entity = budget();
        let status: string | undefined;
        const result = await new ListBudgetsUseCase({
            async findByStatus(value: string) {
                status = value;
                return [entity];
            },
        } as any).execute({ status: 'active' });

        expect(status).toBe('active');
        expect(result.budgets).toHaveLength(1);
    });

    it('GetBudgetDetail birleşik okumayı UoW read snapshot içinde yapar', async () => {
        const entity = budget();
        let inRead = false;
        const useCase = new GetBudgetDetailUseCase(
            { async findById() { expect(inRead).toBe(true); return entity; } } as any,
            { async findById() { return account(); } } as any,
            { async findByIds() { return []; } } as any,
            { async findById() { return currency(); } } as any,
            { async findByIds() { return []; } } as any,
            { async findByBudgetPeriod() { return []; } } as any,
            {
                async run<T>(work: () => Promise<T>) { return work(); },
                async read<T>(work: () => Promise<T>) {
                    inRead = true;
                    try { return await work(); } finally { inRead = false; }
                },
            }
        );

        const result = await useCase.execute({ id: entity.id });
        expect(result?.budget.id).toBe(entity.id);
    });
});
