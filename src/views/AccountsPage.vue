<script lang="ts" setup>
import {
  IonPage,
  IonContent,
  IonIcon,
  onIonViewWillEnter,
  IonButtons,
  IonTitle,
  IonToolbar,
  IonHeader, IonButton,
    IonBackButton
} from '@ionic/vue';
import {
  addOutline,
  trashOutline,
  chevronBackOutline,
  walletOutline,
} from 'ionicons/icons';
import { useAccountsStore } from '@/stores/accounts';
import { useExchangeRateStore } from '@/stores/exchange-rates';
import { useCurrenciesStore } from '@/stores/currencies';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { getIconByName } from "@/shared/utils";
import { useMoney } from "@/composables/money/useMoney";
import { AccountDTO } from "@/application";
import AccountsTotalCard from "@/components/AccountsTotalCard.vue";
import { useAlert } from "@/composables";
import { useI18n } from "vue-i18n";

const accountsStore = useAccountsStore();
const exchangeRateStore = useExchangeRateStore();
const currenciesStore = useCurrenciesStore();
const router = useRouter();
const { t } = useI18n()
const { formatMoney, formatSumInBase, sumInBase } = useMoney();
const alert = useAlert()

const currencyCode = (account: AccountDTO) =>
    currenciesStore.currencyById(account.balance.currencyId)?.code ?? '';

const totalSummary = computed(() => {
  const items = accountsStore.activeAccounts.map(a => ({
    currencyId: a.balance.currencyId,
    amount: a.balance.amount,
  }))
  const { missing } = sumInBase(items)
  return {
    text: formatSumInBase(items),
    hasMissing: missing.length > 0,
  }
})

const confirmDelete = async (id: string, event?: Event) => {
  event?.stopPropagation();

  const confirmed = await alert.confirm({
    header: t('accounts.deleteTitle'),
    message: t('accounts.deleteMessage'),
    confirmText: t('common.delete'),
    cancelText: t('common.cancel'),
    destructive: true,
  })

  if (!confirmed) return

  await accountsStore.deleteAccount(id)
}

onIonViewWillEnter(async () => {
  await Promise.all([
    accountsStore.loadAccounts(),
    exchangeRateStore.loadRates(),
  ])
});
</script>

<template>
  <ion-page>
    <!-- Üst bar -->
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" :icon="chevronBackOutline"/>
        </ion-buttons>

        <ion-title class="text-xl font-semibold">
          {{ $t('nav.accounts') }}
        </ion-title>

        <ion-buttons slot="end">
          <ion-button router-link="/accounts/new" class="size-9 rounded-full bg-inverse-surface text-inverse-on-surface">
            <ion-icon :icon="addOutline" class="size-[20px]"/>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="accounts-content" :scroll-y="true">
      <div class="px-4">
        <!-- Toplam bakiye özet kartı -->
        <AccountsTotalCard v-if="accountsStore.accounts.length"
                           :total="totalSummary.text"
                           :active-accounts="accountsStore.activeAccounts.length"
                           :has-missing="totalSummary.hasMissing"/>
      </div>

      <!-- Liste -->
      <div class="mt-3 px-4 pb-10">

        <!-- Empty state -->
        <div
            v-if="accountsStore.accounts.length === 0"
            class="bg-surface rounded-2xl px-4 py-10 text-center"
        >
          <div class="size-14 rounded-2xl bg-surface-sunken flex items-center justify-center mx-auto">
            <ion-icon :icon="walletOutline" class="size-6 text-slate-400" />
          </div>
          <p class="mt-3 text-[14px] font-medium text-content">{{ $t('accounts.emptyTitle') }}</p>
          <p class="mt-1 text-[12px] text-content-muted leading-snug">
            {{ $t('accounts.emptyDesc') }}
          </p>
          <button
              class="mt-4 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-indigo-600 text-white text-[12px] font-semibold active:bg-indigo-700 transition"
              @click="router.push('/accounts/new')"
          >
            <ion-icon :icon="addOutline" class="size-4" />
            {{ $t('accounts.new') }}
          </button>
        </div>

        <!-- Account listesi -->
        <section v-else class="bg-surface rounded-2xl px-4">
          <div
              v-for="(account, idx) in accountsStore.accounts"
              :key="account.id"
              class="flex items-center gap-3 py-3.5"
              :class="{ 'border-t border-line': idx !== 0 }"
          >
            <!-- İkon -->
            <div
                class="size-11 rounded-2xl flex items-center justify-center text-white shrink-0"
                :class="account.icon.color"
            >
              <ion-icon :icon="getIconByName(account.icon.name)" class="size-5" />
            </div>

            <!-- Bilgi (tıklanırsa detay; düzenleme detay sayfasının başlığında) -->
            <router-link
                :to="`/accounts/${account.id}/show`"
                class="flex-1 min-w-0 active:opacity-70 transition"
            >
              <p class="text-[14px] font-semibold text-content truncate">
                {{ account.name }}
              </p>
              <p class="text-[11px] text-content-muted mt-0.5">
                {{ currencyCode(account) }}
              </p>
            </router-link>

            <!-- Tutar + sil -->
            <div class="flex items-center gap-1 shrink-0">
              <p class="text-[14px] font-semibold text-content tabular-nums">
                {{ formatMoney(account.balance.amount, account.balance.currencyId) }}
              </p>
              <button
                  class="size-8 rounded-full flex items-center justify-center text-slate-400 active:bg-rose-50 active:text-rose-600 transition"
                  @click="confirmDelete(account.id, $event)"
                  :aria-label="$t('common.delete')"
              >
                <ion-icon :icon="trashOutline" class="size-[16px]" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </ion-content>

  </ion-page>
</template>

<style scoped>
.accounts-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}
</style>
