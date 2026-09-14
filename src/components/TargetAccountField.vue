<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { IonItem, IonIcon } from '@ionic/vue'
import { cashOutline, checkmarkOutline } from 'ionicons/icons'
import type { AccountDTO } from '@/application'
import { getIconByName } from '@/shared/utils'
import { useMoney } from '@/composables/money/useMoney'
import SheetModal from '@/components/SheetModal.vue'
import ErrorChip from '@/components/ErrorChip.vue'

const props = defineProps<{
  /** Seçilebilir hedef hesaplar (çıkış hesabı hariç filtrelenmiş liste) */
  accounts: AccountDTO[]
  error?: string
}>()
const model = defineModel<string>({ required: true })

const modalOpen = ref(false)
const { formatMoney } = useMoney()
const { t } = useI18n()

const selected = computed(() => props.accounts.find(a => a.id === model.value))

const select = (accountId: string) => {
  model.value = accountId
  modalOpen.value = false
}
</script>

<template>
  <ion-item
      button
      :detail="false"
      lines="none"
      class="target-account-item w-full rounded-xl bg-surface-sunken transition"
      @click="modalOpen = true"
  >
    <div
        slot="start"
        class="size-8 rounded-lg flex items-center justify-center text-white"
        :class="selected?.icon.color || 'bg-slate-300'"
    >
      <ion-icon
          :icon="selected ? getIconByName(selected.icon.name) : cashOutline"
          class="size-[16px]"
      />
    </div>
    <div class="flex-1 text-left leading-tight">
      <p class="text-[13px] font-semibold text-content">
        {{ selected?.name || t('transactions.selectTargetAccount') }}
      </p>
      <p v-if="selected" class="text-[11px] text-content-muted tabular-nums">
        {{ formatMoney(selected.balance.amount) }}
      </p>
    </div>
    <span slot="end" class="text-[11px] text-indigo-600 font-medium">
      {{ selected ? t('common.change') : t('common.select') }}
    </span>
  </ion-item>

  <div v-if="error" class="mt-2">
    <ErrorChip :message="error"/>
  </div>

  <SheetModal :is-open="modalOpen" :title="t('transactions.targetAccount')" @dismiss="modalOpen = false">
    <div class="space-y-1">
      <button
          v-for="account in accounts"
          :key="account.id"
          type="button"
          class="sheet-option w-full flex items-center gap-3 px-3 py-3 rounded-xl transition"
          :class="{ 'is-selected': model === account.id }"
          @click="select(account.id)"
      >
        <div
            class="size-10 rounded-xl flex items-center justify-center text-white"
            :class="account.icon.color"
        >
          <ion-icon :icon="getIconByName(account.icon.name)" class="size-[18px]"/>
        </div>
        <div class="flex-1 text-left">
          <p class="text-[14px] font-semibold text-content">{{ account.name }}</p>
          <p class="text-[11px] text-content-muted tabular-nums">
            {{ formatMoney(account.balance.amount) }}
          </p>
        </div>
        <ion-icon
            v-if="model === account.id"
            :icon="checkmarkOutline"
            class="size-5 text-content"
        />
      </button>
    </div>
  </SheetModal>
</template>

<style scoped>
ion-item.target-account-item {
  --background: transparent;
  --background-hover: transparent;
  --background-hover-opacity: 0;
  --background-activated: #f1f5f9; /* slate-100 */
  --background-activated-opacity: 1;
  --padding-start: 0.75rem;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  --inner-padding-end: 0.75rem;
  --min-height: 3rem; /* h-12 */
  --border-width: 0;
  --inner-border-width: 0;
  --border-radius: 0.75rem;
  --color: inherit;
  --ripple-color: transparent;
  font-size: inherit;
}

ion-item.target-account-item [slot="start"] {
  margin: 0 12px 0 0; /* gap-3 */
}

ion-item.target-account-item [slot="end"] {
  margin: 0 0 0 12px; /* gap-3 */
}
</style>
