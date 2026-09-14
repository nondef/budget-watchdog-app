import { describe, expect, it } from 'vitest';
import { Account } from '@/domain/entities/account';
import { SavingGoal } from '@/domain/entities/saving-goal';
import { SavingGoalContribution } from '@/domain';
import { CreateSavingGoalUseCase } from '@/application/use-cases/saving-goal/create-saving-goal.use-case';
import { AddSavingUseCase } from '@/application/use-cases/saving-goal/add-saving.use-case';
import { WithdrawSavingUseCase } from '@/application/use-cases/saving-goal/withdraw-saving.use-case';
import { DeleteSavingGoalUseCase } from '@/application/use-cases/saving-goal/delete-saving-goal.use-case';
import { ChangeSavingGoalStatusUseCase } from '@/application/use-cases/saving-goal/change-saving-goal-status.use-case';

const TRY = 'try-id';
const uow = { async run<T>(work: () => Promise<T>): Promise<T> { return work(); } };

function account(balance: number) {
    return Account.create({
        name: 'Kasa',
        type: 'bank',
        currencyId: TRY,
        balance,
        minorUnit: 2,
        icon: { name: 'walletOutline', color: 'bg-blue-500' },
    });
}

function goal(accountId: string, savedInitial = 0, target = 1000) {
    return SavingGoal.create({
        name: 'Tatil',
        targetAmount: target,
        initialAmount: savedInitial,
        currencyId: TRY,
        minorUnit: 2,
        icon: 'flag-outline',
        iconColor: 'blue',
        accountId,
    });
}

/** Belleğe yazan sahte defter; sıra ve içerik doğrulanabilsin diye. */
function ledger() {
    const rows: SavingGoalContribution[] = [];

    return {
        rows,
        repository: {
            async findByGoal(goalId: string) { return rows.filter(r => r.goalId === goalId); },
            async findByAccount(accountId: string) { return rows.filter(r => r.accountId === accountId); },
            async findByGoals(ids: string[]) { return rows.filter(r => ids.includes(r.goalId)); },
            async save(row: SavingGoalContribution) { rows.push(row); },
            async deleteByGoal(goalId: string) {
                for (let i = rows.length - 1; i >= 0; i--) {
                    if (rows[i].goalId === goalId) rows.splice(i, 1);
                }
            },
        },
    };
}

function deps(acc: Account, existingGoal?: SavingGoal) {
    return {
        savingGoalRepository: {
            async findById() { return existingGoal ?? null; },
            async save() {},
            async delete() { return true; },
        } as any,
        accountRepository: {
            async findById(id: string) { return id === acc.id ? acc : null; },
            async save() {},
        } as any,
        currencyRepository: { async findById(id: string) { return { id, minorUnit: 2 }; } } as any,
    };
}

