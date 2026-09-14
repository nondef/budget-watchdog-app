import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { SavingGoal } from '@/domain/entities/saving-goal';
import { SavingGoalMapper } from '@/application/mappers/saving-goal.mapper';
import { AddSavingUseCase, GetSavingGoalUseCase, ListSavingGoalContributionsUseCase } from '@/application';
import { useSavingGoalsStore } from '@/stores/saving-goals';

const { loadAccounts } = vi.hoisted(() => ({ loadAccounts: vi.fn() }));
vi.mock('@/infrastructure/database/repositories/resolve', () => ({
    resolveRepository: () => ({}), resolveUnitOfWork: () => ({}),
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ loadAccounts }) }));
vi.mock('@/composables/features/useNotifier', () => ({
    useNotifier: () => ({ notifyGoalReached: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock('@/infrastructure/logging', () => ({ logger: { warn: vi.fn() } }));

const dto = () => SavingGoalMapper.toDTO(SavingGoal.create({
    name: 'Trip', targetAmount: 1000, currencyId: 'try', icon: 'wallet', iconColor: 'blue',
}));

describe('saving goal store synchronization', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        loadAccounts.mockReset().mockResolvedValue(undefined);
        setActivePinia(createPinia());
    });

    it('caches direct detail loads and keeps selectors reactive after a deposit', async () => {
        const goal = dto();
        const get = vi.spyOn(GetSavingGoalUseCase.prototype, 'execute').mockResolvedValue(goal);
        vi.spyOn(ListSavingGoalContributionsUseCase.prototype, 'execute').mockResolvedValue({ contributions: [] });
        const updated = { ...goal, savedAmount: { ...goal.savedAmount, amount: 100 } };
        vi.spyOn(AddSavingUseCase.prototype, 'execute').mockResolvedValue({ savingGoal: updated, isCompleted: false });
        const store = useSavingGoalsStore();
        const selected = computed(() => store.goalById(goal.id));
        expect(selected.value).toBeUndefined();
        await store.getGoalById(goal.id);
        expect(selected.value?.savedAmount.amount).toBe(0);
        await store.addSaving({ goalId: goal.id, amount: 100, currencyId: 'try' });
        expect(selected.value?.savedAmount.amount).toBe(100);
        await store.getGoalById(goal.id);
        expect(get).toHaveBeenCalledTimes(1);
    });

    it('preserves successful mutations when refresh fails and retries only reads', async () => {
        const goal = dto();
        const add = vi.spyOn(AddSavingUseCase.prototype, 'execute').mockResolvedValue({ savingGoal: goal, isCompleted: false });
        const history = vi.spyOn(ListSavingGoalContributionsUseCase.prototype, 'execute').mockRejectedValue(new Error('offline'));
        loadAccounts.mockRejectedValue(new Error('offline'));
        const store = useSavingGoalsStore();
        await expect(store.addSaving({ goalId: goal.id, amount: 10, currencyId: 'try' })).resolves.toMatchObject({ savingGoal: goal });
        expect(store.refreshErrors[goal.id]).toBe(true);
        expect(store.contributionsErrors[goal.id]).toBe(true);
        expect(store.contributionsLoading[goal.id]).toBe(false);
        history.mockResolvedValue({ contributions: [] });
        loadAccounts.mockResolvedValue(undefined);
        await store.refreshAfterMutation(goal.id);
        expect(store.refreshErrors[goal.id]).toBe(false);
        expect(store.contributionsErrors[goal.id]).toBe(false);
        expect(add).toHaveBeenCalledTimes(1);
    });

    it('does not reuse a history read started before a mutation', async () => {
        const goal = dto();
        let finish!: (value: { contributions: [] }) => void;
        const history = vi.spyOn(ListSavingGoalContributionsUseCase.prototype, 'execute')
            .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
            .mockResolvedValue({ contributions: [] });
        vi.spyOn(AddSavingUseCase.prototype, 'execute').mockResolvedValue({ savingGoal: goal, isCompleted: false });
        const store = useSavingGoalsStore();
        const oldRead = store.loadContributions(goal.id);
        const mutation = store.addSaving({ goalId: goal.id, amount: 10, currencyId: 'try' });
        finish({ contributions: [] });
        await Promise.all([oldRead, mutation]);
        expect(history).toHaveBeenCalledTimes(2);
    });
});
