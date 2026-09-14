<script lang="ts" setup>
/**
 * Hesabın tam görünümü.
 *
 * Buranın asıl varlık sebebi hareket listesi: hesap bakiyesi iki ayrı kaynaktan
 * değişiyor — işlemler ve birikim hedefi hareketleri — ama uygulama yalnızca
 * ilkini gösteriyordu. Hedefe para ayırmak bakiyeyi sessizce düşürüyordu ve
 * kullanıcı farkın nereden geldiğini hiçbir listede göremiyordu. Burada iki
 * defter tek zaman çizgisinde birleşiyor, üstüne işlemin hangi bütçeye yazıldığı
 * da satırın altında gösteriliyor.
 */
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonBackButton,
  IonContent,
  IonIcon,
  IonSkeletonText,
  onIonViewWillEnter,
} from '@ionic/vue';
import {
  arrowDownCircleOutline,
  arrowDownOutline,
  arrowUpCircleOutline,
  arrowUpOutline,
  chevronBackOutline,
  flagOutline,
  pencilOutline,
  pieChartOutline,
  receiptOutline,
  returnDownBackOutline,
  sparklesOutline,
  swapHorizontalOutline,
  timeOutline,
  walletOutline,
} from 'ionicons/icons';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAccountsStore } from '@/stores/accounts';
import { useCurrenciesStore } from '@/stores/currencies';
import { useCategoriesStore } from '@/stores/categories';
import { useMoney } from '@/composables/money/useMoney';
import { useCategoryName } from '@/composables/features/useCategoryName';
import { useErrorHandler } from '@/composables/ui/useErrorHandler';
import { getIconByName } from '@/shared/utils';
import { formatDateLocalized } from '@/i18n/format';
import {
  AccountMovementDTO,
  GetAccountDetailOutput,
  SavingGoalContributionDTO,
} from '@/application';

type MovementFilter = 'all' | 'transactions' | 'savings';

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

const accountsStore = useAccountsStore();
const currenciesStore = useCurrenciesStore();
const categoriesStore = useCategoriesStore();
const { formatMoney } = useMoney();
const { categoryName } = useCategoryName();
const { handle } = useErrorHandler();

const accountId = route.params.id as string;
const detail = ref<GetAccountDetailOutput | null>(null);
const isLoading = ref(true);
const hasError = ref(false);
const filter = ref<MovementFilter>('all');

const account = computed(() => detail.value?.account ?? null);

const currencyCode = computed(() =>
    currenciesStore.currencyById(account.value?.balance.currencyId)?.code ?? ''
);

const movements = computed(() => {
  const all = detail.value?.movements ?? [];
  if (filter.value === 'transactions') return all.filter(m => m.kind === 'transaction');
  if (filter.value === 'savings') return all.filter(m => m.kind === 'savingGoal');
  return all;
});

/** Hareketleri gün başlıklarına ayırır; liste tarih sırasında gelir. */
const movementDays = computed(() => {
  const groups: { key: string; date: Date; items: AccountMovementDTO[] }[] = [];

  for (const movement of movements.value) {
    const date = new Date(movement.occurredAt);
    const key = date.toDateString();
    const last = groups[groups.length - 1];

    if (last?.key === key) {
      last.items.push(movement);
    } else {
      groups.push({ key, date, items: [movement] });
    }
  }

  return groups;
});

const CONTRIBUTION_META = {
  initial:    { icon: sparklesOutline,        bg: 'bg-indigo-50 dark:bg-indigo-500/15',   tone: 'text-indigo-600 dark:text-indigo-400' },
  deposit:    { icon: arrowUpCircleOutline,   bg: 'bg-indigo-50 dark:bg-indigo-500/15',   tone: 'text-indigo-600 dark:text-indigo-400' },
  withdrawal: { icon: arrowDownCircleOutline, bg: 'bg-emerald-50 dark:bg-emerald-500/15', tone: 'text-emerald-600 dark:text-emerald-400' },
  refund:     { icon: returnDownBackOutline,  bg: 'bg-amber-50 dark:bg-amber-500/15',     tone: 'text-amber-600 dark:text-amber-400' },
} as const;

