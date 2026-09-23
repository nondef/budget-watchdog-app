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
  initial:    { icon: sparklesOutline,        tone: 'initial',    sign: '+' },
  deposit:    { icon: arrowDownCircleOutline, tone: 'deposit',    sign: '+' },
  withdrawal: { icon: arrowUpCircleOutline,   tone: 'withdrawal', sign: '−' },
  refund:     { icon: returnDownBackOutline,  tone: 'refund',     sign: '−' },
} as const;

const contributionMeta = (type: SavingGoalContributionDTO['type']) =>
    CONTRIBUTION_META[type] ?? CONTRIBUTION_META.deposit;

const contributionTime = (date: Date) =>
    new Date(date).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' });

</script>

<template>
        <!-- Hareket geçmişi -->
        <section class="history-card">
          <div class="history-header">
            <span class="history-header__icon"><ion-icon :icon="timeOutline" /></span>
            <p class="text-[12px] font-extrabold uppercase tracking-wider text-content-muted">
              {{ $t('savingGoals.history.title') }}
            </p>
          </div>

          <div v-if="historyLoading" class="history-state" role="status">{{ $t('common.loading') }}</div>
          <div v-else-if="historyFailed" class="history-state history-state--error" role="alert">
            <p>{{ $t('savingGoals.history.loadError') }}</p>
            <ion-button class="retry-button" fill="clear" @click="$emit('retry')">{{ $t('common.retry') }}</ion-button>
          </div>
          <div v-else-if="contributions.length === 0" class="history-empty text-center">
            <p class="text-[13px] font-medium text-content-secondary">{{ $t('savingGoals.history.empty') }}</p>
            <p class="mt-1 text-[11px] text-content-muted leading-snug">
              {{ $t('savingGoals.history.emptyDesc') }}
            </p>
          </div>

          <div v-else class="history-list">
            <div
                v-for="entry in contributions"
                :key="entry.id"
                class="history-entry"
            >
              <div
                  class="history-entry__icon"
                  :class="`history-entry__icon--${contributionMeta(entry.type).tone}`"
              >
                <ion-icon
                    :icon="contributionMeta(entry.type).icon"
                    class="size-[17px]"
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
                    class="history-amount text-[14px] font-extrabold tabular-nums"
                    :class="`history-amount--${contributionMeta(entry.type).tone}`"
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

<style scoped>
.history-card {
  overflow: hidden;
  border: 1px solid var(--c-line);
  border-radius: 1.25rem;
  background: var(--c-surface);
  box-shadow: 0 7px 22px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.history-header {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 14px 16px 10px;
}

.history-header__icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: var(--c-surface-sunken);
  color: var(--c-content-muted);
  font-size: 14px;
}

.history-list {
  display: grid;
  gap: 8px;
  padding: 4px 12px 12px;
}

.history-entry {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--c-line);
  border-radius: 15px;
  background: var(--c-surface-sunken);
}

.history-entry__icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border-radius: 12px;
}

.history-entry__icon--initial {
  background: color-mix(in srgb, var(--c-primary) 13%, var(--c-surface));
  color: var(--c-primary-strong);
}

.history-entry__icon--deposit {
  background: color-mix(in srgb, #16a34a 13%, var(--c-surface));
  color: #15803d;
}

.history-entry__icon--withdrawal {
  background: color-mix(in srgb, #dc2626 12%, var(--c-surface));
  color: #b91c1c;
}

.history-entry__icon--refund {
  background: color-mix(in srgb, #d97706 13%, var(--c-surface));
  color: #b45309;
}

.history-amount--initial { color: var(--c-primary-strong); }
.history-amount--deposit { color: #15803d; }
.history-amount--withdrawal { color: #b91c1c; }
.history-amount--refund { color: #b45309; }

.history-state,
.history-empty {
  margin: 4px 12px 12px;
  padding: 22px 16px;
  border: 1px solid var(--c-line);
  border-radius: 15px;
  background: var(--c-surface-sunken);
  color: var(--c-content-muted);
  font-size: 13px;
}

.history-state--error {
  color: var(--c-error);
  text-align: center;
}

.retry-button {
  --color: var(--c-primary-strong);
  margin-bottom: -8px;
  font-weight: 700;
}

:global(.ion-palette-dark) .history-entry__icon--deposit,
:global(.ion-palette-dark) .history-amount--deposit { color: #4ade80; }

:global(.ion-palette-dark) .history-entry__icon--withdrawal,
:global(.ion-palette-dark) .history-amount--withdrawal { color: #f87171; }

:global(.ion-palette-dark) .history-entry__icon--refund,
:global(.ion-palette-dark) .history-amount--refund { color: #fbbf24; }
</style>
