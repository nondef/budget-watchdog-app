import { savingGoalProgress } from '@/domain/services/saving-goal-metrics';
import { logger } from '@/infrastructure/logging';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { resolveRepository } from '@/infrastructure/database/repositories/resolve';
import {
    AccountRepository,
    CurrencyRepository,
    SavingGoalContributionRepository,
    SavingGoalRepository,
} from '@/infrastructure/database/repositories';
import { useAccountsStore } from '@/stores/accounts';
import {
    SavingGoalDTO,
    CreateSavingGoalInput,
    CreateSavingGoalUseCase,
    UpdateSavingGoalInput,
    UpdateSavingGoalUseCase,
    AddSavingInput,
    AddSavingUseCase,
    WithdrawSavingInput,
    WithdrawSavingUseCase,
    DeleteSavingGoalUseCase,
    ChangeSavingGoalStatusUseCase,
    SavingGoalStatusAction,
    ListSavingGoalsUseCase,
    ListSavingGoalContributionsUseCase,
    SavingGoalContributionDTO,
    GetSavingGoalUseCase,
} from '@/application';
import { resolveUnitOfWork } from "@/infrastructure/database/repositories/resolve";
import { useNotifier } from '@/composables/features/useNotifier';

export const useSavingGoalsStore = defineStore('savingGoals', () => {
    const goals = ref<SavingGoalDTO[]>([]);

    const savingGoalRepository = resolveRepository(SavingGoalRepository);
    const currencyRepository = resolveRepository(CurrencyRepository);
    const accountRepository = resolveRepository(AccountRepository);
    const contributionRepository = resolveRepository(SavingGoalContributionRepository);
    const unitOfWork = resolveUnitOfWork();

    const upsertLocal = (goal: SavingGoalDTO) => {
        const index = goals.value.findIndex(g => g.id === goal.id);
        if (index !== -1) {
            goals.value[index] = goal;
        } else {
            goals.value.push(goal);
        }
    };

    // ========== Data Loading ==========

    const listSavingGoalsUseCase = new ListSavingGoalsUseCase(savingGoalRepository);

    const loadGoals = async () => {
        goals.value = (await listSavingGoalsUseCase.execute()).savingGoals;
    };

    // ========== Contributions (hareket defteri) ==========

    // Hedef bazında önbellek: detay sayfası açıldığında o hedefin geçmişi
    // yüklenir, para ekle/çıkar sonrası tazelenir.
    const contributionsByGoal = ref<Record<string, SavingGoalContributionDTO[]>>({});

    const listContributionsUseCase = new ListSavingGoalContributionsUseCase(
        contributionRepository,
        currencyRepository,
        unitOfWork
    );

    const contributionsLoading = ref<Record<string, boolean>>({});
    const contributionsErrors = ref<Record<string, boolean>>({});
    const refreshErrors = ref<Record<string, boolean>>({});
    const contributionRequests = new Map<string, Promise<SavingGoalContributionDTO[]>>();

    const loadContributions = (goalId: string): Promise<SavingGoalContributionDTO[]> => {
        const pending = contributionRequests.get(goalId);
        if (pending) return pending;
        const request = fetchContributions(goalId).finally(() => contributionRequests.delete(goalId));
        contributionRequests.set(goalId, request);
        return request;
    };

    const fetchContributions = async (goalId: string) => {
        contributionsLoading.value[goalId] = true;
        contributionsErrors.value[goalId] = false;
        try {
            const { contributions } = await listContributionsUseCase.execute({ goalId });
            contributionsByGoal.value = { ...contributionsByGoal.value, [goalId]: contributions };
            return contributions;
        } catch (err) {
            contributionsErrors.value[goalId] = true;
            throw err;
        } finally {
            contributionsLoading.value[goalId] = false;
        }
    };

    // Persistence already succeeded; a failed refresh must not invite repeating the mutation.
    const refreshAfterMutation = async (goalId: string, history = true) => {
        const refreshHistory = async () => {
            // A read started before the mutation may contain the old balance.
            await contributionRequests.get(goalId)?.catch(() => undefined);
            return loadContributions(goalId);
        };
        const results = await Promise.allSettled([
            useAccountsStore().loadAccounts(),
            ...(history ? [refreshHistory()] : []),
        ]);
        refreshErrors.value[goalId] = results.some(result => result.status === 'rejected');
        for (const result of results) {
            if (result.status === 'rejected') logger.warn('Saving goal refresh failed', { error: result.reason });
        }
    };

    const contributionsOf = (goalId: string) => contributionsByGoal.value[goalId] ?? [];

    // ========== Actions ==========

    const addGoal = async (input: CreateSavingGoalInput) => {
        const useCase = new CreateSavingGoalUseCase(
            savingGoalRepository,
            accountRepository,
            currencyRepository,
            unitOfWork,
            contributionRepository
        );
        const result = await useCase.execute(input);

        goals.value.unshift(result.savingGoal);

        // Başlangıç tutarı fon hesabından düşülmüş olabilir — bakiyeyi tazele.
        await refreshAfterMutation(result.savingGoal.id, false);

        return result.savingGoal;
    };

    const updateGoal = async (input: UpdateSavingGoalInput) => {
        const useCase = new UpdateSavingGoalUseCase(savingGoalRepository, unitOfWork);
        const result = await useCase.execute(input);

        upsertLocal(result.savingGoal);

        return result.savingGoal;
    };

    const deleteGoal = async (goalId: string) => {
        await new DeleteSavingGoalUseCase(
            savingGoalRepository,
            accountRepository,
            unitOfWork,
            contributionRepository
        ).execute({ id: goalId });

        const index = goals.value.findIndex(g => g.id === goalId);

        if (index !== -1) {
            goals.value.splice(index, 1);
        }

        // Hedefin defter satırları da silindi (bkz. DeleteSavingGoalUseCase);
        // önbellekte tutmanın anlamı yok.
        const { [goalId]: _removed, ...rest } = contributionsByGoal.value;
        contributionsByGoal.value = rest;

        // Ayrılmış para fon hesabına iade edilmiş olabilir — bakiyeyi tazele.
        await refreshAfterMutation(goalId, false);

        return true;
    };

    const addSaving = async (input: AddSavingInput) => {
        const useCase = new AddSavingUseCase(
            savingGoalRepository,
            accountRepository,
            currencyRepository,
            unitOfWork,
            contributionRepository
        );
        const result = await useCase.execute(input);

        upsertLocal(result.savingGoal);

        await refreshAfterMutation(input.goalId);

        // `addSaving` yalnız aktif hedefte çalışır; `isCompleted` bu katkıyla
        // hedefe TAM ULAŞILDIĞI anı gösterir → aynı hedef için tekrarlamaz.
        if (result.isCompleted) {
            void useNotifier().notifyGoalReached(result.savingGoal.name).catch(error => logger.warn('Goal notification failed', { error }));
        }

        return result;
    };

    const withdrawSaving = async (input: WithdrawSavingInput) => {
        const useCase = new WithdrawSavingUseCase(
            savingGoalRepository,
            accountRepository,
            currencyRepository,
            unitOfWork,
            contributionRepository
        );
        const result = await useCase.execute(input);

        upsertLocal(result.savingGoal);

        await refreshAfterMutation(input.goalId);

        return result.savingGoal;
    };

    /** pause/resume/complete/cancel: geçiş kuralları entity'de doğrulanır */
    const changeStatus = async (goalId: string, action: SavingGoalStatusAction) => {
        const useCase = new ChangeSavingGoalStatusUseCase(
            savingGoalRepository,
            accountRepository,
            unitOfWork,
            contributionRepository
        );
        const dto = await useCase.execute({ id: goalId, action });

        upsertLocal(dto);

        return dto;
    };

    const pauseGoal = (goalId: string) => changeStatus(goalId, 'pause');
    const resumeGoal = (goalId: string) => changeStatus(goalId, 'resume');
    const completeGoal = (goalId: string) => changeStatus(goalId, 'complete');

    const cancelGoal = async (goalId: string) => {
        const dto = await changeStatus(goalId, 'cancel');

        // İptal ayrılmış parayı fon hesabına iade etmiş olabilir — bakiyeyi ve
        // iade satırını taşıyan defteri tazele.
        await refreshAfterMutation(goalId);

        return dto;
    };

    // ========== Getters / Queries ==========

    const goalById = (id: string) => {
        return goals.value.find(g => g.id === id);
    };

    const getGoalById = async (id: string) => {
        const cached = goalById(id);
        if (cached) return cached;

        const dto = await new GetSavingGoalUseCase(savingGoalRepository).execute({ id });

        if (dto) {
            upsertLocal(dto)
        }

        return dto
    };

    // ========== Computed ==========

    const activeGoals = computed(() =>
        goals.value.filter(g => g.status === 'active')
    );

    const pausedGoals = computed(() =>
        goals.value.filter(g => g.status === 'paused')
    );

    const completedGoals = computed(() =>
        goals.value.filter(g => g.status === 'completed')
    );

    const getGoalProgress = computed(() => (goalId: string) => {
        const goal = goalById(goalId);
        if (!goal || !goal.targetAmount.amount) return 0;
        return savingGoalProgress(goal.savedAmount.amount, goal.targetAmount.amount);
    });

    return {
        // State
        goals,
        contributionsByGoal,
        contributionsLoading,
        contributionsErrors,
        refreshErrors,
        refreshAfterMutation,

        // Data Loading
        loadGoals,
        loadContributions,

        // Actions
        addGoal,
        updateGoal,
        deleteGoal,
        addSaving,
        withdrawSaving,
        pauseGoal,
        resumeGoal,
        completeGoal,
        cancelGoal,

        // Getters
        goalById,
        contributionsOf,
        getGoalById,

        // Computed
        activeGoals,
        pausedGoals,
        completedGoals,
        getGoalProgress,
    };
});
