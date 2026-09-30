<script lang="ts" setup>
import {
  IonPage,
  IonContent,
  IonIcon,
  IonInput,
  IonTextarea,
  IonToolbar,
  IonFooter,
  IonButton
} from '@ionic/vue';
 'ionicons/icons';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppNavigation } from "@/composables/navigation/useAppNavigation";
import { useForm } from 'vee-validate';
import { createSavingGoalSchema } from "@/forms";
import { useSavingGoalsStore } from "@/stores/saving-goals";
import { useCurrenciesStore } from "@/stores/currencies";
import { useAccountsStore } from "@/stores/accounts";
import { logger } from "@/infrastructure/logging";
import { guardSubmit } from "@/composables/ui/guard-submit";
import { getIconByName } from "@/shared/utils";
import IconPickerModal from "@/components/IconPickerModal.vue";
import DateField from "@/components/DateField.vue";
import CurrencyInput from "@/components/CurrencyInput.vue";
import AccountCarousel from "@/components/AccountCarousel.vue";
import ErrorChip from "@/components/ErrorChip.vue";
import SubPageHeader from '@/components/SubPageHeader.vue';
import CollapseTransition from "@/components/CollapseTransition.vue";

const { t } = useI18n();
const { goBackOrFallback } = useAppNavigation();
const savingGoalStore = useSavingGoalsStore();
const currencyStore = useCurrenciesStore();
const accountStore = useAccountsStore();

// Form — doğrulama kuralları @/forms/saving-goal.schema içinde.
const { handleSubmit, defineField, errors, setFieldValue, isSubmitting } = useForm({
  validationSchema: createSavingGoalSchema(),
  initialValues: {
    name: '',
    accountId: '',
    initialAmount: 0,
    targetAmount: 0,
    targetDate: null as string | null,
    description: '',
  }
});

const [goalName] = defineField('name');
const [selectedAccountId] = defineField('accountId');
const [initialAmount] = defineField('initialAmount');
const [targetAmount] = defineField('targetAmount');
const [targetDate] = defineField('targetDate');
const [goalNote] = defineField('description');

// İkon/renk doğrulanmıyor: her ikisinin de geçerli bir varsayılanı var.
const selectedIconName = ref<string>('walletOutline');
const selectedColor = ref<string>('bg-indigo-500');
const isSaving = ref(false);
const submitError = ref<string | null>(null);

// Başlangıç tutarı hedefi aşamaz; hedef değişince o kuralı yeniden çalıştır ki
// kullanıcı hedefi yükselttiğinde eski hata ekranda asılı kalmasın.
watch(targetAmount, () => {
  if (errors.value.initialAmount) setFieldValue('initialAmount', initialAmount.value);
});

// Modal state
const showIconPicker = ref(false);

// Fon hesabı hedefin para birimini belirler: para ekleme/çekme bu hesaptan
// yürüdüğü için para birimi hesaptan türetilir, ayrı seçilmez.
const selectedAccount = computed(() =>
    accountStore.accounts.find(a => a.id === selectedAccountId.value) ?? null
);

const selectedCurrency = computed(() =>
    currencyStore.currencyById(selectedAccount.value?.balance.currencyId) ?? null
);

const handleIconPicker = (payload: { iconName: string, color: string }) => {
  selectedIconName.value = payload.iconName;
  selectedColor.value = payload.color;
};

const submitGoal = handleSubmit(async (values) => {
  submitError.value = null;

  // Şema hesabın SEÇİLDİĞİNİ doğrular; hâlâ var olduğunu store söyler.
  const account = accountStore.accounts.find(a => a.id === values.accountId);
  if (!account) { submitError.value = t('savingGoals.validation.accountRequired'); return; }

  isSaving.value = true;
  try {
    await savingGoalStore.addGoal({
      name: values.name,
      targetAmount: values.targetAmount,
      currencyId: account.balance.currencyId,
      accountId: account.id,
      targetDate: values.targetDate ? new Date(values.targetDate) : undefined,
      icon: selectedIconName.value,
      iconColor: selectedColor.value,
      description: values.description?.trim() || undefined,
      initialAmount: values.initialAmount,
    });

    goBackOrFallback('/settings/savings');

  } catch (err: unknown) {
    logger.error('Goal save error', { context: 'NewSavingGoal', error: err });
    submitError.value = err instanceof Error
        ? err.message
        : t('savingGoals.errors.add');
  } finally {
    isSaving.value = false;
  }
});

/** Çift dokunuşta iki aynı hedef oluşmasın (bkz. guardSubmit). */
const saveGoal = guardSubmit(isSubmitting, submitGoal);

onMounted(async () => {
  await Promise.all([
    currencyStore.loadCurrencies(),
    accountStore.loadAccounts(),
  ]);

  const firstActive = accountStore.accounts.find(a => a.isActive) ?? accountStore.accounts[0];
  if (!selectedAccountId.value && firstActive) {
    setFieldValue('accountId', firstActive.id);
  }
});
</script>

