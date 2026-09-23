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
  IonSelectOption,
  IonFooter, IonButton,
} from '@ionic/vue';
import {
  cashOutline,
  walletOutline,
  cardOutline,
  trendingUpOutline,
  serverOutline, chevronBackOutline,
} from 'ionicons/icons';
import { onMounted, computed, reactive } from 'vue';
import { useAccountsStore } from '@/stores/accounts';
import IconPickerModal from "@/components/IconPickerModal.vue";
import { useCurrenciesStore } from "@/stores/currencies";
import { useForm } from "vee-validate";
import { createAccountSchema } from "@/forms";
import CurrencyInput from "@/components/CurrencyInput.vue";
import CurrencyPickerModal from "@/components/CurrencyPickerModal.vue";
import { getIconByName } from "@/shared/utils";
import { AccountType, AccountLimitExceededException } from "@/domain";
import { useToast } from "@/composables/ui/useToast";
import { guardSubmit } from "@/composables/ui/guard-submit";
import { useI18n } from "vue-i18n";
import PickerField from "@/components/PickerField.vue";
import { useCurrencyDisplay } from "@/composables/money/useCurrencyDisplay";
import { CurrencyDTO } from "@/application";
import { useAppNavigation } from "@/composables/navigation/useAppNavigation";

const { t } = useI18n();
const { currencyName } = useCurrencyDisplay();

const { goBackOrFallback } = useAppNavigation();
const accountsStore = useAccountsStore();
const currencyStore = useCurrenciesStore()

const schema = computed(() => createAccountSchema(currencyStore.currencies.map((c => c.id))))

const { handleSubmit, errors, defineField, resetForm, isSubmitting } = useForm({
  validationSchema: schema,
  initialValues: {
    cardName: '',
    currency: '',
    type: '',
    selectedIconName: 'walletOutline',
    selectedColor: 'bg-indigo-500',
    balance: 0,
    details: ''
  }
})

const [cardName, cardNameAttr] = defineField('cardName')
const [balance] = defineField('balance')
const [type, typeAttr] = defineField('type')
const [currency] = defineField('currency')
const [details, detailsAttr] = defineField('details')
const [selectedIconName] = defineField('selectedIconName')
const [selectedColor] = defineField('selectedColor')

const toast = useToast()

const pickers = reactive({
  icon: false,
  currency: false
})

const accountTypes: { value: AccountType, icon: string }[] = [
  { value: 'cash', icon: cashOutline },
  { value: 'bank', icon: walletOutline },
  { value: 'credit', icon: cardOutline },
  { value: 'investment', icon: trendingUpOutline },
  { value: 'savings', icon: serverOutline },
]

const selectedCurrency = computed(() =>
    currencyStore.currencies.find(c => c.id === currency.value) ?? null
)

const onCurrencySelect = (c: CurrencyDTO) => {
  currency.value = c.id
}

/**
 * Kredi hesabında alan "mevcut borç" olarak girilir ve bakiyeye eksi işlenir.
 *
 * Tutar alanı hesap-makinesi tarzı (imleç sona sabit, yalnızca rakam eklenir);
 * eksi işareti yazdırmak yerine işareti hesap tipinden türetmek hem girişi
 * bozmuyor hem de kullanıcıya ne kaydedileceğini açıkça söylüyor.
 */
const isCreditAccount = computed(() => type.value === 'credit')

const signedBalance = computed(() => {
  const amount = Number(balance.value || 0)
  return isCreditAccount.value ? -amount : amount
})

const balanceLabel = computed(() =>
    isCreditAccount.value ? t('accounts.currentDebt') : t('accounts.initialBalance')
)

