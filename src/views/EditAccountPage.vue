<script lang="ts" setup>
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonIcon,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption, IonFooter, IonButton,
} from '@ionic/vue';
import {
  lockClosedOutline,
  cashOutline,
  walletOutline,
  cardOutline,
  trendingUpOutline,
  serverOutline,
} from 'ionicons/icons';
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAccountsStore } from '@/stores/accounts';
import IconPickerModal from "@/components/IconPickerModal.vue";
import { useCurrenciesStore } from "@/stores/currencies";
import { useForm } from "vee-validate";
import { updateAccountSchema } from "@/forms";
import CurrencyInput from "@/components/CurrencyInput.vue";
import PickerField from "@/components/PickerField.vue";
import { getIconByName } from "@/shared/utils";
import { AccountType, OperationNotAllowedException } from "@/domain";
import { useToast } from "@/composables/ui/useToast";
import { guardSubmit } from "@/composables/ui/guard-submit";
import { useCurrencyDisplay } from "@/composables/money/useCurrencyDisplay";
import { useI18n } from "vue-i18n";
import { useAppNavigation } from "@/composables/navigation/useAppNavigation";

const { t } = useI18n();
const { currencyName } = useCurrencyDisplay();
const { ionRouter, goBackOrFallback } = useAppNavigation()
const route = useRoute();
const accountsStore = useAccountsStore();
const currencyStore = useCurrenciesStore();

const accountId = route.params.id as string;
const schema = computed(() => updateAccountSchema());

const { handleSubmit, errors, defineField, resetForm, isSubmitting } = useForm({
  validationSchema: schema,
  initialValues: {
    cardName: '',
    currency: '',
    type: '' as AccountType | '',
    selectedIconName: 'walletOutline',
    selectedColor: 'bg-indigo-500',
    balance: 0,
    details: ''
  }
});

const [cardName, cardNameAttr] = defineField('cardName');
const [type, typeAttr] = defineField('type');
const [currency] = defineField('currency');
const [balance] = defineField('balance');
const [details] = defineField('details');
const [selectedIconName] = defineField('selectedIconName');
const [selectedColor] = defineField('selectedColor');

const toast = useToast();
const showIconPicker = ref(false);

const accountTypes: { value: AccountType, icon: string }[] = [
  { value: 'cash', icon: cashOutline },
  { value: 'bank', icon: walletOutline },
  { value: 'credit', icon: cardOutline },
  { value: 'investment', icon: trendingUpOutline },
  { value: 'savings', icon: serverOutline },
];

const selectedCurrency = computed(() =>
    currencyStore.currencies.find(c => c.id === currency.value)
);

