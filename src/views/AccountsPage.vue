<script lang="ts" setup>
import {
  IonPage,
  IonContent,
  IonIcon,
  onIonViewWillEnter,
  IonButton,
  IonItem,
  IonLabel,
  IonList
} from '@ionic/vue';
import {
  addOutline,
  trashOutline,
  walletOutline
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
import SubPageHeader from '@/components/SubPageHeader.vue';

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
  <ion-page class="design-page">
    <!-- Üst bar -->
    <sub-page-header :title="$t('nav.accounts')">
      <template #end>
        <ion-button router-link="/accounts/new" class="add-account-button">
          <ion-icon :icon="addOutline" class="size-[20px]"/>
        </ion-button>
      </template>
    </sub-page-header>

    <ion-content class="accounts-content" :scroll-y="true">
      <main class="mx-auto w-full max-w-xl px-4 pb-12 pt-5">
      <div>
        <!-- Toplam bakiye özet kartı -->
        <AccountsTotalCard v-if="accountsStore.accounts.length"
                           :total="totalSummary.text"
                           :active-accounts="accountsStore.activeAccounts.length"
                           :has-missing="totalSummary.hasMissing"/>
      </div>

      <!-- Liste -->
      <div class="mt-4">

        <!-- Empty state -->
        <div
            v-if="accountsStore.accounts.length === 0"
            class="accounts-card px-4 py-10 text-center"
        >
          <div class="size-14 rounded-2xl bg-surface-sunken flex items-center justify-center mx-auto">
            <ion-icon :icon="walletOutline" class="size-6 text-slate-400" />
          </div>
          <p class="mt-3 text-[14px] font-medium text-content">{{ $t('accounts.emptyTitle') }}</p>
          <p class="mt-1 text-[12px] text-content-muted leading-snug">
            {{ $t('accounts.emptyDesc') }}
          </p>
          <ion-button
              class="empty-action mt-4"
              @click="router.push('/accounts/new')"
          >
            <ion-icon slot="start" :icon="addOutline" />
            {{ $t('accounts.new') }}
          </ion-button>
        </div>

        <!-- Account listesi -->
        <section v-else class="accounts-card overflow-hidden">
          <ion-list :inset="false" lines="full">
          <ion-item
              v-for="(account, idx) in accountsStore.accounts"
              :key="account.id"
              class="account-row"
              :lines="idx === accountsStore.accounts.length - 1 ? 'none' : 'full'"
              :router-link="`/accounts/${account.id}/show`"
              button
              :detail="false"
          >
            <!-- İkon -->
            <div
                slot="start"
                class="account-icon flex size-11 shrink-0 items-center justify-center rounded-2xl text-white"
                :class="account.icon.color"
            >
              <ion-icon :icon="getIconByName(account.icon.name)" class="size-5" />
            </div>

            <!-- Bilgi (tıklanırsa detay; düzenleme detay sayfasının başlığında) -->
            <ion-label>
              <p class="account-name truncate">
                {{ account.name }}
              </p>
              <p class="account-currency mt-0.5">
                {{ currencyCode(account) }}
              </p>
            </ion-label>

            <!-- Tutar + sil -->
            <div slot="end" class="flex shrink-0 items-center gap-1">
              <p class="account-balance tabular-nums">
                {{ formatMoney(account.balance.amount, account.balance.currencyId) }}
              </p>
              <ion-button
                  fill="clear"
                  class="delete-account-button"
                  @click="confirmDelete(account.id, $event)"
                  :aria-label="$t('common.delete')"
              >
                <ion-icon slot="icon-only" :icon="trashOutline" />
              </ion-button>
            </div>
          </ion-item>
          </ion-list>
        </section>
      </div>
      </main>
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

ion-button.add-account-button {
  width: 38px;
  height: 38px;
  --background: var(--c-primary);
  --background-activated: var(--c-primary-strong);
  --border-radius: 12px;
  --box-shadow: none;
  --color: var(--c-on-primary);
  --padding-start: 0;
  --padding-end: 0;
}

ion-button.add-account-button ion-icon {
  color: var(--c-on-primary);
}

/* Toolbar'ın genel dark-mode kuralı tüm sağ butonları açık metne zorluyor.
   Bu butonun zemini dark modda zaten açık primary olduğu için ikonu kendi
   on-primary rengine (koyu) geri al. */
:global(html.ion-palette-dark) ion-button.add-account-button {
  --color: var(--c-on-primary) !important;
  color: var(--c-on-primary) !important;
}

.accounts-card {
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: 18px;
  box-shadow: 0 5px 18px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.accounts-card ion-list {
  padding: 0;
  background: transparent;
}

.account-row {
  --background: transparent;
  --background-activated: var(--c-surface-sunken);
  --background-hover: transparent;
  --border-color: var(--c-line);
  --min-height: 70px;
  --padding-start: 14px;
  --inner-padding-end: 8px;
}

.account-icon {
  margin-inline-end: 12px;
}

.account-name,
.account-balance {
  color: var(--c-content);
  font-size: 14px;
  font-weight: 750;
  line-height: 1.3;
}

.account-currency {
  color: var(--c-content-secondary);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.35;
}

:global(.ion-palette-dark) .account-name,
:global(.ion-palette-dark) .account-balance {
  color: #ffffff;
}

:global(.ion-palette-dark) .account-currency {
  color: #d6d6d6;
}

ion-button.delete-account-button {
  width: 36px;
  height: 36px;
  margin: 0 -5px 0 2px;
  --border-radius: 12px;
  --color: var(--c-content-muted);
  --padding-start: 0;
  --padding-end: 0;
}

ion-button.delete-account-button:active {
  --background: color-mix(in srgb, var(--c-error) 10%, transparent);
  --color: var(--c-error);
}

ion-button.empty-action {
  min-height: 42px;
  margin-bottom: 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: none;
  --background: var(--c-primary);
  --background-activated: var(--c-primary-strong);
  --border-radius: 13px;
  --box-shadow: none;
  --color: var(--c-on-primary);
}
</style>
