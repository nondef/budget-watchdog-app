<script lang="ts" setup>
import {
  IonPage, IonContent, IonIcon, IonToolbar, IonHeader, IonBackButton, IonTitle, IonButton, IonButtons,
} from '@ionic/vue';
import {
  addOutline,
  chevronBackOutline,
  flagOutline,
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
  <ion-page>
    <!-- Üst bar -->
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" :icon="chevronBackOutline"/>
        </ion-buttons>

        <ion-title class="text-xl font-semibold">
          {{ $t('nav.savings') }}
        </ion-title>

        <ion-buttons slot="end">
          <ion-button router-link="/savings/new" class="size-9 rounded-full bg-inverse-surface text-inverse-on-surface">
            <ion-icon :icon="addOutline" class="size-[20px]"/>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="goals-content" :scroll-y="true">
      <div class="px-4">
        <!-- Tab segment -->
        <div class="mt-5 bg-surface rounded-2xl p-1 flex">
          <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              class="flex-1 h-10 rounded-xl text-[12px] font-semibold transition flex items-center justify-center gap-1.5"
              :class="currentTab === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-content-tertiary active:bg-surface-sunken'"
              @click="currentTab = tab.id"
          >
            {{ tab.label }}
            <span
                class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold"
                :class="currentTab === tab.id ? 'bg-white/25 text-white' : 'bg-surface-sunken text-content-tertiary'"
            >
              {{ goalCounts[tab.id] }}
            </span>
          </button>
        </div>
      </div>

      <!-- Liste -->
      <div class="mt-3 px-4 pb-10 space-y-3">
        <template v-if="filteredGoals.length">
          <router-link
              v-for="goal in filteredGoals"
              :key="goal.id"
              :to="`/savings/${goal.id}/show`"
              class="block bg-surface rounded-2xl px-4 py-4 active:bg-surface-sunken transition"
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
                <p class="text-[16px] font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
                  %{{ Math.round(calculateProgress(goal)) }}
                </p>
              </div>
            </div>

            <!-- Progress bar -->
            <div class="h-1.5 bg-surface-sunken rounded-full overflow-hidden mb-3">
              <div
                  class="h-full rounded-full transition-all"
                  :class="goal.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-600'"
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
        <div v-else class="bg-surface rounded-2xl px-4 py-10 text-center">
          <div class="size-14 rounded-2xl bg-surface-sunken flex items-center justify-center mx-auto">
            <ion-icon :icon="flagOutline" class="size-6 text-content-faint" />
          </div>
          <p class="mt-3 text-[14px] font-medium text-content">
            {{ emptyTitle }}
          </p>
          <p class="mt-1 text-[12px] text-content-muted leading-snug">
            {{ $t('savingGoals.emptyDesc') }}
          </p>
          <button
              v-if="currentTab === 'active'"
              type="button"
              class="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-indigo-600 text-white text-[12px] font-semibold active:bg-indigo-700 transition"
              @click="navigateToNewGoal"
          >
            <ion-icon :icon="addOutline" class="size-4" />
            {{ $t('savingGoals.new') }}
          </button>
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
</style>
