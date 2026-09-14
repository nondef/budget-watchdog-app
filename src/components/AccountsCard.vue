<script setup lang="ts">
import { computed } from 'vue';
import { IonIcon } from '@ionic/vue';
import { chevronForwardOutline } from 'ionicons/icons';
import { getIconByName } from "@/shared/utils";
import { useMoney } from "@/composables/money/useMoney";
import { useCurrenciesStore } from "@/stores/currencies";
import { AccountDTO } from "@/application";

const { formatMoney } = useMoney()
const currenciesStore = useCurrenciesStore()

const currencyCode = (account: AccountDTO) =>
    currenciesStore.currencyById(account.balance.currencyId)?.code ?? ''

interface Props {
  accounts?: AccountDTO[]
  limit?: number
}

const props = withDefaults(defineProps<Props>(), {
  accounts: () => [],
  limit: 5,
})

const visibleAccounts = computed(() => props.accounts.slice(0, props.limit))
const hasMore = computed(() => props.accounts.length > props.limit)
</script>

<template>
  <section class="bg-surface rounded-2xl px-4">
    <header class="flex items-center justify-between py-4">
      <h3 class="text-[14px] font-semibold text-content">{{ $t('cards.accountsTitle') }}</h3>
      <router-link
          v-if="hasMore"
          to="/tabs/accounts"
          class="text-[12px] text-content-muted active:text-slate-900 inline-flex items-center gap-0.5"
      >
        {{ $t('common.all') }}
        <ion-icon :icon="chevronForwardOutline" class="size-3.5" />
      </router-link>
    </header>

    <div v-if="visibleAccounts.length" class="pb-2">
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
        <p class="text-[14px] font-medium text-content tabular-nums shrink-0">
          {{ formatMoney(account.balance?.amount, undefined, { showSymbol: false }) }}
        </p>
      </div>
    </div>

    <div v-else class="py-6 text-center text-[13px] text-content-muted">
      {{ $t('cards.accountsEmpty') }}
    </div>
  </section>
</template>
