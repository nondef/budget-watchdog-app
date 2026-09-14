import { describe, expect, it } from 'vitest';
import { Account } from '@/domain/entities/account';
import { SavingGoal } from '@/domain/entities/saving-goal';
import { DomainErrorCode } from '@/domain/exceptions/domain.exception';
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

function deps(acc: Account, existingGoal?: SavingGoal) {
    let goalSaved = false;
    return {
        goalSavedFlag: () => goalSaved,
        savingGoalRepository: {
            async findById() { return existingGoal ?? null; },
            async save() { goalSaved = true; },
            async delete() { return true; },
        } as any,
        accountRepository: {
            async findById(id: string) { return id === acc.id ? acc : null; },
            async save() {},
        } as any,
        currencyRepository: { async findById(id: string) { return { id, minorUnit: 2 }; } } as any,
    };
}

describe('Saving goal ↔ account', () => {
    it('CreateSavingGoal başlangıç tutarını fon hesabından düşer', async () => {
        const acc = account(1000);
        let created: SavingGoal | undefined;
        const d = deps(acc);
        d.savingGoalRepository.save = async (g: SavingGoal) => { created = g; };

        await new CreateSavingGoalUseCase(
            d.savingGoalRepository, d.accountRepository, d.currencyRepository, uow
        ).execute({
            name: 'Tatil',
            targetAmount: 1000,
            initialAmount: 200,
            currencyId: TRY,
            accountId: acc.id,
            icon: 'flag-outline',
            iconColor: 'blue',
        });

        expect(acc.balance.amount).toBe(800);
        expect(created?.savedAmount.amount).toBe(200);
        expect(created?.accountId).toBe(acc.id);
    });

    it('AddSaving hesaptan düşer, hedefi artırır', async () => {
        const acc = account(1000);
        const g = goal(acc.id, 0);
        const d = deps(acc, g);

        const result = await new AddSavingUseCase(
            d.savingGoalRepository, d.accountRepository, d.currencyRepository, uow
        ).execute({ goalId: g.id, amount: 300, currencyId: TRY });

        expect(acc.balance.amount).toBe(700);
        expect(result.savingGoal.savedAmount.amount).toBe(300);
    });

    it('WithdrawSaving hesaba iade eder ve tamamlanan hedefi yeniden açar', async () => {
        const acc = account(0);
        const g = goal(acc.id, 1000, 1000); // hedefe ulaşmış → completed
        expect(g.status).toBe('completed');
        const d = deps(acc, g);

        const result = await new WithdrawSavingUseCase(
            d.savingGoalRepository, d.accountRepository, d.currencyRepository, uow
        ).execute({ goalId: g.id, amount: 200, currencyId: TRY });

        expect(acc.balance.amount).toBe(200);
        expect(result.savingGoal.savedAmount.amount).toBe(800);
        expect(result.savingGoal.status).toBe('active');
    });

    it('DeleteSavingGoal ayrılmış parayı hesaba iade eder', async () => {
        const acc = account(0);
        const g = goal(acc.id, 500, 1000);
        const d = deps(acc, g);

        await new DeleteSavingGoalUseCase(
            d.savingGoalRepository, d.accountRepository, uow
        ).execute({ id: g.id });

        expect(acc.balance.amount).toBe(500);
    });

    it('bağlı hesap kayıpsa hedef silinmez', async () => {
        const acc = account(0);
        const g = goal('missing-account', 500, 1000);
        const d = deps(acc, g);
        let deleted = false;
        d.savingGoalRepository.delete = async () => {
            deleted = true;
            return true;
        };

        await expect(new DeleteSavingGoalUseCase(
            d.savingGoalRepository, d.accountRepository, uow
        ).execute({ id: g.id })).rejects.toMatchObject({
            code: DomainErrorCode.ENTITY_NOT_FOUND,
        });

        expect(deleted).toBe(false);
    });

    it('CancelGoal ayrılmış parayı hesaba iade eder ve hedefi boşaltır', async () => {
        const acc = account(0);
        const g = goal(acc.id, 500, 1000);
        const d = deps(acc, g);

        const result = await new ChangeSavingGoalStatusUseCase(
            d.savingGoalRepository, d.accountRepository, uow
        ).execute({ id: g.id, action: 'cancel' });

        expect(acc.balance.amount).toBe(500);
        expect(result.status).toBe('cancelled');
        // Para iki yerde birden görünmesin: hesaba döndükten sonra hedef boşalır.
        expect(result.savedAmount.amount).toBe(0);
    });

    it('cancel sırasında bağlı hesap kayıpsa hedef değiştirilmez', async () => {
        const acc = account(0);
        const g = goal('missing-account', 500, 1000);
        const d = deps(acc, g);

        await expect(new ChangeSavingGoalStatusUseCase(
            d.savingGoalRepository, d.accountRepository, uow
        ).execute({ id: g.id, action: 'cancel' })).rejects.toMatchObject({
            code: DomainErrorCode.ENTITY_NOT_FOUND,
        });

        expect(g.status).toBe('active');
        expect(g.savedAmount.amount).toBe(500);
        expect(d.goalSavedFlag()).toBe(false);
    });

    it('fon hesabı olmayan (sanal) hedefte Cancel tutarı sıfırlar (tarihsel kapanış)', async () => {
        const acc = account(0);
        const g = SavingGoal.create({
            name: 'Sanal', targetAmount: 1000, initialAmount: 500,
            currencyId: TRY, minorUnit: 2, icon: 'flag-outline', iconColor: 'blue',
        }); // accountId yok
        const d = deps(acc, g);

        const result = await new ChangeSavingGoalStatusUseCase(
            d.savingGoalRepository, d.accountRepository, uow
        ).execute({ id: g.id, action: 'cancel' });

        // İade edilecek hesap yok; tutar cancelled kayıtta kilitlenmesin diye
        // sıfırlanır. Ortada gerçek bir hesap hareketi olmadığı için bakiye 0.
        expect(acc.balance.amount).toBe(0);
        expect(result.status).toBe('cancelled');
        expect(result.savedAmount.amount).toBe(0);
    });

    it('yetersiz bakiyede AddSaving reddedilir ve hedef kaydedilmez', async () => {
        const acc = account(100);
        const g = goal(acc.id, 0);
        const d = deps(acc, g);

        await expect(new AddSavingUseCase(
            d.savingGoalRepository, d.accountRepository, d.currencyRepository, uow
        ).execute({ goalId: g.id, amount: 300, currencyId: TRY }))
            .rejects.toMatchObject({ code: DomainErrorCode.INSUFFICIENT_BALANCE });

        expect(acc.balance.amount).toBe(100);
        expect(d.goalSavedFlag()).toBe(false);
    });
});
