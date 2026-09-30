<script setup lang="ts">
import { IonIcon } from '@ionic/vue';
import { TransactionDTO } from "@/application";
import { computed } from "vue";
import { useCategoriesStore } from "@/stores/categories";
import { getIconByName } from "@/shared/utils";
import { useMoney } from "@/composables/money/useMoney";
import AnimatedHeight from "@/components/AnimatedHeight.vue";
import CardHeaderLink from "@/components/CardHeaderLink.vue";

const categoryStore = useCategoriesStore()
const { formatMoney, baseCurrency, formatInBase } = useMoney()

interface Props {
  transactions: TransactionDTO[]
  title: string
  limit?: number
}

const props = withDefaults(defineProps<Props>(), {
  transactions: () => [],
  title: '',
  limit: 5,
})


const rows = computed(() => {
  return props.transactions.slice(0, props.limit).map(t => {
    const category = categoryStore.categoryById(t.categoryId)
    const isBase = t.amount.currencyId === baseCurrency.value?.id

    return {
      id: t.id,
      title: t.title,
      date: t.date,
      type: t.type,
      icon: category?.icon.name ?? 'helpCircleOutline',
      color: category?.icon.color ?? 'bg-slate-500',
      amount: formatMoney(t.amount.amount, t.amount.currencyId),
      amountInBase: isBase ? null : formatInBase(t.amount.amount, t.amount.currencyId),
    }
  })
})
</script>

<template>
  <section class="bg-surface rounded-2xl px-4">
    <header class="flex items-center justify-between py-4">
      <h2 class="text-[14px] font-semibold text-content">{{ title }}</h2>
      <card-header-link to="/tabs/transactions" :label="$t('common.all')" />
    </header>

    <!-- Yeni işlem en üstten girer, en eskisi alttan çıkar, arada kalanlar kayar. -->
    <animated-height>
      <transition name="fade" mode="out-in">
        <transition-group v-if="rows.length" tag="div" name="list-row" class="relative pb-2">
          <div
              v-for="(transaction, idx) in rows"
              :key="transaction.id"
              class="flex items-center gap-3 py-3"
              :class="{ 'border-t border-line': idx !== 0 }"
          >
            <div
                class="size-9 rounded-full flex items-center justify-center shrink-0 text-white"
                :class="transaction.color"
            >
              <ion-icon :icon="getIconByName(transaction.icon)" class="size-[16px]" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[14px] text-content truncate">{{ transaction.title }}</p>
              <p class="text-[11px] text-content-muted mt-0.5">
                {{
                  new Date(transaction.date).toLocaleDateString($i18n.locale, {
                    day: 'numeric', month: 'long'
                  })
                }}
              </p>
            </div>
            <div class="text-right shrink-0">
              <transition name="value-swap" mode="out-in">
                <p
                    :key="`${transaction.type}:${transaction.amount}`"
                    class="text-[14px] font-medium tabular-nums"
                    :class="transaction.type === 'income' ? 'text-emerald-600' : 'text-content'"
                >
                  {{ transaction.type === 'income' ? '+' : '−' }} {{ transaction.amount }}
                </p>
              </transition>
              <p v-if="transaction.amountInBase" class="text-[11px] text-content-muted tabular-nums mt-0.5">
                ≈ {{ transaction.amountInBase }}
              </p>
            </div>
          </div>
        </transition-group>

        <div v-else class="py-6 text-center text-[13px] text-content-muted">
          {{ $t('cards.transactionsEmpty') }}
        </div>
      </transition>
    </animated-height>
  </section>
</template>
