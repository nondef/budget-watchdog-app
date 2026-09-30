<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useExchangeRateStore } from '@/stores/exchange-rates';
import { useCurrenciesStore } from '@/stores/currencies';
import { useAppStore } from '@/stores/app';
import CollapseTransition from '@/components/CollapseTransition.vue';
import CardHeaderLink from '@/components/CardHeaderLink.vue';

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
  <!-- Kur verisi gelince/gidince kart yerinde açılıp katlanır. -->
  <collapse-transition>
    <section v-if="rows.length" class="bg-surface rounded-2xl px-4">
      <header class="flex items-center justify-between py-4">
        <div>
          <h3 class="text-[14px] font-semibold text-content">{{ $t('cards.ratesTitle') }}</h3>
          <p class="text-[11px] text-content-muted mt-0.5">
            <transition name="value-swap" mode="out-in">
              <span :key="baseCurrency?.code" class="inline-block">
                {{ $t('cards.ratesUnit', { code: baseCurrency?.code }) }}
              </span>
            </transition>
          </p>
        </div>
        <card-header-link to="/settings/financial-indicators" :label="$t('common.all')" />
      </header>

      <!-- Izgarada çıkan hücreyi akıştan almak (list-row) yerleşimi bozar;
           burada yalnızca giriş/çıkış solması, satır sayısı zaten nadiren değişir. -->
      <transition-group tag="div" name="fade" class="pb-3 grid grid-cols-2 gap-2">
        <div
            v-for="r in rows"
            :key="r.id"
            class="flex items-center justify-between rounded-xl bg-surface-sunken px-3 py-2.5"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-[12px] font-bold text-content-muted w-7">{{ r.symbol }}</span>
            <span class="text-[12px] font-medium text-content-secondary">{{ r.code }}</span>
          </div>
          <transition name="value-swap" mode="out-in">
            <span :key="formatRate(r.rate)" class="text-[13px] font-semibold text-content tabular-nums">
              {{ formatRate(r.rate) }}
            </span>
          </transition>
        </div>
      </transition-group>
    </section>
  </collapse-transition>
</template>
