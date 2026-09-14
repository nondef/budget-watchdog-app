<script setup lang="ts">
import { walletOutline, warningOutline } from "ionicons/icons";
import { IonIcon } from "@ionic/vue";

interface Props {
  total: string
  activeAccounts: number
  hasMissing: boolean
}

defineProps<Props>()
</script>

<template>
  <section class="mt-5 bg-surface rounded-2xl px-4 py-4">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-[11px] font-medium uppercase tracking-wider text-content-muted">
          {{ $t('accounts.totalBalance') }}
        </p>
        <p class="mt-1 text-[28px] leading-none font-extrabold text-content tabular-nums tracking-tight">
          {{ total }}
        </p>
        <p class="mt-2 text-[11px] text-content-muted">
          {{ $t('accounts.activeCount', { count: activeAccounts }) }}
        </p>
        <p
            v-if="hasMissing"
            class="mt-2 inline-flex items-center gap-1 text-[11px] text-amber-600"
        >
          <ion-icon :icon="warningOutline" class="size-3" />
          {{ $t('accounts.ratesError') }}
        </p>
      </div>
      <div class="size-12 rounded-2xl bg-surface-sunken flex items-center justify-center">
        <ion-icon :icon="walletOutline" class="size-6 text-indigo-600 dark:text-white" />
      </div>
    </div>
  </section>
</template>

<style scoped>

</style>