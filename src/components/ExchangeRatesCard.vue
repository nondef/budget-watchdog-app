<script setup lang="ts">
import { IonIcon } from '@ionic/vue';
import { trendingUpOutline } from 'ionicons/icons';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useExchangeRateStore } from '@/stores/exchange-rates';
import { useCurrenciesStore } from '@/stores/currencies';
import { useAppStore } from '@/stores/app';

const { locale } = useI18n();
const exchangeStore = useExchangeRateStore();
const currenciesStore = useCurrenciesStore();
const appStore = useAppStore();

interface Row {
  id: string
  code: string
  symbol: string
  rate: number
}

const baseCurrency = computed(() => appStore.baseCurrency)

const POPULAR_CODES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF']

const rows = computed<Row[]>(() => {
  const base = baseCurrency.value
  if (!base) return []

  return POPULAR_CODES
      .map(code => {
        const cur = currenciesStore.currencies.find(c => c.code === code)
        if (!cur || cur.id === base.id) return null
        const rate = exchangeStore.ratesByTarget[cur.id]
        if (!rate || rate <= 0) return null
        return {
          id: cur.id,
          code: cur.code,
          symbol: cur.symbol,
          rate,
        } as Row
      })
      .filter((x): x is Row => x !== null)
      .slice(0, 4)
})

const formatRate = (rate: number) => {
  // 1 BASE = rate TARGET, ama biz "1 TARGET = X BASE" olarak göstereceğiz
  // ratesByTarget: base → target. convert: amount / rate => target → base.
  // Yani 1 target = 1/rate base.
  const inverse = 1 / rate
  return inverse.toLocaleString(locale.value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}
</script>

<template>
  <section v-if="rows.length" class="bg-surface rounded-2xl px-4">
    <header class="flex items-center justify-between py-4">
      <div>
        <h3 class="text-[14px] font-semibold text-content">{{ $t('cards.ratesTitle') }}</h3>
        <p class="text-[11px] text-content-muted mt-0.5">
          {{ $t('cards.ratesUnit', { code: baseCurrency?.code }) }}
        </p>
      </div>
      <div class="size-7 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
        <ion-icon :icon="trendingUpOutline" class="size-[14px] text-emerald-600 dark:text-emerald-400" />
      </div>
    </header>

    <div class="pb-3 grid grid-cols-2 gap-2">
      <div
          v-for="r in rows"
          :key="r.id"
          class="flex items-center justify-between rounded-xl bg-surface-sunken px-3 py-2.5"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-[12px] font-bold text-content-muted w-7">{{ r.symbol }}</span>
          <span class="text-[12px] font-medium text-content-secondary">{{ r.code }}</span>
        </div>
        <span class="text-[13px] font-semibold text-content tabular-nums">
          {{ formatRate(r.rate) }}
        </span>
      </div>
    </div>
  </section>
</template>
