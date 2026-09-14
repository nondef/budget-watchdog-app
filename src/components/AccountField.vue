<script setup lang="ts">
import { ref, computed } from 'vue'
import { IonIcon } from '@ionic/vue'
import { checkmarkOutline } from 'ionicons/icons'
import type { AccountDTO } from '@/application'
import { getIconByName } from '@/shared/utils'
import { useMoney } from '@/composables/money/useMoney'
import SheetModal from '@/components/SheetModal.vue'
import PickerField from '@/components/PickerField.vue'

const props = withDefaults(defineProps<{
  accounts: AccountDTO[]
  label?: string
  error?: string
}>(), {
  label: 'Hesap',
})

/** Seçili hesap id'si */
const model = defineModel<string>({ required: true })

const modalOpen = ref(false)
const { formatMoney } = useMoney()

const selected = computed(() => props.accounts.find(a => a.id === model.value) ?? null)

const select = (accountId: string) => {
  model.value = accountId
  modalOpen.value = false
}
</script>

<template>
  <!-- MD3 filled field görünümlü seçici (PickerField). -->
  <picker-field :label="label" :error="error" :empty="!selected" @click="modalOpen = true">
    <template #start>
      <div
          slot="start"
          class="size-9 rounded-xl flex items-center justify-center text-white shrink-0"
          :class="selected?.icon.color || 'bg-surface-strong'"
      >
        <ion-icon :icon="getIconByName(selected?.icon.name || 'walletOutline')" class="size-[16px]"/>
      </div>
    </template>
    {{ selected?.name || 'Hesap seç' }}
  </picker-field>

  <SheetModal :is-open="modalOpen" title="Hesap Seç" @dismiss="modalOpen = false">
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
            {{ formatMoney(account.balance.amount, account.balance.currencyId) }}
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
