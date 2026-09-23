<script lang="ts" setup>
import {
  IonPage,
  IonContent,
  IonIcon,
  IonButton,
  IonSegment,
  IonSegmentButton,
  IonLabel
} from '@ionic/vue';
import {
  addOutline,
  flagOutline
} from 'ionicons/icons';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSavingGoalsStore } from "@/stores/saving-goals";
import { useCurrenciesStore } from "@/stores/currencies";
import { useMoney } from "@/composables/money/useMoney";
import { getIconByName } from "@/shared/utils";
import { formatDateLocalized } from "@/i18n/format";
import { SavingGoalDTO } from "@/application";
import SubPageHeader from '@/components/SubPageHeader.vue';

const { t } = useI18n();
const router = useRouter();
const savingGoalStore = useSavingGoalsStore();
const currencyStore = useCurrenciesStore();
const { formatMoney } = useMoney();

const currentTab = ref<'active' | 'paused' | 'completed'>('active');

const tabs = computed(() => [
  { id: 'active' as const,    label: t('savingGoals.tabs.active') },
  { id: 'paused' as const,    label: t('savingGoals.tabs.paused') },
  { id: 'completed' as const, label: t('savingGoals.tabs.completed') },
]);

const filteredGoals = computed(() =>
    savingGoalStore.goals.filter(g => g.status === currentTab.value)
);

const goalCounts = computed(() => ({
  active: savingGoalStore.activeGoals.length,
  paused: savingGoalStore.pausedGoals.length,
  completed: savingGoalStore.completedGoals.length,
}));

const calculateProgress = (goal: SavingGoalDTO) => {
  if (!goal.targetAmount.amount) return 0;
  return Math.min((goal.savedAmount.amount / goal.targetAmount.amount) * 100, 100);
};

const getIcon = (name: string) => getIconByName(name) || flagOutline;

const targetDateText = (goal: SavingGoalDTO) =>
    goal.targetDate
        ? t('savingGoals.targetDatePrefix', { date: formatDateLocalized(new Date(goal.targetDate)) })
        : t('savingGoals.noTargetDate');

const emptyTitle = computed(() => {
  switch (currentTab.value) {
    case 'paused':    return t('savingGoals.emptyPaused');
    case 'completed': return t('savingGoals.emptyCompleted');
    default:          return t('savingGoals.emptyActive');
  }
});

const navigateToNewGoal = () => router.push('/savings/new');

onMounted(async () => {
  await Promise.all([
    savingGoalStore.loadGoals(),
    currencyStore.loadCurrencies(),
  ]);
});
</script>

