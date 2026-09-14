<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { TransactionDTO } from "@/application";
import { useCategoriesStore } from "@/stores/categories";
import { useMoney } from "@/composables/money/useMoney";
import { computed } from "vue";
import { getIconByName } from "@/shared/utils";
import { formatDateLocalized } from "@/i18n/format";

const props = defineProps<{
  transaction: TransactionDTO
}>()

const emit = defineEmits<{
  click: [transaction: TransactionDTO]
}>()

const categoryStore = useCategoriesStore()
const { formatMoney, formatInBase, baseCurrency } = useMoney()

const category = computed(() => categoryStore.categoryById(props.transaction.categoryId))
const icon = computed(() => category.value?.icon.name ?? 'helpCircleOutline')
const color = computed(() => category.value?.icon.color ?? 'bg-slate-500')

const isBase = computed(() =>
    props.transaction.amount.currencyId === baseCurrency.value?.id
)

const amountFormatted = computed(() =>
    formatMoney(props.transaction.amount.amount, props.transaction.amount.currencyId)
)

const amountInBase = computed(() =>
    isBase.value
        ? null
        : formatInBase(props.transaction.amount.amount, props.transaction.amount.currencyId)
)

const dateText = computed(() => formatDateLocalized(new Date(props.transaction.date)))
</script>

<template>
  <button
      type="button"
      class="w-full flex items-center gap-3 py-3 px-1 active:bg-surface-sunken transition rounded-lg text-left"
      @click="emit('click', transaction)"
  >
    <div
        class="size-10 rounded-2xl flex items-center justify-center shrink-0 text-white"
        :class="color"
    >
      <ion-icon :icon="getIconByName(icon)" class="size-[18px]" />
    </div>

    <div class="flex-1 min-w-0">
      <p class="text-[14px] font-medium text-content truncate">{{ transaction.title }}</p>
      <p class="text-[11px] text-content-muted mt-0.5">{{ dateText }}</p>
    </div>

    <div class="text-right shrink-0">
      <p
          class="text-[14px] font-semibold tabular-nums"
          :class="transaction.type === 'income' ? 'text-emerald-600' : 'text-content'"
      >
        {{ transaction.type === 'income' ? '+' : '−' }} {{ amountFormatted }}
      </p>
      <p v-if="amountInBase" class="text-[11px] text-content-muted tabular-nums mt-0.5">
        ≈ {{ amountInBase }}
      </p>
    </div>
  </button>
</template>
