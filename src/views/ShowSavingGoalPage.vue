<script lang="ts" setup>
import {
  IonPage, IonContent, IonIcon, IonModal, IonActionSheet, alertController, IonButton, IonButtons, IonTitle, IonToolbar,
  IonHeader, IonBackButton, onIonViewWillEnter, onIonViewDidLeave,
} from '@ionic/vue';
import {
  pencilOutline,
  calendarOutline,
  walletOutline,
  trendingUpOutline,
  checkmarkCircle,
  checkmarkCircleOutline,
  pauseCircleOutline,
  trashOutline,
  closeOutline,
  documentTextOutline,
  flagOutline, ellipsisVertical, removeOutline, addOutline,
} from 'ionicons/icons';
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSavingGoalsStore } from "@/stores/saving-goals";
import { useCurrenciesStore } from "@/stores/currencies";
import { useMoney } from "@/composables/money/useMoney";
import { useToast } from "@/composables/ui/useToast";
import { useErrorHandler } from "@/composables/ui/useErrorHandler";
import { getIconByName } from "@/shared/utils";
import { formatDateLocalized } from "@/i18n/format";
import { useCurrencyDisplay } from "@/composables/money/useCurrencyDisplay";
import SavingGoalHistory from '@/components/SavingGoalHistory.vue';
import CurrencyInput from "@/components/CurrencyInput.vue";
import { SavingGoalContributionDTO } from "@/application";

import {
  savingGoalCanWithdraw,
  savingGoalDaysRemaining,
  savingGoalOverdue,
  savingGoalReached,
  savingGoalRemaining,
} from '@/domain/services/saving-goal-metrics';
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const savingGoalStore = useSavingGoalsStore();
const currencyStore = useCurrenciesStore();
const { formatMoney } = useMoney();
const { currencyName } = useCurrencyDisplay();
const toast = useToast();
const { handle } = useErrorHandler();

const goalId = computed(() => route.params.id as string);
const goal = computed(() => savingGoalStore.goalById(goalId.value));
const currency = computed(() => currencyStore.currencyById(goal.value?.targetAmount.currencyId));
const isSubmitting = ref(false);
const isLoading = ref(true);
const loadFailed = ref(false);
const now = ref(Date.now());
const historyLoading = computed(() => savingGoalStore.contributionsLoading[goalId.value]);
const historyFailed = computed(() => savingGoalStore.contributionsErrors[goalId.value]);
const refreshFailed = computed(() => savingGoalStore.refreshErrors[goalId.value]);
const canComplete = computed(() => goal.value?.status === 'active' || goal.value?.status === 'paused');

const isAddMoneyModalOpen = ref(false);
const isRemoveMoneyModalOpen = ref(false);
const isActionSheetOpen = ref(false);
const addAmount = ref(0);
const removeAmount = ref(0);
const addNote = ref('');
const removeNote = ref('');

// Hareket geçmişi store'da hedef bazında önbelleklenir; sayfa yalnızca okur.
const contributions = computed<SavingGoalContributionDTO[]>(() =>
    savingGoalStore.contributionsOf(goalId.value)
);

const getIcon = (name: string) => getIconByName(name) || flagOutline;

const progressPercentage = computed(() => savingGoalStore.getGoalProgress(goalId.value));
const remainingAmount = computed(() => goal.value
  ? savingGoalRemaining(goal.value.targetAmount, goal.value.savedAmount).amount : 0);
const daysRemaining = computed(() => savingGoalDaysRemaining(goal.value?.targetDate, now.value));
// null = hesaplanamıyor: hedef tarih yok (daysRemaining null) ya da süre doldu
// (0). İkisi de "günde X" satırını gizler; ayrımı `isOverdue` gösterir.
const dailySavingsNeeded = computed(() =>
    daysRemaining.value ? remainingAmount.value / daysRemaining.value : null);
const isCompleted = computed(() => goal.value?.status === 'completed');
const isGoalReached = computed(() =>
    !!goal.value && savingGoalReached(goal.value.savedAmount, goal.value.targetAmount));
const isOverdue = computed(() =>
    !!goal.value && savingGoalOverdue(goal.value.targetDate, goal.value.status, now.value));