<template>
  <ion-page class="design-page">
    <!-- Üst bar -->
    <sub-page-header :title="$t('nav.savings')">
      <template #end>
        <ion-button router-link="/savings/new" class="header-action" aria-label="Yeni birikim hedefi">
          <ion-icon :icon="addOutline" class="size-[20px]"/>
        </ion-button>
      </template>
    </sub-page-header>

    <ion-content class="goals-content" :scroll-y="true">
      <div class="mx-auto w-full max-w-xl px-4">
        <!-- Tab segment -->
        <ion-segment v-model="currentTab" class="goal-segment mt-5">
          <ion-segment-button
              v-for="tab in tabs"
              :key="tab.id"
              :value="tab.id"
              class="goal-segment__button"
              :class="{ 'goal-segment__button--active': currentTab === tab.id }"
          >
            <ion-label class="goal-segment__label">
              <span>{{ tab.label }}</span>
              <span class="goal-count">{{ goalCounts[tab.id] }}</span>
            </ion-label>
          </ion-segment-button>
        </ion-segment>
      </div>

      <!-- Liste -->
      <div class="mx-auto mt-3 w-full max-w-xl px-4 pb-10 space-y-3">
        <template v-if="filteredGoals.length">
          <router-link
              v-for="goal in filteredGoals"
              :key="goal.id"
              :to="`/savings/${goal.id}/show`"
              class="goal-card block px-4 py-4 transition"
          >
            <!-- Üst kısım: ikon + ad + hedef tarihi -->
            <div class="flex items-center gap-3 mb-3">
              <div
                  class="size-11 rounded-2xl flex items-center justify-center text-white shrink-0"
                  :class="goal.icon.color"
              >
                <ion-icon :icon="getIcon(goal.icon.name)" class="size-5" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-semibold text-content truncate">{{ goal.name }}</p>
                <p class="text-[11px] text-content-muted mt-0.5">
                  {{ targetDateText(goal) }}
                </p>
              </div>
              <div class="text-right shrink-0">
                <p class="goal-progress text-[16px] font-bold tabular-nums">
                  %{{ Math.round(calculateProgress(goal)) }}
                </p>
              </div>
            </div>

            <!-- Progress bar -->
            <div class="h-1.5 bg-surface-sunken rounded-full overflow-hidden mb-3">
              <div
                  class="h-full rounded-full transition-all"
                  :class="goal.status === 'completed' ? 'bg-emerald-500' : 'goal-progress-bar'"
                  :style="{ width: `${calculateProgress(goal)}%` }"
              />
            </div>

            <!-- Tutarlar -->
            <div class="flex items-center justify-between text-[12px]">
              <div>
                <p class="text-content-muted text-[10px]">{{ $t('savingGoals.saved') }}</p>
                <p class="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {{ formatMoney(goal.savedAmount.amount, goal.savedAmount.currencyId) }}
                </p>
              </div>
              <div class="text-right">
                <p class="text-content-muted text-[10px]">{{ $t('savingGoals.target') }}</p>
                <p class="font-semibold text-content tabular-nums">
                  {{ formatMoney(goal.targetAmount.amount, goal.targetAmount.currencyId) }}
                </p>
              </div>
            </div>
          </router-link>
        </template>

        <!-- Empty -->
        <div v-else class="empty-card px-4 py-10 text-center">
          <div class="size-14 rounded-2xl bg-surface-sunken flex items-center justify-center mx-auto">
            <ion-icon :icon="flagOutline" class="size-6 text-content-faint" />
          </div>
          <p class="mt-3 text-[14px] font-medium text-content">
            {{ emptyTitle }}
          </p>
          <p class="mt-1 text-[12px] text-content-muted leading-snug">
            {{ $t('savingGoals.emptyDesc') }}
          </p>
          <ion-button
              v-if="currentTab === 'active'"
              class="empty-action mt-4"
              @click="navigateToNewGoal"
          >
            <ion-icon :icon="addOutline" class="size-4" />
            {{ $t('savingGoals.new') }}
          </ion-button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.goals-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}

.header-action {
  --background: var(--c-primary);
  --color: var(--c-on-primary);
  --border-radius: 999px;
  --box-shadow: none;
  width: 36px;
  height: 36px;
  margin: 0;
}

.goal-segment {
  --background: var(--c-surface);
  min-height: 50px;
  padding: 5px;
  border: 1px solid var(--c-line);
  border-radius: 1.25rem;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.goal-segment__button {
  --color: var(--c-content-muted);
  --color-checked: var(--c-on-primary);
  --indicator-color: transparent;
  --indicator-box-shadow: none;
  min-width: 0;
  min-height: 40px;
  text-transform: none;
}

.goal-segment__button::part(native) {
  border-radius: 14px;
  font-size: 12px;
  font-weight: 700;
  transition: 160ms ease;
}

.goal-segment__button--active::part(native) {
  background: var(--c-primary);
  color: var(--c-on-primary);
  box-shadow: 0 3px 10px color-mix(in srgb, var(--c-primary) 24%, transparent);
}

.goal-segment__label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin: 0;
}

.goal-count {
  display: inline-grid;
  place-items: center;
  min-width: 19px;
  height: 19px;
  padding-inline: 4px;
  border-radius: 999px;
  background: var(--c-surface-sunken);
  color: var(--c-content-muted);
  font-size: 10px;
  font-weight: 800;
}

.goal-segment__button--active .goal-count {
  background: color-mix(in srgb, var(--c-on-primary) 22%, transparent);
  color: var(--c-on-primary);
}

.goal-card,
.empty-card {
  border: 1px solid var(--c-line);
  border-radius: 1.25rem;
  background: var(--c-surface);
  box-shadow: 0 7px 22px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.goal-card:active {
  background: var(--c-surface-sunken);
}

.goal-progress {
  color: var(--c-primary-strong);
}

.goal-progress-bar {
  background: var(--c-primary);
}

.empty-action {
  --background: var(--c-primary);
  --color: var(--c-on-primary);
  --border-radius: 999px;
  --box-shadow: none;
  min-height: 38px;
  font-size: 12px;
  font-weight: 700;
}
</style>
