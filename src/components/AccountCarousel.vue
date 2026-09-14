<script setup lang="ts">
import { accountGradient } from "@/shared/utils/ui/colors";
import { getIconByName } from "@/shared/utils";
import { IonIcon, IonRippleEffect, IonSegment, IonSegmentButton } from "@ionic/vue";
import { AccountDTO } from "@/application";
import { useMoney } from "@/composables/money/useMoney";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

interface Props {
  accounts: AccountDTO[]
  label?: string
}

const props = defineProps<Props>()
const model = defineModel<string>({ required: true })

const { formatMoney } = useMoney()
const { t } = useI18n()

const accountCount = computed(() =>
    props.accounts.findIndex(acc => acc.id === model.value) + 1 + '/' + props.accounts.length
)

const changed = (event: CustomEvent) => {
  const accountId = event.detail.value

  if (!accountId || accountId === model.value) {
    return
  }

  model.value = accountId

  ;(event.target as HTMLElement)
      .querySelector(`ion-segment-button[value="${accountId}"]`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
}
</script>

<template>
  <section>
    <div class="flex items-center justify-between px-1 mb-2">
      <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
        {{ label ?? t('transactions.account') }}
      </p>
      <span class="text-[11px] text-slate-400 tabular-nums">{{ accountCount }}</span>
    </div>

    <!-- Snap carousel (scrollable segment) -->
    <ion-segment
        scrollable
        :value="model"
        class="account-carousel no-scrollbar"
        @ionChange="changed"
    >
      <ion-segment-button
          v-for="account in accounts"
          :key="account.id"
          :value="account.id"
          class="account-card ion-activatable relative overflow-hidden rounded-2xl text-white text-left shrink-0 transition-all duration-200 bg-gradient-to-br"
          :class="[
                  accountGradient(account.icon.color),
                  model === account.id
                    ? 'opacity-100 scale-100 shadow-lg'
                    : 'opacity-40 grayscale scale-[0.94]'
                ]"
      >
        <ion-ripple-effect/>
        <!-- Desen / glow -->
        <span class="absolute inset-0 opacity-30 mix-blend-overlay pointer-events-none"
              style="background-image: radial-gradient(120px 80px at 0% 100%, rgba(255,255,255,0.5), transparent 50%), radial-gradient(140px 90px at 100% 0%, rgba(0,0,0,0.35), transparent 50%)"/>

        <span class="relative p-2 flex items-center gap-2 w-full h-full">
                <!-- İkon solda -->
                <span class="size-8 shrink-0 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center">
                  <ion-icon :icon="getIconByName(account.icon.name)" class="size-[16px] text-white"/>
                </span>

                <!-- Ad üstte + bakiye altta -->
                <span class="flex flex-col items-start min-w-0 flex-1">
                  <span class="max-w-full text-[11px] font-medium opacity-80 truncate">{{ account.name }}</span>
                  <span class="max-w-full text-[14px] font-extrabold tabular-nums tracking-tight truncate">
                    {{ formatMoney(account.balance.amount, account.balance.currencyId) }}
                  </span>
                </span>
              </span>
      </ion-segment-button>
    </ion-segment>
  </section>
</template>

<style scoped>
ion-segment.account-carousel {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 10px 16px 14px;
  margin: 0 -16px;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: 16px;
  width: auto;
  border-radius: 0;
  background: transparent;
  --background: transparent;
}

ion-segment-button.account-card {
  width: 140px;
  height: 64px;
  min-width: 0;
  min-height: 0;
  max-width: none;
  flex: 0 0 auto;
  margin: 0;
  scroll-snap-align: center;
  box-shadow: 0 10px 24px -10px rgba(15, 23, 42, 0.35);
  text-transform: none;
  letter-spacing: normal;
  font-size: inherit;
  font-weight: inherit;
  --background: transparent;
  --background-checked: transparent;
  --background-hover: transparent;
  --background-focused: transparent;
  --color: #fff;
  --color-checked: #fff;
  --color-hover: #fff;
  --color-focused: #fff;
  --indicator-color: transparent;
  --indicator-box-shadow: none;
  --border-radius: 1rem;
  --border-width: 0;
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  --margin-start: 0;
  --margin-end: 0;
  --margin-top: 0;
  --margin-bottom: 0;
  --ripple-color: rgba(255, 255, 255, 0.4);
}

ion-segment-button.account-card::part(indicator) {
  display: none;
}

ion-segment-button.account-card::part(native) {
  padding: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: stretch;
}

.account-card:first-child {
  scroll-snap-align: start;
}

.account-card:last-child {
  scroll-snap-align: end;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
</style>