const statusMeta = computed(() => {
  switch (goal.value?.status) {
    case 'active':
      return {
        label: t('savingGoals.status.active'),
        pill: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
      }
    case 'paused':
      return {
        label: t('savingGoals.status.paused'),
        pill: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400'
      }
    case 'completed':
      return {
        label: t('savingGoals.status.completed'),
        pill: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
      }
    case 'cancelled':
      return { label: t('savingGoals.status.cancelled'), pill: 'bg-surface-sunken text-content-tertiary' }
    default:
      return { label: t('savingGoals.status.unknown'), pill: 'bg-surface-sunken text-content-tertiary' }
  }
});

const addMoney = async () => {
  if (isSubmitting.value || goal.value?.status !== 'active' || !Number.isFinite(addAmount.value) || addAmount.value <= 0) return;
  isSubmitting.value = true;
  try {
    await savingGoalStore.addSaving({
      goalId: goalId.value,
      amount: addAmount.value,
      currencyId: goal.value.targetAmount.currencyId,
      note: addNote.value.trim() || undefined,
    });
    addAmount.value = 0;
    addNote.value = '';
    isAddMoneyModalOpen.value = false;
  } catch (err) {
    // Yetersiz bakiye gibi anlamlı domain hatalarını gizlemeyip göster.
    handle(err, { context: 'ShowSavingGoal', fallback: t('savingGoals.errors.addSaving') });
  } finally {
    isSubmitting.value = false;
  }
};

const removeMoney = async () => {
  if (isSubmitting.value || !goal.value || !savingGoalCanWithdraw(goal.value.status) || !Number.isFinite(removeAmount.value) || removeAmount.value <= 0 || removeAmount.value > goal.value.savedAmount.amount) return;
  isSubmitting.value = true;
  try {
    await savingGoalStore.withdrawSaving({
      goalId: goalId.value,
      amount: removeAmount.value,
      currencyId: goal.value.targetAmount.currencyId,
      note: removeNote.value.trim() || undefined,
    });
    removeAmount.value = 0;
    removeNote.value = '';
    isRemoveMoneyModalOpen.value = false;
  } catch (err) {
    handle(err, { context: 'ShowSavingGoal', fallback: t('savingGoals.errors.withdrawSaving') });
  } finally {
    isSubmitting.value = false;
  }
};

const toggleGoalStatus = async () => {
  if (!goal.value || isSubmitting.value) return;
  isSubmitting.value = true;
  try {
    if (goal.value.status === 'active') {
      await savingGoalStore.pauseGoal(goalId.value);
    } else if (goal.value.status === 'paused') {
      await savingGoalStore.resumeGoal(goalId.value);
    }
  } catch (err) {
    handle(err, { context: 'ShowSavingGoal', fallback: t('savingGoals.errors.update') });
  } finally {
    isSubmitting.value = false;
  }
};

const markAsCompleted = async () => {
  if (isSubmitting.value || !canComplete.value) return;
  isSubmitting.value = true;
  try {
    await savingGoalStore.completeGoal(goalId.value);
  } catch (err) {
    handle(err, { context: 'ShowSavingGoal', fallback: t('savingGoals.errors.update') });
  } finally {
    isSubmitting.value = false;
  }
};

const deleteGoal = async () => {
  if (isSubmitting.value || !goal.value) return;
  const deletingId = goalId.value;
  const alert = await alertController.create({
    header: t('savingGoals.deleteTitle'),
    message: t('savingGoals.deleteMessage'),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      {
        text: t('common.delete'),
        role: 'destructive',
        handler: async () => {
          if (isSubmitting.value) return false;
          isSubmitting.value = true;
          try {
            await savingGoalStore.deleteGoal(deletingId);
            toast.success(t('savingGoals.deletedSuccess'));
            router.replace('/settings/savings');
          } catch (err) {
            handle(err, { context: 'ShowSavingGoal', fallback: t('savingGoals.errors.delete') });
          } finally {
            isSubmitting.value = false;
          }
        },
      },
    ],
  });
  await alert.present();
};

const editGoal = () => {
  router.push(`/savings/${goalId.value}/edit`);
};

const actionSheetButtons = computed(() => [
  ...(goal.value?.status === 'active' || goal.value?.status === 'paused' ? [{
    text: goal.value.status === 'active' ? t('savingGoals.pause') : t('savingGoals.resume'),
    icon: goal.value.status === 'active' ? pauseCircleOutline : trendingUpOutline,
    handler: toggleGoalStatus,
  }] : []),
  ...(canComplete.value ? [{
    text: t('savingGoals.markCompleted'),
    icon: checkmarkCircleOutline,
    handler: markAsCompleted,
  }] : []),
  {
    text: t('common.edit'),
    icon: pencilOutline,
    handler: editGoal,
  },
  {
    text: t('common.delete'),
    role: 'destructive',
    icon: trashOutline,
    handler: deleteGoal,
  },
  { text: t('common.cancel'), role: 'cancel' },
]);

