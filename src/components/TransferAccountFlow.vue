<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { arrowDownOutline, swapVerticalOutline } from 'ionicons/icons'
import type { AccountDTO } from '@/application'
import AccountCarousel from '@/components/AccountCarousel.vue'
import CurrencyInput from '@/components/CurrencyInput.vue'
import ErrorChip from '@/components/ErrorChip.vue'

withDefaults(defineProps<{
  sourceAccounts: AccountDTO[]
  targetAccounts: AccountDTO[]
  sourceError?: string
  targetError?: string
  crossCurrency?: boolean
  sourceCurrencyCode?: string
  targetCurrencyCode?: string
  targetCurrencyMinorUnit?: number
  targetAmountError?: string
}>(), {
  sourceError: '',
  targetError: '',
  crossCurrency: false,
  sourceCurrencyCode: '',
  targetCurrencyCode: '',
  targetAmountError: '',
})

const sourceAccountId = defineModel<string>('sourceAccountId', { required: true })
const targetAccountId = defineModel<string>('targetAccountId', { required: true })
const targetAmount = defineModel<number>('targetAmount', { required: true })
</script>

<template>
  <section class="transfer-flow overflow-hidden rounded-[28px] p-4">
    <header class="flex items-center gap-3">
      <div class="transfer-flow__icon flex size-10 shrink-0 items-center justify-center rounded-2xl">
        <ion-icon :icon="swapVerticalOutline" class="size-5"/>
      </div>
      <div class="min-w-0">
        <h2 class="text-[15px] font-bold leading-5 text-content">
          {{ $t('common.transfer') }}
        </h2>
        <p class="text-[11px] leading-4 text-content-muted">
          {{ $t('transactions.exitAccount') }} → {{ $t('transactions.targetAccount') }}
        </p>
      </div>
    </header>

    <div class="mt-4">
      <AccountCarousel
          v-model="sourceAccountId"
          :accounts="sourceAccounts"
          :label="$t('transactions.exitAccount')"
      />
      <div v-if="sourceError" class="mt-1 px-1">
        <ErrorChip :message="sourceError"/>
      </div>
    </div>

    <!-- Kaynak ve hedef kartlarını görsel olarak birbirine bağlayan akış çizgisi. -->
    <div class="relative flex h-12 items-center justify-center" aria-hidden="true">
      <span class="transfer-flow__line absolute inset-y-0 left-1/2 w-px -translate-x-1/2"/>
      <span class="transfer-flow__direction relative z-[1] flex size-8 items-center justify-center rounded-full">
        <ion-icon :icon="arrowDownOutline" class="size-4"/>
      </span>
      <span
          v-if="crossCurrency && sourceCurrencyCode && targetCurrencyCode"
          class="transfer-flow__currency absolute right-0 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide"
      >
        {{ sourceCurrencyCode }} → {{ targetCurrencyCode }}
      </span>
    </div>

    <div class="transfer-flow__target rounded-2xl p-4">
      <AccountCarousel
          v-model="targetAccountId"
          :accounts="targetAccounts"
          :label="$t('transactions.targetAccount')"
      />

      <div v-if="targetError" class="mt-1 px-1">
        <ErrorChip :message="targetError"/>
      </div>

      <div v-if="crossCurrency" class="mt-3 border-t border-line pt-3">
        <div class="mb-2 flex items-center justify-between px-1">
          <span class="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
            {{ $t('transactions.targetAmount') }}
          </span>
          <span class="text-[11px] font-bold text-content-secondary">{{ targetCurrencyCode }}</span>
        </div>

        <div class="transfer-flow__amount relative flex items-center justify-center rounded-2xl px-3">
          <CurrencyInput
              v-model="targetAmount"
              variant="plain"
              hide-currency
              :label="$t('transactions.targetAmount')"
              :currency-code="targetCurrencyCode"
              :minor-unit="targetCurrencyMinorUnit"
              class="transfer-flow__amount-input w-full"
          />
          <span class="transfer-flow__amount-code">{{ targetCurrencyCode }}</span>
        </div>

        <div v-if="targetAmountError" class="mt-2 flex justify-center">
          <ErrorChip :message="targetAmountError"/>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.transfer-flow {
  background: var(--c-surface);
  box-shadow: inset 0 0 0 1px var(--c-line);
}

.transfer-flow__icon {
  background: var(--c-inverse-surface);
  color: var(--c-inverse-on-surface);
}

.transfer-flow__line {
  background: var(--c-line-strong);
}

.transfer-flow__direction {
  background: var(--c-inverse-surface);
  color: var(--c-inverse-on-surface);
  box-shadow: 0 0 0 5px var(--c-surface);
}

.transfer-flow__currency {
  background: var(--c-surface-sunken);
  color: var(--c-content-secondary);
  box-shadow: inset 0 0 0 1px var(--c-line);
}

.transfer-flow__target {
  background: var(--c-surface-sunken);
  box-shadow: inset 0 0 0 1px var(--c-line);
}

.transfer-flow__amount {
  background: var(--c-surface);
  box-shadow: inset 0 0 0 1px var(--c-line);
}

.transfer-flow__amount-input {
  --background: transparent;
  --color: inherit;
  --padding-start: 48px;
  --padding-end: 48px;
  font-size: clamp(24px, 7vw, 30px);
  font-weight: 800;
}

.transfer-flow__amount-input :deep(input) {
  font: inherit;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.transfer-flow__amount-code {
  position: absolute;
  inset-inline-end: 12px;
  top: 50%;
  transform: translateY(-50%);
  padding-inline-start: 10px;
  border-inline-start: 1px solid var(--c-line);
  color: var(--c-content-secondary);
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}
</style>
