<script setup lang="ts">
import { computed } from 'vue';
import { IonIcon } from '@ionic/vue';
import { getIconByName } from "@/shared/utils";
import { useMoney } from "@/composables/money/useMoney";
import { useCurrenciesStore } from "@/stores/currencies";
import { AccountDTO } from "@/application";
import AnimatedHeight from "@/components/AnimatedHeight.vue";
import CardHeaderLink from "@/components/CardHeaderLink.vue";

const { formatMoney } = useMoney()
const currenciesStore = useCurrenciesStore()

const currencyCode = (account: AccountDTO) =>
    currenciesStore.currencyById(account.balance.currencyId)?.code ?? ''

// Hem ekrana basılıyor hem value-swap anahtarı: bakiye değişince kayarak yenilenir.
const balanceText = (account: AccountDTO) =>
    formatMoney(account.balance?.amount, undefined, { showSymbol: false })

interface Props {
  accounts?: AccountDTO[]
  limit?: number
}

const props = withDefaults(defineProps<Props>(), {
  accounts: () => [],
  limit: 5,
})

const visibleAccounts = computed(() => props.accounts.slice(0, props.limit))
</script>

<template>
  <section class="bg-surface rounded-2xl px-4">
    <header class="flex items-center justify-between py-4">
      <h3 class="text-[14px] font-semibold text-content">{{ $t('cards.accountsTitle') }}</h3>
      <card-header-link to="/tabs/accounts" :label="$t('common.all')" />
    </header>

    <animated-height>
      <transition name="fade" mode="out-in">
        <transition-group v-if="visibleAccounts.length" tag="div" name="list-row" class="relative pb-2">
          <div
              v-for="(account, idx) in visibleAccounts"
              :key="account.id"
              class="flex items-center gap-3 py-3"
              :class="{ 'border-t border-line': idx !== 0 }"
          >
            <div
                class="size-9 rounded-full flex items-center justify-center shrink-0 text-white"
                :class="account.icon?.color"
            >
              <ion-icon :icon="getIconByName(account.icon?.name ?? '')" class="size-[16px]" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[14px] text-content truncate">{{ account.name }}</p>
              <p class="text-[11px] text-content-muted mt-0.5">{{ currencyCode(account) }}</p>
            </div>
            <transition name="value-swap" mode="out-in">
              <p
                  :key="balanceText(account)"
                  class="text-[14px] font-medium text-content tabular-nums shrink-0"
              >
                {{ balanceText(account) }}
              </p>
            </transition>
          </div>
        </transition-group>

        <div v-else class="py-6 text-center text-[13px] text-content-muted">
          {{ $t('cards.accountsEmpty') }}
        </div>
      </transition>
    </animated-height>
  </section>
</template>
