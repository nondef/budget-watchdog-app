<script setup lang="ts">
import { IonIcon, IonButton } from '@ionic/vue';
import { arrowDownCircleOutline, arrowUpCircleOutline, sparklesOutline, returnDownBackOutline, timeOutline } from 'ionicons/icons';
import { useI18n } from 'vue-i18n';
import type { SavingGoalContributionDTO } from '@/application';
import { useMoney } from '@/composables/money/useMoney';
import { formatDateLocalized } from '@/i18n/format';

defineProps<{
  contributions: SavingGoalContributionDTO[];
  historyLoading?: boolean;
  historyFailed?: boolean;
}>();
defineEmits<{ retry: [] }>();
const { locale } = useI18n();
const { formatMoney } = useMoney();
const CONTRIBUTION_META = {
  initial:    { icon: sparklesOutline,          tone: 'text-indigo-600 dark:text-indigo-400',   bg: 'bg-indigo-50 dark:bg-indigo-500/15',   sign: '+' },
  deposit:    { icon: arrowDownCircleOutline,   tone: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/15', sign: '+' },
  withdrawal: { icon: arrowUpCircleOutline,     tone: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-50 dark:bg-rose-500/15',       sign: '−' },
  refund:     { icon: returnDownBackOutline,    tone: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-500/15',     sign: '−' },
} as const;

const contributionMeta = (type: SavingGoalContributionDTO['type']) =>
    CONTRIBUTION_META[type] ?? CONTRIBUTION_META.deposit;

const contributionTime = (date: Date) =>
    new Date(date).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' });

</script>

<template>
        <!-- Hareket geçmişi -->
        <section class="bg-surface rounded-2xl">
          <div class="flex items-center gap-1.5 px-4 pt-3 pb-1">
            <ion-icon :icon="timeOutline" class="size-[12px] text-content-faint"/>
            <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
              {{ $t('savingGoals.history.title') }}
            </p>
          </div>

          <div v-if="historyLoading" class="p-4" role="status">{{ $t('common.loading') }}</div>
          <div v-else-if="historyFailed" class="p-4" role="alert">
            <p>{{ $t('savingGoals.history.loadError') }}</p>
            <ion-button fill="clear" @click="$emit('retry')">{{ $t('common.retry') }}</ion-button>
          </div>
          <div v-else-if="contributions.length === 0" class="px-4 pb-5 pt-2 text-center">
            <p class="text-[13px] font-medium text-content-secondary">{{ $t('savingGoals.history.empty') }}</p>
            <p class="mt-1 text-[11px] text-content-muted leading-snug">
              {{ $t('savingGoals.history.emptyDesc') }}
            </p>
          </div>

          <div v-else class="px-4 pb-3">
            <div
                v-for="entry in contributions"
                :key="entry.id"
                class="flex items-start gap-3 py-3 border-t border-line"
            >
              <div
                  class="size-9 rounded-xl flex items-center justify-center shrink-0"
                  :class="contributionMeta(entry.type).bg"
              >
                <ion-icon
                    :icon="contributionMeta(entry.type).icon"
                    class="size-[16px]"
                    :class="contributionMeta(entry.type).tone"
                />
              </div>

              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-semibold text-content">
                  {{ $t(`savingGoals.history.types.${entry.type}`) }}
                </p>
                <p class="text-[11px] text-content-muted mt-0.5">
                  {{ formatDateLocalized(new Date(entry.occurredAt)) }} · {{ contributionTime(entry.occurredAt) }}
                </p>
                <p v-if="entry.note" class="text-[11px] text-content-tertiary mt-1 leading-snug whitespace-pre-wrap">
                  {{ entry.note }}
                </p>
              </div>

              <div class="text-right shrink-0">
                <p
                    class="text-[14px] font-bold tabular-nums"
                    :class="contributionMeta(entry.type).tone"
                >
                  {{ contributionMeta(entry.type).sign }}{{ formatMoney(entry.amount.amount, entry.amount.currencyId) }}
                </p>
                <p class="text-[10px] text-content-faint mt-0.5 tabular-nums">
                  {{ $t('savingGoals.history.balanceAfter', { amount: formatMoney(entry.balanceAfter.amount, entry.balanceAfter.currencyId) }) }}
                </p>
              </div>
            </div>
          </div>
        </section>
</template>