const retryHistory = async () => {
  try { await savingGoalStore.loadContributions(goalId.value); }
  catch (err) { handle(err, { context: 'ShowSavingGoal', silent: true }); }
};
let loadVersion = 0;
const loadPage = async () => {
  const version = ++loadVersion;
  const id = goalId.value;
  isLoading.value = true;
  loadFailed.value = false;
  now.value = Date.now();
  try {
    await Promise.all([currencyStore.loadCurrencies(), savingGoalStore.getGoalById(id)]);
    if (version !== loadVersion || !savingGoalStore.goalById(id)) return;
    if (savingGoalStore.refreshErrors[id]) await savingGoalStore.refreshAfterMutation(id);
    else await retryHistory();
  } catch (err) {
    if (version !== loadVersion) return;
    loadFailed.value = true;
    handle(err, { context: 'ShowSavingGoal', fallback: t('savingGoals.errors.load'), silent: true });
  } finally {
    if (version === loadVersion) isLoading.value = false;
  }
};
let clockTimer: ReturnType<typeof setInterval> | undefined;
let isVisible = false;
const stopClock = () => { clearInterval(clockTimer); };
onIonViewWillEnter(() => {
  isVisible = true;
  stopClock();
  clockTimer = setInterval(() => { now.value = Date.now(); }, 60_000);
  void loadPage();
});
onIonViewDidLeave(() => {
  isVisible = false;
  ++loadVersion;
  stopClock();
});
onUnmounted(stopClock);
watch(goalId, () => {
  if (!isVisible || typeof goalId.value !== 'string') return;
  isAddMoneyModalOpen.value = false;
  isRemoveMoneyModalOpen.value = false;
  isActionSheetOpen.value = false;
  addAmount.value = removeAmount.value = 0;
  addNote.value = removeNote.value = '';
  void loadPage();
});
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar class="detail-toolbar">
        <ion-buttons slot="start">
          <ion-back-button default-href="/settings/savings"/>
        </ion-buttons>
        <ion-title>{{ goal?.name || $t('savingGoals.target') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
              fill="clear"
              :disabled="!goal || isSubmitting || isLoading || loadFailed"
              :aria-label="$t('savingGoals.menu')"
              @click="isActionSheetOpen = true"
          >
            <ion-icon slot="icon-only" :icon="ellipsisVertical"/>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="show-content" :scroll-y="true">
      <div v-if="isLoading" class="p-6 text-center" role="status">{{ $t('common.loading') }}</div>
      <div v-else-if="loadFailed" class="p-6 text-center" role="alert">
        <p>{{ $t('savingGoals.errors.load') }}</p>
        <ion-button @click="loadPage">{{ $t('common.retry') }}</ion-button>
      </div>
      <div v-else-if="!goal" class="p-6 text-center">{{ $t('savingGoals.notFound') }}</div>
      <div v-else-if="goal" class="mt-5 px-4 pb-32 space-y-3">

        <div v-if="refreshFailed" role="alert" class="p-3 text-sm text-amber-700">
          {{ $t('savingGoals.refreshWarning') }}
          <ion-button fill="clear" @click="loadPage">{{ $t('common.retry') }}</ion-button>
        </div>
        <!-- Hero -->
        <section class="bg-surface rounded-2xl px-4 py-5">
          <div class="flex items-center gap-3">
            <div
                class="size-14 rounded-2xl flex items-center justify-center text-white shrink-0"
                :class="goal.icon.color"
            >
              <ion-icon :icon="getIcon(goal.icon.name)" class="size-7"/>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[16px] font-bold text-content truncate">{{ goal.name }}</p>
              <span
                  class="inline-flex items-center gap-1 mt-1 px-2 h-5 rounded-full text-[10px] font-bold"
                  :class="statusMeta.pill"
              >
                {{ statusMeta.label }}
              </span>
            </div>
          </div>

          <!-- Progress -->
          <div class="mt-5">
            <div class="flex items-baseline justify-between mb-1.5">
              <span class="text-[11px] text-content-muted">{{ $t('savingGoals.progress') }}</span>
              <span class="text-[16px] font-extrabold text-indigo-700 dark:text-indigo-300 tabular-nums">
                %{{ Math.round(progressPercentage) }}
              </span>
            </div>
            <div class="h-2 bg-surface-sunken rounded-full overflow-hidden">
              <div
                  class="h-full rounded-full transition-all"
                  :class="isGoalReached ? 'bg-emerald-500' : 'bg-indigo-600'"
                  :style="{ width: `${progressPercentage}%` }"
              />
            </div>
          </div>

          <!-- Tutarlar -->
          <div class="mt-4 pt-4 border-t border-line grid grid-cols-2 gap-3">
            <div>
              <p class="text-[10px] uppercase tracking-wider text-content-faint">{{ $t('savingGoals.saved') }}</p>
              <p class="mt-1 text-[18px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {{ formatMoney(goal.savedAmount.amount, goal.savedAmount.currencyId) }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-[10px] uppercase tracking-wider text-content-faint">{{ $t('savingGoals.target') }}</p>
              <p class="mt-1 text-[18px] font-bold text-content tabular-nums">
                {{ formatMoney(goal.targetAmount.amount, goal.targetAmount.currencyId) }}
              </p>
            </div>
          </div>
        </section>

        <!-- Tamamlandı kartı -->
        <section v-if="isGoalReached"
                 class="bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 rounded-2xl px-4 py-4 text-center">
          <div
              class="size-12 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
            <ion-icon :icon="checkmarkCircle" class="size-7 text-emerald-600 dark:text-emerald-400"/>
          </div>
          <p class="mt-2 text-[15px] font-bold text-emerald-800 dark:text-emerald-200">{{
              $t('savingGoals.congrats')
            }}</p>
          <p class="text-[12px] text-emerald-700 dark:text-emerald-300">{{ $t('savingGoals.goalReached') }}</p>
        </section>

        <!-- İstatistikler -->
        <section class="bg-surface rounded-2xl">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted px-4 pt-3 pb-1">
            {{ $t('savingGoals.stats') }}
          </p>
          <div class="px-4 pb-3">
            <div class="flex items-center gap-3 py-3 border-t border-line">
              <div class="size-9 rounded-xl bg-rose-50 dark:bg-rose-500/15 flex items-center justify-center shrink-0">
                <ion-icon :icon="walletOutline" class="size-[16px] text-rose-600 dark:text-rose-400"/>
              </div>
              <div class="flex-1">
                <p class="text-[11px] text-content-muted">{{ $t('savingGoals.remainingAmount') }}</p>
                <p class="text-[15px] font-bold text-content tabular-nums">
                  {{ formatMoney(remainingAmount, goal.targetAmount.currencyId) }}
                </p>
              </div>
            </div>
            <div v-if="daysRemaining !== null" class="flex items-center gap-3 py-3 border-t border-line">
              <div
                  class="size-9 rounded-xl flex items-center justify-center shrink-0"
                  :class="isOverdue ? 'bg-rose-50 dark:bg-rose-500/15' : 'bg-emerald-50 dark:bg-emerald-500/15'">
                <ion-icon
                    :icon="calendarOutline"
                    class="size-[16px]"
                    :class="isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'"/>
              </div>
              <div class="flex-1">
                <p class="text-[11px] text-content-muted">{{ $t('savingGoals.daysLeft') }}</p>
                <p
                    class="text-[15px] font-bold tabular-nums"
                    :class="isOverdue ? 'text-rose-700 dark:text-rose-400' : 'text-content'">
                  {{ isOverdue ? $t('savingGoals.overdue') : $t('savingGoals.days', { count: daysRemaining }) }}
                </p>
              </div>
            </div>
            <div v-if="dailySavingsNeeded !== null && remainingAmount > 0"
                 class="flex items-center gap-3 py-3 border-t border-line">
              <div class="size-9 rounded-xl bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center shrink-0">
                <ion-icon :icon="trendingUpOutline" class="size-[16px] text-amber-600 dark:text-amber-400"/>
              </div>
              <div class="flex-1">
                <p class="text-[11px] text-content-muted">{{ $t('savingGoals.dailyNeeded') }}</p>
                <p class="text-[15px] font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                  {{ formatMoney(dailySavingsNeeded, goal.targetAmount.currencyId) }} <span
                    class="text-[11px] text-content-muted font-normal">{{ $t('savingGoals.perDay') }}</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Detaylar -->
        <section class="bg-surface rounded-2xl">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted px-4 pt-3 pb-1">
            {{ $t('savingGoals.details') }}
          </p>
          <div class="px-4 pb-3">
            <div v-if="goal.targetDate" class="flex items-center justify-between py-3 border-t border-line">
              <span class="text-[13px] text-content-tertiary">{{ $t('savingGoals.targetDate') }}</span>
              <span class="text-[13px] font-medium text-content">{{ formatDateLocalized(new Date(goal.targetDate)) }}</span>
            </div>
            <div v-if="goal.createdAt" class="flex items-center justify-between py-3 border-t border-line">
              <span class="text-[13px] text-content-tertiary">{{ $t('savingGoals.createdAt') }}</span>
              <span class="text-[13px] font-medium text-content">
                {{ formatDateLocalized(new Date(goal.createdAt)) }}
              </span>
            </div>
            <div v-if="goal.updatedAt" class="flex items-center justify-between py-3 border-t border-line">
              <span class="text-[13px] text-content-tertiary">{{ $t('savingGoals.updatedAt') }}</span>
              <span class="text-[13px] font-medium text-content">
                {{ formatDateLocalized(new Date(goal.updatedAt)) }}
              </span>
            </div>
            <div v-if="currency" class="flex items-center justify-between py-3 border-t border-line">
              <span class="text-[13px] text-content-tertiary">{{ $t('savingGoals.currency') }}</span>
              <span class="text-[13px] font-medium text-content">
                {{ currency.symbol }} · {{ currencyName(currency) }}
              </span>
            </div>
            <div v-if="goal.description" class="py-3 border-t border-line">
              <div class="flex items-center gap-1.5 mb-1">
                <ion-icon :icon="documentTextOutline" class="size-[12px] text-content-faint"/>
                <span class="text-[11px] text-content-muted">{{ $t('savingGoals.note') }}</span>
              </div>
              <p class="text-[13px] text-content leading-snug whitespace-pre-wrap">
                {{ goal.description }}
              </p>
            </div>
          </div>
        </section>

        <SavingGoalHistory
            :contributions="contributions"
            :history-loading="historyLoading"
            :history-failed="historyFailed"
            @retry="retryHistory"
        />
      </div>

      <div
          v-if="!isLoading && !loadFailed && goal && (goal.status === 'active' || (isCompleted && goal.savedAmount.amount > 0))"
          class="action-bar"
      >
        <div class="flex gap-2">
          <button
              v-if="goal.savedAmount.amount > 0"
              type="button"
              :disabled="isSubmitting"
              class="flex-1 h-12 rounded-2xl border-2 border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 text-[14px] font-semibold flex items-center justify-center gap-1.5 active:bg-rose-50 dark:active:bg-rose-500/20 transition"
              @click="isRemoveMoneyModalOpen = true"
          >
            <ion-icon :icon="removeOutline" class="size-[16px]"/>
            {{ $t('savingGoals.withdrawMoney') }}
          </button>
          <button
              v-if="goal.status === 'active' && !isCompleted"
              type="button"
              :disabled="isSubmitting"
              class="flex-1 h-12 rounded-2xl bg-indigo-600 text-white text-[14px] font-semibold flex items-center justify-center gap-1.5 active:bg-indigo-700 transition"
              @click="isAddMoneyModalOpen = true"
          >
            <ion-icon :icon="addOutline" class="size-[16px]"/>
            {{ $t('savingGoals.addMoney') }}
          </button>
        </div>
      </div>
    </ion-content>

    <!-- Para ekle modal -->
    <ion-modal :is-open="isAddMoneyModalOpen" @did-dismiss="isAddMoneyModalOpen = false" class="amount-modal">
      <div class="sheet">
        <header class="flex items-center justify-between px-4 pt-4 pb-3">
          <h2 class="text-[16px] font-bold text-content">{{ $t('savingGoals.addMoney') }}</h2>
          <button
              type="button"
              class="size-8 rounded-full flex items-center justify-center text-content-muted active:bg-surface-strong"
              @click="isAddMoneyModalOpen = false"
              :aria-label="$t('common.close')"
          >
            <ion-icon :icon="closeOutline" class="size-5"/>
          </button>
        </header>
        <div class="px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          <p class="text-[11px] text-content-muted mb-1">{{ $t('savingGoals.amountToAdd') }}</p>
          <CurrencyInput
              v-model="addAmount"
              :currency-code="currency?.code || 'TRY'"
          />
          <p class="text-[11px] text-content-muted mt-4 mb-1">{{ $t('savingGoals.history.noteLabel') }}</p>
          <input
              v-model="addNote"
              type="text"
              maxlength="120"
              :placeholder="$t('savingGoals.history.notePlaceholder')"
              class="w-full h-11 px-3 rounded-xl bg-surface-sunken text-[14px] text-content placeholder:text-content-faint outline-none"
          />
          <button
              type="button"
              class="w-full h-12 rounded-2xl bg-indigo-600 text-white text-[15px] font-semibold mt-6 active:bg-indigo-700 disabled:bg-slate-300 transition"
              :disabled="isSubmitting || !Number.isFinite(addAmount) || addAmount <= 0"
              @click="addMoney"
          >
            {{ $t('common.add') }}
          </button>
        </div>
      </div>
    </ion-modal>

    <!-- Para çıkar modal -->
    <ion-modal :is-open="isRemoveMoneyModalOpen" @did-dismiss="isRemoveMoneyModalOpen = false" class="amount-modal">
      <div class="sheet">
        <header class="flex items-center justify-between px-4 pt-4 pb-3">
          <h2 class="text-[16px] font-bold text-content">{{ $t('savingGoals.withdrawMoney') }}</h2>
          <button
              type="button"
              class="size-8 rounded-full flex items-center justify-center text-content-muted active:bg-surface-strong"
              @click="isRemoveMoneyModalOpen = false"
              :aria-label="$t('common.close')"
          >
            <ion-icon :icon="closeOutline" class="size-5"/>
          </button>
        </header>
        <div class="px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          <p class="text-[11px] text-content-muted mb-1">{{ $t('savingGoals.amountToWithdraw') }}</p>
          <CurrencyInput
              v-model="removeAmount"
              :currency-code="currency?.code || 'TRY'"
          />
          <p class="text-[11px] text-content-muted mt-2">
            {{ $t('savingGoals.max') }} <span class="font-semibold text-content-secondary">{{
              formatMoney(goal?.savedAmount.amount || 0, goal?.savedAmount.currencyId)
            }}</span>
          </p>
          <p class="text-[11px] text-content-muted mt-4 mb-1">{{ $t('savingGoals.history.noteLabel') }}</p>
          <input
              v-model="removeNote"
              type="text"
              maxlength="120"
              :placeholder="$t('savingGoals.history.notePlaceholder')"
              class="w-full h-11 px-3 rounded-xl bg-surface-sunken text-[14px] text-content placeholder:text-content-faint outline-none"
          />
          <button
              type="button"
              class="w-full h-12 rounded-2xl bg-rose-600 text-white text-[15px] font-semibold mt-6 active:bg-rose-700 disabled:bg-slate-300 transition"
              :disabled="isSubmitting || !Number.isFinite(removeAmount) || removeAmount <= 0 || removeAmount > (goal?.savedAmount.amount || 0)"
              @click="removeMoney"
          >
            {{ $t('savingGoals.withdrawMoney') }}
          </button>
        </div>
      </div>
    </ion-modal>

    <!-- Action sheet -->
    <ion-action-sheet
        :is-open="isActionSheetOpen"
        :header="$t('savingGoals.menu')"
        :buttons="actionSheetButtons"
        @did-dismiss="isActionSheetOpen = false"
    />
  </ion-page>
</template>

<style scoped>
.show-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}

.action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px calc(env(safe-area-inset-bottom) + 12px);
  background: linear-gradient(180deg, rgba(244, 244, 245, 0) 0%, #f4f4f5 30%);
  z-index: 10;
}
</style>

<style>
/* Para ekle/çıkar sheet'i — diğer modallarla aynı yüzey dili: tek tema
   yüzeyi (MD3 surface-container-high). Eskiden light modda sabit #ffffff
   kullanılıyordu; uygulamanın sıcak krem light paletinde bu beyaz parlıyor
   ve toolbar/kart tonlarıyla uyuşmuyordu. Token light/dark'ı kendi çözdüğü
   için ayrı dark override'a gerek yok. */
ion-modal.amount-modal {
  --background: var(--md-surface-container-high);
  --border-radius: 24px 24px 0 0;
  --height: auto;
  --width: 100%;
}

ion-modal.amount-modal::part(content) {
  background: var(--md-surface-container-high);
}

ion-modal.amount-modal .sheet {
  background: var(--md-surface-container-high);
  border-radius: 24px 24px 0 0;
}
</style>
