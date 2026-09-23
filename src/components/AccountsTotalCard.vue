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
  <section class="account-summary-card px-5 py-5">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-[11px] font-bold uppercase tracking-[0.12em] text-content-muted">
          {{ $t('accounts.totalBalance') }}
        </p>
        <p class="mt-2 text-[30px] leading-none font-extrabold text-content tabular-nums tracking-tight">
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
      <div class="summary-icon flex size-12 items-center justify-center rounded-2xl">
        <ion-icon :icon="walletOutline" class="size-6" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.account-summary-card {
  overflow: hidden;
  border: 1px solid var(--c-line);
  border-radius: 22px;
  background: linear-gradient(145deg, var(--c-surface) 0%, var(--c-surface-sunken) 100%);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--c-content) 8%, transparent);
}

.summary-icon {
  background: var(--c-primary);
  color: var(--c-on-primary);
}
</style>
