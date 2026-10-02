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
import { AccountType, BusinessRuleViolationException, OperationNotAllowedException } from "@/domain";
import { useToast } from "@/composables/ui/useToast";
import { useErrorHandler } from "@/composables/ui/useErrorHandler";
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

/**
 * Hesapta hiç hareket yokken bakiye doğrudan düzeltilebilir (ör. onboarding'de
 * başlangıç bakiyesi boş geçildiyse). İlk hareketten sonra alan kilitlenir;
 * aynı kuralı `UpdateAccountUseCase` de zorlar.
 */
const balanceEditable = ref(false);
const schema = computed(() => updateAccountSchema(balanceEditable.value));

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
const { handle } = useErrorHandler();
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

/**
 * Düzenlenebilir kredi hesabında alan NewAccountPage'deki gibi "mevcut borç"
 * olarak girilir: formda mutlak değer tutulur, işaret tipten türetilir.
 * Kilitliyken form bakiyeyi olduğu gibi (işaretiyle) taşır.
 */
const isDebtEntry = computed(() => balanceEditable.value && type.value === 'credit');

const signedBalance = computed(() => {
  const amount = Number(balance.value || 0)
  return isDebtEntry.value && amount !== 0 ? -amount : amount
});

const balanceLabel = computed(() =>
    isDebtEntry.value ? t('accounts.currentDebt') : t('accounts.currentBalance')
);

const balanceHelper = computed(() => {
  if (!balanceEditable.value) return t('accounts.balanceLocked')
  return isDebtEntry.value ? t('accounts.currentDebtHelper') : t('accounts.balanceEditableHelper')
});

const previewBalance = computed(() => {
  const symbol = selectedCurrency.value?.symbol || '₺'
  const value = signedBalance.value
  const amount = Math.abs(value).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${value < 0 ? '-' : ''}${symbol}${amount}`
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
      // Kilitliyken gönderilmez; use-case bakiyeye hiç dokunmaz.
      ...(balanceEditable.value && { balance: signedBalance.value }),
    });

    goBackOrFallback('/settings/accounts')
  } catch (e) {
    // Borçlu bir kredi hesabının tipi değiştirilemez; generic "güncellenemedi"
    // mesajı kullanıcıya nedenini söylemiyordu.
    if (e instanceof OperationNotAllowedException) {
      toast.show(t('accounts.debtTypeChangeBlocked'));
    } else if (e instanceof BusinessRuleViolationException) {
      // Sayfa açıkken hesaba hareket eklendi: bakiye artık düzenlenemez.
      balanceEditable.value = false;
      toast.show(t('accounts.balanceLocked'));
    } else {
      handle(e, { context: 'EditAccount', fallback: t('accounts.updateError') });
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
      toast.show(t('accounts.notFound'));
      ionRouter.navigate('/settings/accounts', 'back', 'replace')
      return;
    }

    // Hareket sayısı okunamazsa alan kilitli kalır; düzenlemenin geri kalanı
    // bundan etkilenmemeli.
    let editable = false;
    try {
      const detail = await accountsStore.getAccountDetail(accountId, 1);
      editable = detail.totals.movementCount === 0;
    } catch {
      editable = false;
    }
    balanceEditable.value = editable;

    resetForm({
      values: {
        cardName: account.name,
        currency: account.balance.currencyId,
        type: account.type,
        selectedIconName: account.icon.name,
        selectedColor: account.icon.color,
        balance: editable ? Math.abs(account.balance.amount) : account.balance.amount,
        details: account.notes ?? '',
      }
    });
  } catch (e) {
    handle(e, { context: 'EditAccount', fallback: t('accounts.loadError') });
  }
});
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button text="" default-href="/settings/accounts" />
        </ion-buttons>
        <ion-title class="font-semibold">{{ $t('accounts.edit') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :scroll-y="true">
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
        <picker-field class="account-locked-field" :label="$t('accounts.currency')" readonly>
          <template #start>
            <span
                slot="start"
                class="account-locked-symbol size-9 rounded-xl flex items-center justify-center shrink-0"
            >
              <span class="text-[14px] font-bold text-content-faint">{{ selectedCurrency?.symbol || '—' }}</span>
            </span>
          </template>
          {{ selectedCurrency ? `${selectedCurrency.code} — ${currencyName(selectedCurrency)}` : '—' }}
        </picker-field>

        <!-- Mevcut bakiye — hesapta hareket varsa kilitli -->
        <div :class="{ 'account-locked-field': !balanceEditable }">
          <CurrencyInput
              :disabled="!balanceEditable"
              v-model="balance"
              :label="balanceLabel"
              :currency-code="selectedCurrency?.code || 'TRY'"
              :symbol="selectedCurrency?.symbol"
              :minor-unit="selectedCurrency?.minorUnit"
              :helper-text="balanceHelper"
              :error-text="errors.balance"
          />
        </div>

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
/* Kilitli değerler iki temada da okunur; pasiflik opaklık yerine yüzeyle belirtilir. */
.account-locked-field :deep(ion-item.md3-picker),
.account-locked-field :deep(ion-input.input-fill-solid) {
  --background: var(--c-surface-sunken) !important;
  --color: var(--c-content-faint) !important;
  --background-hover: var(--c-surface-sunken) !important;
  --background-focused: var(--c-surface-sunken) !important;
  --background-activated: var(--c-surface-sunken) !important;
  cursor: not-allowed;
  opacity: 1;
}

.account-locked-field :deep(ion-item.md3-picker)::part(native),
.account-locked-field :deep(ion-input.input-fill-solid .input-wrapper) {
  box-shadow: inset 0 0 0 1px var(--c-line);
}

.account-locked-field :deep(.md3-picker__label),
.account-locked-field :deep(.md3-picker__value),
.account-locked-field :deep(.label-text-wrapper),
.account-locked-field :deep(.currency-suffix) {
  color: var(--c-content-faint);
}

.account-locked-symbol {
  background: var(--c-surface);
}

</style>