const previewBalance = computed(() => {
  const symbol = selectedCurrency.value?.symbol || '₺'
  const value = signedBalance.value
  const amount = Math.abs(value).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${value < 0 ? '-' : ''}${symbol}${amount}`
})

const previewType = computed(() =>
    type.value ? t(`accountTypes.${type.value}`) : t('accountTypes.cash')
)

const submitAccount = handleSubmit(async (values) => {
  try {
    await accountsStore.addAccount({
      name: values.cardName,
      icon: {
        name: values.selectedIconName,
        color: values.selectedColor
      },
      notes: values.details,
      currencyId: values.currency,
      type: values.type as AccountType,
      // Kredi hesabında girilen tutar borçtur; bakiyeye eksi işlenir.
      balance: values.type === 'credit' ? -values.balance : values.balance
    })

    resetForm()

    goBackOrFallback('/settings/accounts')
  } catch (e) {
    if (e instanceof AccountLimitExceededException) {
      toast.error(t('accounts.limitReached'))
    } else {
      toast.error(t('accounts.addError'))
    }
  }
})

/** Çift dokunuşta iki aynı hesap oluşmasın (bkz. guardSubmit). */
const saveAccount = guardSubmit(isSubmitting, submitAccount)

const handleIconPicker = (payload: { iconName: string, color: string }) => {
  selectedIconName.value = payload.iconName
  selectedColor.value = payload.color
}

onMounted(async () => {
  await currencyStore.loadCurrencies()
})
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/settings/accounts" :icon="chevronBackOutline"/>
        </ion-buttons>
        <ion-title class="font-semibold">{{ $t('accounts.new') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="form-content" :scroll-y="true">
      <div class="px-4 pt-3">
        <!-- Önizleme kartı -->
        <button
            type="button"
            class="w-full bg-surface rounded-2xl px-4 py-4 flex items-center gap-3 active:bg-surface-sunken transition text-left"
            @click="pickers.icon = true"
        >
          <span
              class="size-12 rounded-xl flex items-center justify-center shadow-sm shrink-0"
              :class="selectedColor"
          >
            <ion-icon :icon="getIconByName(selectedIconName)" class="size-6 text-white"/>
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

        <!-- Hesap tipi — MD3 segmented buttons -->
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

        <!-- Para birimi — MD3 picker alanı -->
        <picker-field
            :label="$t('accounts.currency')"
            :error="errors.currency"
            :empty="!selectedCurrency"
            @click="pickers.currency = true"
        >
          <template #start>
            <span
                slot="start"
                class="size-9 rounded-xl flex items-center justify-center shrink-0"
                :class="selectedCurrency ? 'bg-[var(--md-secondary-container)]' : 'bg-surface-sunken'"
            >
              <span
                  class="text-[14px] font-bold"
                  :class="selectedCurrency ? 'text-[var(--md-on-secondary-container)]' : 'text-content-faint'"
              >
                {{ selectedCurrency?.symbol || '$' }}
              </span>
            </span>
          </template>
          {{ selectedCurrency ? `${selectedCurrency.code} — ${currencyName(selectedCurrency)}` : $t('accounts.selectCurrency') }}
        </picker-field>

        <!-- Başlangıç bakiyesi — MD3 filled currency alanı.
             Kredi hesabında alan "mevcut borç"a dönüşür; girilen pozitif tutar
             kaydedilirken negatife çevrilir (bkz. signedBalance). -->
        <currency-input
            v-model="balance"
            :label="balanceLabel"
            :currency-code="selectedCurrency?.code as string"
            :symbol="selectedCurrency?.symbol"
            :minor-unit="selectedCurrency?.minorUnit"
            :error-text="errors.balance"
            :helper-text="isCreditAccount ? $t('accounts.currentDebtHelper') : ''"
        />

        <!-- Not — MD3 filled textarea -->
        <ion-textarea
            v-model="details"
            fill="solid"
            label-placement="floating"
            :label="$t('accounts.noteOptional')"
            :maxlength="150"
            :rows="3"
            :auto-grow="false"
            :placeholder="$t('accounts.notePlaceholder')"
            :error-text="errors.details"
            :class="{ 'ion-touched ion-invalid': errors.details }"
            @ion-change="detailsAttr.onChange"
            @ion-blur="detailsAttr.onBlur"
            @ion-input="detailsAttr.onInput"
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
        v-model:is-open="pickers.icon"
        :color="selectedColor"
        @select="handleIconPicker"
    />

    <!-- Para birimi picker -->
        <CurrencyPickerModal
            v-model:open="pickers.currency"
            v-model:selected-currency="selectedCurrency"
            :currencies="currencyStore.currencies"
            @select="onCurrencySelect"
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
  bottom: 20px;
  padding: 12px 16px calc(env(safe-area-inset-bottom) + 12px);
  z-index: 10;
}

ion-page {
  overflow: hidden;
}

.form-content ion-textarea :deep(textarea) {
  resize: none;
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
</style>
