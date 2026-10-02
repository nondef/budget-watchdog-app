<script setup lang="ts">
import { IonAvatar, IonIcon, IonItem, IonLabel, IonList, IonNote } from "@ionic/vue";
import { TransactionDTO } from "@/application";
import AnimatedHeight from "@/components/AnimatedHeight.vue";
import { swapHorizontalOutline } from "ionicons/icons";
import { getIconByName } from "@/shared/utils";
import { useCategoriesStore } from "@/stores/categories";
import { translateCategoryName, useMoney } from "@/composables";
import { computed } from "vue";
import { formatDateLocalized } from "@/i18n/format";

const props = defineProps<{
  title: string,
  items: TransactionDTO[]
}>()

const emit = defineEmits<{
  selectTransaction: [transaction: TransactionDTO]
}>()

const categoryStore = useCategoriesStore()
const { formatMoney, formatInBase, baseCurrency } = useMoney()

const rows = computed(() => {
  return props.items.map((transaction) => {
    const category = categoryStore.categoryById(transaction.categoryId)
    const { amount, currencyId } = transaction.amount
    const isBase = currencyId === baseCurrency.value?.id

    return {
      transaction,
      isTransfer: transaction.type === 'transfer',
      icon: category?.icon.name ?? 'helpCircleOutline',
      color: category?.icon.color ?? 'bg-slate-500',
      categoryName: translateCategoryName(category?.name),
      amountSign: transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '−' : '',
      amountFormatted: formatMoney(amount, currencyId),
      amountInBase: isBase ? null : formatInBase(amount, currencyId),
      dateText: formatDateLocalized(new Date(transaction.date)),
    }
  })
})
</script>

<template>
  <section class="bg-surface rounded-2xl px-4 mb-3">
    <div class="sticky top-0 z-10 -mx-4 px-4 py-3 bg-surface/95 backdrop-blur border-b border-line rounded-t-2xl">
      <p class="text-[12px] font-semibold text-content-muted uppercase tracking-wider">
        {{ title }}
      </p>
    </div>

    <!-- Arama/filtre değişince satırlar girer/çıkar, grup kartı da yumuşakça
         uzar/kısalır. Yapışkan başlık dışarıda: AnimatedHeight'in
         `overflow: hidden`ı onu bozmasın. -->
    <animated-height>
      <transition-group tag="div" name="list-row" class="relative py-1">
        <ion-list lines="full" class="transaction-list">
          <ion-item
              v-for="row in rows"
              :key="row.transaction.id"
              button
              class="transaction-item"
              @click="emit('selectTransaction', row.transaction)"
          >
            <ion-avatar
                slot="start"
                class="my-3 me-3 flex size-11 shrink-0 items-center justify-center rounded-2xl"
                :class="row.isTransfer ? 'bg-surface-strong text-content-secondary' : [row.color, 'text-white']"
                aria-hidden="true"
            >
              <ion-icon :icon="row.isTransfer ? swapHorizontalOutline : getIconByName(row.icon)" class="size-5" />
            </ion-avatar>

            <ion-label class="my-3 min-w-0">
              <span class="block truncate text-sm font-semibold leading-5 text-content">{{ row.transaction.title }}</span>
                <span class="mt-1 flex min-w-0 flex-col gap-0.5 text-[11px] leading-4">
                <span v-if="row.isTransfer || row.categoryName" class="truncate text-content-secondary">
                  {{ row.isTransfer ? $t('common.transfer') : row.categoryName }}
                </span>
                <span class="truncate text-content-muted">{{ row.dateText }}</span>
              </span>
            </ion-label>

            <ion-note slot="end" class="my-3 ms-3 max-w-[45%] shrink-0 text-right tabular-nums">
            <span class="block break-words text-sm font-bold leading-5"
                  :class="row.transaction.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-content'">
              {{ row.amountSign }} {{ row.amountFormatted }}
            </span>
              <span v-if="row.amountInBase" class="mt-1 block break-words text-[11px] leading-4 text-content-muted">≈ {{ row.amountInBase }}</span>
            </ion-note>
          </ion-item>
        </ion-list>
      </transition-group>
    </animated-height>
  </section>
</template>

<style scoped>
.transaction-list {
  background: var(--c-surface);
}

ion-item.transaction-item {
  --background: var(--c-surface) !important;
  --background-hover: var(--c-surface-sunken);
  --background-activated: var(--c-surface-sunken);
  --background-focused: var(--c-surface-sunken);
  --color: var(--c-content);
  --color-hover: var(--c-content);
  --color-activated: var(--c-content);
  --color-focused: var(--c-content);
  --ripple-color: var(--c-content);
  --detail-icon-color: var(--c-content-muted);
  --border-radius: 12px;
  --border-color: var(--c-line) !important;
  --border-width: 0 0 1px 0;
  /* Ayraç düz host üzerinde, ripple ise yuvarlatılmış native alanda kalır. */
  border-style: solid;
  border-color: var(--border-color);
  border-width: var(--border-width);
}

ion-item.transaction-item:last-child {
  --border-width: 0;
}

.transaction-item::part(native) {
  margin-block: 6px;
  border-width: 0;
  transition: background-color 150ms ease;
}
</style>