<template>
  <ion-page>
    <sub-page-header :title="$t('savingGoals.new')" default-href="/settings/savings"/>

    <ion-content :scroll-y="true">
      <div class="px-4">
        <!-- Hero: ikon -->
        <section class="mt-6 flex flex-col items-center">
          <button
              type="button"
              class="size-20 rounded-3xl flex items-center justify-center shadow-md active:scale-95 transition"
              :class="selectedColor"
              @click="showIconPicker = true"
              :aria-label="$t('savingGoals.pickIcon')"
          >
            <ion-icon :icon="getIconByName(selectedIconName)" class="size-9 text-white" />
          </button>
          <p class="mt-2 text-[11px] text-content-muted">{{ $t('savingGoals.tapToChangeIcon') }}</p>
        </section>
      </div>

      <div class="mt-5 px-4 pb-32 space-y-3">

        <!-- Hedef adı — MD3 filled text field -->
        <ion-input
            v-model="goalName"
            fill="solid"
            label-placement="floating"
            :label="$t('savingGoals.nameLabel')"
            :placeholder="$t('savingGoals.namePlaceholder')"
            :error-text="errors.name"
            :class="{ 'ion-touched ion-invalid': errors.name }"
        />

        <!-- Fon hesabı — para ekleme/çekme bu hesaptan yürür -->
        <AccountCarousel
            v-if="accountStore.accounts.length"
            :accounts="accountStore.accounts"
            :label="$t('savingGoals.account')"
            v-model="selectedAccountId"
        />

        <collapse-transition>
          <p v-if="errors.accountId" class="field-error text-[11px] text-rose-600 px-1">
            {{ errors.accountId }}
          </p>
        </collapse-transition>

        <p class="px-1 text-[11px] text-content-muted">
          {{ $t('savingGoals.accountHint') }}
        </p>

        <!-- Tutarlar -->
        <section>
          <p class="text-center text-[13px] font-medium uppercase tracking-wider text-content-muted mb-2">
            {{ $t('savingGoals.initialAmount') }}
          </p>
          <div
              class="amount-card relative flex items-center justify-center rounded-2xl border border-line bg-surface px-3"
              :class="{ 'amount-card-error': errors.initialAmount }"
          >
            <CurrencyInput
                v-model="initialAmount"
                variant="plain"
                hide-currency
                :label="$t('savingGoals.initialAmount')"
                :currency-code="selectedCurrency?.code || 'TRY'"
                :minor-unit="selectedCurrency?.minorUnit"
                :error-text="errors.initialAmount"
                class="w-full"
            />
            <span class="amount-currency-code">{{ selectedCurrency?.code || 'TRY' }}</span>
          </div>
          <collapse-transition>
            <div v-if="errors.initialAmount" class="mt-2 flex justify-center">
              <ErrorChip :message="errors.initialAmount" />
            </div>
          </collapse-transition>
        </section>

        <section>
          <p class="text-center text-[13px] font-medium uppercase tracking-wider text-content-muted mb-2">
            {{ $t('savingGoals.targetAmount') }}
          </p>
          <div
              class="amount-card relative flex items-center justify-center rounded-2xl border border-line bg-surface px-3"
              :class="{ 'amount-card-error': errors.targetAmount }"
          >
            <CurrencyInput
                v-model="targetAmount"
                variant="plain"
                hide-currency
                :label="$t('savingGoals.targetAmount')"
                :currency-code="selectedCurrency?.code || 'TRY'"
                :minor-unit="selectedCurrency?.minorUnit"
                :error-text="errors.targetAmount"
                class="w-full"
            />
            <span class="amount-currency-code">{{ selectedCurrency?.code || 'TRY' }}</span>
          </div>
          <collapse-transition>
            <div v-if="errors.targetAmount" class="mt-2 flex justify-center">
              <ErrorChip :message="errors.targetAmount" />
            </div>
          </collapse-transition>
        </section>

        <!-- Tarih -->
        <DateField
            v-model="targetDate"
            :label="$t('savingGoals.targetDate')"
            :error="errors.targetDate"
            icon-box-class="bg-amber-50 dark:bg-amber-500/15"
            icon-class="text-amber-600 dark:text-amber-400"
        />

        <!-- Not — MD3 filled textarea -->
        <ion-textarea
            v-model="goalNote"
            fill="solid"
            label-placement="floating"
            :label="$t('savingGoals.noteOptional')"
            :maxlength="150"
            :counter="true"
            :rows="3"
            :auto-grow="false"
            :placeholder="$t('savingGoals.notePlaceholder')"
            :error-text="errors.description"
            :class="{ 'ion-touched ion-invalid': errors.description }"
        />
      </div>
    </ion-content>

    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <collapse-transition>
          <div v-if="submitError" class="flex justify-center mb-2">
            <ErrorChip :message="submitError" />
          </div>
        </collapse-transition>
        <ion-button
            expand="block"
            class="app-button"
            :disabled="isSubmitting || isSaving"
            @click="saveGoal"
        >
          {{ isSubmitting || isSaving ? $t('savingGoals.saving') : $t('savingGoals.save') }}
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
.amount-card {
  transition: border-color 150ms ease;
}

.amount-card.amount-card-error {
  border-color: color-mix(in srgb, var(--c-error) 60%, var(--c-line));
}
</style>