describe('Saving goal hareket defteri', () => {
    it('CreateSavingGoal başlangıç tutarı için initial satırı yazar', async () => {
        const acc = account(1000);
        const d = deps(acc);
        const book = ledger();

        await new CreateSavingGoalUseCase(
            d.savingGoalRepository, d.accountRepository, d.currencyRepository, uow, book.repository
        ).execute({
            name: 'Tatil',
            targetAmount: 1000,
            initialAmount: 200,
            currencyId: TRY,
            accountId: acc.id,
            icon: 'flag-outline',
            iconColor: 'blue',
        });

        expect(book.rows).toHaveLength(1);
        expect(book.rows[0]).toMatchObject({
            type: 'initial',
            amount: 200,
            balanceAfter: 200,
            accountId: acc.id,
            currencyId: TRY,
        });
    });

    it('başlangıç tutarı yoksa satır yazılmaz', async () => {
        const acc = account(1000);
        const d = deps(acc);
        const book = ledger();

        await new CreateSavingGoalUseCase(
            d.savingGoalRepository, d.accountRepository, d.currencyRepository, uow, book.repository
        ).execute({
            name: 'Tatil',
            targetAmount: 1000,
            currencyId: TRY,
            accountId: acc.id,
            icon: 'flag-outline',
            iconColor: 'blue',
        });

        expect(book.rows).toHaveLength(0);
    });

    it('AddSaving deposit satırı yazar; balanceAfter hedefin yeni toplamıdır', async () => {
        const acc = account(1000);
        const g = goal(acc.id, 100);
        const d = deps(acc, g);
        const book = ledger();

        await new AddSavingUseCase(
            d.savingGoalRepository, d.accountRepository, d.currencyRepository, uow, book.repository
        ).execute({ goalId: g.id, amount: 250, currencyId: TRY, note: 'maaş' });

        expect(book.rows).toHaveLength(1);
        expect(book.rows[0]).toMatchObject({
            type: 'deposit',
            amount: 250,
            balanceAfter: 350,
            note: 'maaş',
        });
    });

    it('WithdrawSaving withdrawal satırı yazar', async () => {
        const acc = account(1000);
        const g = goal(acc.id, 500);
        const d = deps(acc, g);
        const book = ledger();

        await new WithdrawSavingUseCase(
            d.savingGoalRepository, d.accountRepository, d.currencyRepository, uow, book.repository
        ).execute({ goalId: g.id, amount: 200, currencyId: TRY });

        expect(book.rows).toHaveLength(1);
        expect(book.rows[0]).toMatchObject({
            type: 'withdrawal',
            amount: 200,
            balanceAfter: 300,
        });
    });

    it('iptal, iade edilen tutar için refund satırı yazar', async () => {
        const acc = account(1000);
        const g = goal(acc.id, 400);
        const d = deps(acc, g);
        const book = ledger();

        await new ChangeSavingGoalStatusUseCase(
            d.savingGoalRepository, d.accountRepository, uow, book.repository
        ).execute({ id: g.id, action: 'cancel' });

        expect(book.rows).toHaveLength(1);
        expect(book.rows[0]).toMatchObject({
            type: 'refund',
            amount: 400,
            // `releaseSavedFunds()` hedefi sıfırlar: iadeden sonra hedefte para kalmaz.
            balanceAfter: 0,
        });
    });

    it('duraklat/devam et gibi geçişler deftere satır yazmaz', async () => {
        const acc = account(1000);
        const g = goal(acc.id, 400);
        const d = deps(acc, g);
        const book = ledger();

        await new ChangeSavingGoalStatusUseCase(
            d.savingGoalRepository, d.accountRepository, uow, book.repository
        ).execute({ id: g.id, action: 'pause' });

        expect(book.rows).toHaveLength(0);
    });

    it('hedef silinince defter satırları da silinir', async () => {
        const acc = account(1000);
        const g = goal(acc.id, 300);
        const d = deps(acc, g);
        const book = ledger();

        await new AddSavingUseCase(
            d.savingGoalRepository, d.accountRepository, d.currencyRepository, uow, book.repository
        ).execute({ goalId: g.id, amount: 100, currencyId: TRY });

        expect(book.rows).toHaveLength(1);

        await new DeleteSavingGoalUseCase(
            d.savingGoalRepository, d.accountRepository, uow, book.repository
        ).execute({ id: g.id });

        expect(book.rows).toHaveLength(0);
    });

    it('defter enjekte edilmezse para hareketi yine de çalışır', async () => {
        const acc = account(1000);
        const g = goal(acc.id, 0);
        const d = deps(acc, g);

        await new AddSavingUseCase(
            d.savingGoalRepository, d.accountRepository, d.currencyRepository, uow
        ).execute({ goalId: g.id, amount: 150, currencyId: TRY });

        expect(acc.balance.amount).toBe(850);
        expect(g.savedAmount.amount).toBe(150);
    });

    it('yetersiz bakiyede ne para hareketi ne defter satırı kalır', async () => {
        const acc = account(50);
        const g = goal(acc.id, 0);
        const d = deps(acc, g);
        const book = ledger();

        await expect(
            new AddSavingUseCase(
                d.savingGoalRepository, d.accountRepository, d.currencyRepository, uow, book.repository
            ).execute({ goalId: g.id, amount: 500, currencyId: TRY })
        ).rejects.toThrow();

        expect(book.rows).toHaveLength(0);
        expect(acc.balance.amount).toBe(50);
    });
});