const previewBalance = computed(() => {
  const symbol = selectedCurrency.value?.symbol || '₺'
  const amount = Number(balance.value || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${symbol}${amount}`
});

const previewType = computed(() =>
    type.value ? t(`accountTypes.${type.value}`) : t('accountTypes.cash')
);

const submitAccount = handleSubmit(async (values) => {
  try {
    await accountsStore.updateAccount({
      id: accountId,
      name: values.cardName,
      icon: {
        name: values.selectedIconName,
        color: values.selectedColor
      },
      notes: values.details,
      type: values.type as AccountType,
    });

    goBackOrFallback('/settings/accounts')
  } catch (e) {
    // Borçlu bir kredi hesabının tipi değiştirilemez; generic "güncellenemedi"
    // mesajı kullanıcıya nedenini söylemiyordu.
    if (e instanceof OperationNotAllowedException) {
      toast.error(t('accounts.debtTypeChangeBlocked'));
    } else {
      toast.error(t('accounts.updateError'));
    }
  }
});

/** Çift dokunuşta aynı güncelleme iki kez uygulanmasın (bkz. guardSubmit). */
const saveAccount = guardSubmit(isSubmitting, submitAccount);

const handleIconPicker = (payload: { iconName: string, color: string }) => {
  selectedIconName.value = payload.iconName;
  selectedColor.value = payload.color;
};

onMounted(async () => {
  await currencyStore.loadCurrencies();

  try {
    const account = await accountsStore.getAccountById(accountId);

    if (!account) {
      toast.error(t('accounts.notFound'));
      ionRouter.navigate('/settings/accounts', 'back', 'replace')
      return;
    }

    resetForm({
      values: {
        cardName: account.name,
        currency: account.balance.currencyId,
        type: account.type,
        selectedIconName: account.icon.name,
        selectedColor: account.icon.color,
        balance: account.balance.amount,
        details: account.notes ?? '',
      }
    });
  } catch (e) {
    toast.error(t('accounts.loadError'));
  }
});
</script>

<template>
  <ion-page class="design-page">
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button text="" default-href="/settings/accounts" />
        </ion-buttons>
        <ion-title class="font-semibold">{{ $t('accounts.edit') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="form-content" :scroll-y="true">
      <div class="px-4 pt-3">
        <!-- Önizleme kartı -->
        <button
            type="button"
            class="w-full bg-surface rounded-2xl px-4 py-4 flex items-center gap-3 active:bg-surface-sunken transition text-left"
            @click="showIconPicker = true"
        >
          <span
              class="size-12 rounded-xl flex items-center justify-center shadow-sm shrink-0"
              :class="selectedColor"
          >
            <ion-icon :icon="getIconByName(selectedIconName)" class="size-6 text-white" />
          </span>
          <span class="flex-1 min-w-0">
            <span class="block text-[16px] font-bold text-content truncate">
              {{ cardName || $t('accounts.namePlaceholder') }}
            </span>
            <span class="block text-[13px] text-content-muted mt-0.5 truncate">
              {{ previewType }}
            </span>
          </span>
          <span class="text-[16px] font-bold text-content shrink-0">{{ previewBalance }}</span>
        </button>
      </div>

      <!-- Form alanları -->
      <div class="mt-5 px-4 pb-32 space-y-5">

        <!-- Hesap adı — MD3 filled text field -->
        <ion-input
            v-model="cardName"
            fill="solid"
            label-placement="floating"
            :label="$t('accounts.nameLabel')"
            :placeholder="$t('accounts.nameInputPlaceholder')"
            :error-text="errors.cardName"
            :class="{ 'ion-touched ion-invalid': errors.cardName }"
            @ion-input="cardNameAttr.onInput"
            @ion-blur="cardNameAttr.onBlur"
            @ion-change="cardNameAttr.onChange"
        />

        <!-- Hesap tipi -->
        <ion-select :interface-options="{ header: $t('accounts.typeSelectHeader'), subHeader: $t('accounts.typeSelectSubHeader') }"
                    @ion-input="typeAttr.onInput"
                    @ion-blur="typeAttr.onBlur"
                    v-model="type"
                    @ion-change="typeAttr.onChange"
                    :error-text="errors.type"
                    :class="{ 'ion-touched ion-invalid': errors.type }"
                    fill="solid"
                    :label="$t('accounts.accountType')"
                    label-placement="floating"
                    interface="action-sheet">
          <ion-select-option v-for="accType in accountTypes"
                             :key="accType.value"
                             :value="accType.value">
            {{ $t(`accountTypes.${accType.value}`) }}
          </ion-select-option>
        </ion-select>

        <!-- Para birimi (kilitli) — MD3 picker alanı, readonly -->
        <picker-field :label="$t('accounts.currency')" readonly>
          <template #start>
            <span
                slot="start"
                class="size-9 rounded-xl flex items-center justify-center shrink-0 bg-surface-sunken"
            >
              <span class="text-[14px] font-bold text-content-muted">{{ selectedCurrency?.symbol || '—' }}</span>
            </span>
          </template>
          {{ selectedCurrency ? `${selectedCurrency.code} — ${currencyName(selectedCurrency)}` : '—' }}
          <template #end>
            <ion-icon slot="end" :icon="lockClosedOutline" class="size-[14px] text-content-faint shrink-0" />
          </template>
        </picker-field>

        <!-- Mevcut bakiye (kilitli) — MD3 filled currency alanı -->
        <CurrencyInput
            disabled
            v-model="balance"
            :label="$t('accounts.currentBalance')"
            :currency-code="selectedCurrency?.code || 'TRY'"
            :symbol="selectedCurrency?.symbol"
            :minor-unit="selectedCurrency?.minorUnit"
        />

        <!-- Not — MD3 filled textarea -->
        <ion-textarea
            v-model="details"
            fill="solid"
            label-placement="floating"
            :label="$t('accounts.noteOptional')"
            :maxlength="150"
            :counter="true"
            :rows="3"
            :auto-grow="false"
            :placeholder="$t('accounts.notePlaceholder')"
        />
      </div>
    </ion-content>

    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <ion-button
            expand="block"
            class="app-button"
            :disabled="isSubmitting"
            @click="saveAccount"
        >
          {{ isSubmitting ? $t('accounts.saving') : $t('accounts.save') }}
        </ion-button>
      </ion-toolbar>
    </ion-footer>

    <!-- İkon picker -->
    <IconPickerModal
        :icon-name="selectedIconName"
        v-model:is-open="showIconPicker"
        :color="selectedColor"
        @select="handleIconPicker"
    />
  </ion-page>
</template>

<style scoped>
.form-content {
  --background: var(--c-page);
}

.save-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 5px;
  padding: 12px 16px calc(env(safe-area-inset-bottom) + 12px);
  z-index: 10;
}

ion-page {
  overflow: hidden;
}

/* Hesap tipi segmenti — görseller host'taki Tailwind sınıflarından gelir */
ion-segment.account-type-segment {
  width: auto;
  border-radius: 0;
  background: transparent;
  --background: transparent;
}

ion-segment.account-type-segment ion-segment-button {
  min-width: 0;
  min-height: 0;
  height: auto;
  margin: 0;
  text-transform: none;
  letter-spacing: normal;
  font-size: inherit;
  font-weight: inherit;
  --background: transparent;
  --background-checked: transparent;
  --background-hover: transparent;
  --background-focused: transparent;
  --indicator-color: transparent;
  --indicator-box-shadow: none;
  --border-radius: 0.75rem;
  --border-width: 0;
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  --margin-start: 0;
  --margin-end: 0;
  --margin-top: 0;
  --margin-bottom: 0;
  --ripple-color: transparent;
}

ion-segment.account-type-segment ion-segment-button::part(indicator) {
  display: none;
}

ion-segment.account-type-segment ion-segment-button::part(native) {
  padding: 0;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: inherit;
}

.form-content ion-textarea :deep(textarea) {
  resize: none;
}
</style>