const TRANSACTION_META = {
  income:   { icon: arrowUpOutline,        bg: 'bg-emerald-50 dark:bg-emerald-500/15', tone: 'text-emerald-600 dark:text-emerald-400' },
  expense:  { icon: arrowDownOutline,      bg: 'bg-rose-50 dark:bg-rose-500/15',       tone: 'text-rose-600 dark:text-rose-400' },
  transfer: { icon: swapHorizontalOutline, bg: 'bg-sky-50 dark:bg-sky-500/15',         tone: 'text-sky-600 dark:text-sky-400' },
} as const;

const movementVisual = (movement: AccountMovementDTO) => {
  if (movement.kind === 'savingGoal') {
    const type = movement.contribution?.type ?? 'deposit';
    return CONTRIBUTION_META[type as SavingGoalContributionDTO['type']] ?? CONTRIBUTION_META.deposit;
  }

  const type = movement.transaction?.type ?? 'expense';
  return TRANSACTION_META[type as keyof typeof TRANSACTION_META] ?? TRANSACTION_META.expense;
};

/**
 * Tutarın rengi ve işareti hareketin türünden değil YÖNÜNDEN gelir: hedefe para
 * ayırmak hesaptan çıkıştır, hedeften geri çekmek giriştir.
 */
const amountTone = (movement: AccountMovementDTO) =>
    movement.direction === 'in'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-content';

const movementTitle = (movement: AccountMovementDTO) => {
  if (movement.kind === 'transaction') {
    return movement.transaction?.title ?? '';
  }

  const goalName = movement.savingGoalName ?? t('accounts.detail.deletedGoal');
  return t('accounts.detail.goalMovement', { goal: goalName });
};

const movementSubtitle = (movement: AccountMovementDTO) => {
  if (movement.kind === 'savingGoal') {
    return t(`savingGoals.history.types.${movement.contribution?.type ?? 'deposit'}`);
  }

  const transaction = movement.transaction;
  if (!transaction) return '';

  if (transaction.type === 'transfer') return t('common.transfer');

  const category = transaction.categoryId
      ? categoriesStore.categoryById(transaction.categoryId)
      : null;

  return category ? categoryName(category.name) : t(`common.${transaction.type}`);
};

/** İşlemin yazıldığı bütçeler; efekt defterinden gelir, yeniden eşleştirilmez. */
const budgetLabel = (movement: AccountMovementDTO) => {
  if (!movement.budgets?.length) return null;

  const names = movement.budgets
      .map(ref => ref.budgetName || t('accounts.detail.unknownBudget'))
      .join(', ');

  return t('accounts.detail.affectsBudget', { names });
};

const movementTime = (date: Date) =>
    new Date(date).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' });

const dayLabel = (date: Date) => formatDateLocalized(date);

const openMovement = (movement: AccountMovementDTO) => {
  if (movement.kind === 'transaction' && movement.transaction) {
    router.push(`/transaction/${movement.transaction.id}/show`);
    return;
  }

  if (movement.contribution) {
    router.push(`/savings/${movement.contribution.goalId}/show`);
  }
};

const budgetProgress = (spent: number, total: number) =>
    total > 0 ? Math.min((spent / total) * 100, 100) : 0;

const goalProgress = (saved: number, target: number) =>
    target > 0 ? Math.min((saved / target) * 100, 100) : 0;

const load = async () => {
  isLoading.value = true;
  hasError.value = false;

  try {
    // Kategori ve para birimi adları liste satırlarında kullanılıyor; detayla
    // birlikte yüklenmezlerse satırlar bir tık boş görünüyor.
    const [result] = await Promise.all([
      accountsStore.getAccountDetail(accountId),
      currenciesStore.loadCurrencies(),
      categoriesStore.loadCategories(),
    ]);

    detail.value = result;
  } catch (err) {
    hasError.value = true;
    handle(err, { context: 'AccountDetail', fallback: t('accounts.detail.loadError') });
  } finally {
    isLoading.value = false;
  }
};

onIonViewWillEnter(load);
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-buttons slot="start">
          <ion-back-button default-href="/settings/accounts" :icon="chevronBackOutline"/>
        </ion-buttons>

        <ion-title>{{ account?.name || $t('accounts.detail.title') }}</ion-title>

        <ion-buttons slot="end">
          <ion-button
              :aria-label="$t('common.edit')"
              @click="router.push(`/accounts/${accountId}/edit`)"
          >
            <ion-icon slot="icon-only" :icon="pencilOutline"/>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="detail-content" :scroll-y="true">
      <!-- Yükleniyor -->
      <div v-if="isLoading" class="mt-5 px-4 space-y-3">
        <div class="bg-surface rounded-2xl p-5">
          <ion-skeleton-text :animated="true" style="width: 60%; height: 20px"/>
          <ion-skeleton-text :animated="true" style="width: 40%; height: 28px; margin-top: 12px"/>
        </div>
        <div class="bg-surface rounded-2xl p-5">
          <ion-skeleton-text :animated="true" style="width: 100%; height: 16px"/>
          <ion-skeleton-text :animated="true" style="width: 80%; height: 16px; margin-top: 10px"/>
        </div>
      </div>

      <!-- Hata -->
      <div v-else-if="hasError || !detail" class="mt-5 px-4">
        <div class="bg-surface rounded-2xl px-4 py-10 text-center">
          <div class="size-14 rounded-2xl bg-surface-sunken flex items-center justify-center mx-auto">
            <ion-icon :icon="walletOutline" class="size-6 text-slate-400"/>
          </div>
          <p class="mt-3 text-[14px] font-medium text-content">{{ $t('accounts.detail.loadError') }}</p>
          <button
              class="mt-4 h-9 px-4 rounded-full bg-indigo-600 text-white text-[12px] font-semibold active:bg-indigo-700 transition"
              @click="load"
          >
            {{ $t('common.retry') }}
          </button>
        </div>
      </div>

      <div v-else class="mt-5 px-4 pb-10 space-y-3">

        <!-- Hero: bakiye -->
        <section class="bg-surface rounded-2xl px-4 py-5">
          <div class="flex items-center gap-3">
            <div
                class="size-14 rounded-2xl flex items-center justify-center text-white shrink-0"
                :class="detail.account.icon.color"
            >
              <ion-icon :icon="getIconByName(detail.account.icon.name)" class="size-7"/>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[16px] font-bold text-content truncate">{{ detail.account.name }}</p>
              <p class="text-[11px] text-content-muted mt-0.5">
                {{ $t(`accountTypes.${detail.account.type}`) }} · {{ currencyCode }}
              </p>
            </div>
            <span
                v-if="!detail.account.isActive"
                class="px-2 h-5 inline-flex items-center rounded-full bg-surface-sunken text-content-tertiary text-[10px] font-bold shrink-0"
            >
              {{ $t('accounts.detail.inactive') }}
            </span>
          </div>

          <div class="mt-5 pt-4 border-t border-line">
            <p class="text-[10px] uppercase tracking-wider text-content-faint">
              {{ $t('accounts.detail.currentBalance') }}
            </p>
            <p class="mt-1 text-[26px] font-extrabold text-content tabular-nums">
              {{ formatMoney(detail.account.balance.amount, detail.account.balance.currencyId) }}
            </p>
          </div>
        </section>

        <!-- Özet -->
        <section class="bg-surface rounded-2xl">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted px-4 pt-3 pb-1">
            {{ $t('accounts.detail.overview') }}
          </p>
          <div class="px-4 pb-4 grid grid-cols-2 gap-3">
            <div class="p-3 rounded-xl bg-surface-sunken">
              <p class="text-[10px] text-content-muted">{{ $t('accounts.detail.totalIncome') }}</p>
              <p class="mt-1 text-[15px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {{ formatMoney(detail.totals.income.amount, detail.totals.income.currencyId) }}
              </p>
            </div>
            <div class="p-3 rounded-xl bg-surface-sunken">
              <p class="text-[10px] text-content-muted">{{ $t('accounts.detail.totalExpense') }}</p>
              <p class="mt-1 text-[15px] font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                {{ formatMoney(detail.totals.expense.amount, detail.totals.expense.currencyId) }}
              </p>
            </div>
            <div class="col-span-2 p-3 rounded-xl bg-surface-sunken">
              <div class="flex items-baseline justify-between gap-2">
                <p class="text-[10px] text-content-muted">{{ $t('accounts.detail.allocatedToGoals') }}</p>
                <p class="text-[15px] font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                  {{ formatMoney(detail.totals.allocatedToGoals.amount, detail.totals.allocatedToGoals.currencyId) }}
                </p>
              </div>
              <p class="mt-1 text-[10px] text-content-faint leading-snug">
                {{ $t('accounts.detail.allocatedHint') }}
              </p>
            </div>
          </div>
        </section>

        <!-- Hareketler -->
        <section class="bg-surface rounded-2xl">
          <div class="px-4 pt-3 pb-2">
            <div class="flex items-center gap-1.5">
              <ion-icon :icon="timeOutline" class="size-[12px] text-content-faint"/>
              <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                {{ $t('accounts.detail.movements') }}
              </p>
            </div>
            <p class="mt-0.5 text-[10px] text-content-faint">{{ $t('accounts.detail.movementsHint') }}</p>

            <!-- Filtre -->
            <div class="mt-3 flex gap-1.5 p-1 rounded-xl bg-surface-sunken">
              <button
                  v-for="option in (['all', 'transactions', 'savings'] as const)"
                  :key="option"
                  type="button"
                  class="flex-1 h-8 rounded-lg text-[12px] font-semibold transition"
                  :class="filter === option
                    ? 'bg-surface text-content shadow-sm'
                    : 'text-content-muted active:text-content'"
                  @click="filter = option"
              >
                {{ $t(`accounts.detail.filters.${option}`) }}
              </button>
            </div>
          </div>

          <!-- Boş -->
          <div v-if="movementDays.length === 0" class="px-4 pb-6 pt-2 text-center">
            <div class="size-12 rounded-2xl bg-surface-sunken flex items-center justify-center mx-auto">
              <ion-icon :icon="receiptOutline" class="size-5 text-slate-400"/>
            </div>
            <p class="mt-3 text-[13px] font-medium text-content-secondary">
              {{ $t('accounts.detail.movementsEmpty') }}
            </p>
            <p class="mt-1 text-[11px] text-content-muted leading-snug">
              {{ $t('accounts.detail.movementsEmptyDesc') }}
            </p>
          </div>

          <div v-else class="px-4 pb-3">
            <div v-for="day in movementDays" :key="day.key">
              <p class="pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-content-faint">
                {{ dayLabel(day.date) }}
              </p>

              <button
                  v-for="movement in day.items"
                  :key="movement.id"
                  type="button"
                  class="w-full flex items-start gap-3 py-3 border-t border-line text-left active:opacity-70 transition"
                  @click="openMovement(movement)"
              >
                <div
                    class="size-9 rounded-xl flex items-center justify-center shrink-0"
                    :class="movementVisual(movement).bg"
                >
                  <ion-icon
                      :icon="movementVisual(movement).icon"
                      class="size-[16px]"
                      :class="movementVisual(movement).tone"
                  />
                </div>

                <div class="flex-1 min-w-0">
                  <p class="text-[13px] font-semibold text-content truncate">
                    {{ movementTitle(movement) }}
                  </p>
                  <p class="text-[11px] text-content-muted mt-0.5 truncate">
                    {{ movementSubtitle(movement) }} · {{ movementTime(movement.occurredAt) }}
                  </p>
                  <p
                      v-if="budgetLabel(movement)"
                      class="mt-1 inline-flex items-center gap-1 px-1.5 h-4 rounded bg-surface-sunken text-[10px] text-content-tertiary max-w-full truncate"
                  >
                    <ion-icon :icon="pieChartOutline" class="size-[10px] shrink-0"/>
                    <span class="truncate">{{ budgetLabel(movement) }}</span>
                  </p>
                  <p
                      v-if="movement.contribution?.note"
                      class="mt-1 text-[11px] text-content-tertiary leading-snug line-clamp-2"
                  >
                    {{ movement.contribution.note }}
                  </p>
                </div>

                <p
                    class="text-[14px] font-bold tabular-nums shrink-0"
                    :class="amountTone(movement)"
                >
                  {{ movement.direction === 'in' ? '+' : '−' }}{{ formatMoney(movement.amount.amount, movement.amount.currencyId) }}
                </p>
              </button>
            </div>

            <p
                v-if="detail.hasMoreMovements"
                class="pt-3 text-[10px] text-content-faint text-center"
            >
              {{ $t('accounts.detail.hasMore', { count: detail.movements.length }) }}
            </p>
          </div>
        </section>

        <!-- Bağlı bütçeler -->
        <section class="bg-surface rounded-2xl">
          <div class="flex items-center gap-1.5 px-4 pt-3 pb-1">
            <ion-icon :icon="pieChartOutline" class="size-[12px] text-content-faint"/>
            <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
              {{ $t('accounts.detail.budgets') }}
            </p>
          </div>

          <p v-if="detail.budgets.length === 0" class="px-4 pb-4 pt-1 text-[12px] text-content-muted">
            {{ $t('accounts.detail.budgetsEmpty') }}
          </p>

          <div v-else class="px-4 pb-3">
            <router-link
                v-for="budget in detail.budgets"
                :key="budget.id"
                :to="`/budget/${budget.id}/show`"
                class="flex items-center gap-3 py-3 border-t border-line active:opacity-70 transition"
            >
              <div
                  class="size-9 rounded-xl flex items-center justify-center text-white shrink-0"
                  :class="budget.icon.color"
              >
                <ion-icon :icon="getIconByName(budget.icon.name)" class="size-[16px]"/>
              </div>

              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-semibold text-content truncate">{{ budget.name }}</p>
                <div class="mt-1.5 h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                  <div
                      class="h-full rounded-full transition-all"
                      :class="budget.isExceeded ? 'bg-rose-500' : budget.isWarning ? 'bg-amber-500' : 'bg-emerald-500'"
                      :style="{ width: `${budgetProgress(budget.spentAmount.amount, budget.amount.amount)}%` }"
                  />
                </div>
              </div>

              <p class="text-[11px] text-content-muted tabular-nums shrink-0">
                {{ $t('accounts.detail.budgetsSpent', {
                  spent: formatMoney(budget.spentAmount.amount, budget.spentAmount.currencyId),
                  total: formatMoney(budget.amount.amount, budget.amount.currencyId),
                }) }}
              </p>
            </router-link>
          </div>
        </section>

        <!-- Fonladığı hedefler -->
        <section class="bg-surface rounded-2xl">
          <div class="flex items-center gap-1.5 px-4 pt-3 pb-1">
            <ion-icon :icon="flagOutline" class="size-[12px] text-content-faint"/>
            <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
              {{ $t('accounts.detail.savingGoals') }}
            </p>
          </div>

          <p v-if="detail.savingGoals.length === 0" class="px-4 pb-4 pt-1 text-[12px] text-content-muted">
            {{ $t('accounts.detail.savingGoalsEmpty') }}
          </p>

          <div v-else class="px-4 pb-3">
            <router-link
                v-for="goal in detail.savingGoals"
                :key="goal.id"
                :to="`/savings/${goal.id}/show`"
                class="flex items-center gap-3 py-3 border-t border-line active:opacity-70 transition"
            >
              <div
                  class="size-9 rounded-xl flex items-center justify-center text-white shrink-0"
                  :class="goal.icon.color"
              >
                <ion-icon :icon="getIconByName(goal.icon.name) || flagOutline" class="size-[16px]"/>
              </div>

              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-semibold text-content truncate">{{ goal.name }}</p>
                <div class="mt-1.5 h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                  <div
                      class="h-full rounded-full bg-indigo-600 transition-all"
                      :style="{ width: `${goalProgress(goal.savedAmount.amount, goal.targetAmount.amount)}%` }"
                  />
                </div>
              </div>

              <p class="text-[11px] text-content-muted tabular-nums shrink-0">
                {{ formatMoney(goal.savedAmount.amount, goal.savedAmount.currencyId) }}
              </p>
            </router-link>
          </div>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.detail-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}
</style>
