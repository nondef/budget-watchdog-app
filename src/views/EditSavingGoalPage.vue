<script lang="ts" setup>
import {
  IonPage,
  IonContent,
  IonIcon,
  IonInput,
  IonTextarea,
  IonToolbar,
  IonButton,
  IonFooter
} from '@ionic/vue';
import { lockClosedOutline } from 'ionicons/icons';
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAppNavigation } from "@/composables/navigation/useAppNavigation";
import { useI18n } from 'vue-i18n';
import { useForm } from 'vee-validate';
import { updateSavingGoalSchema } from "@/forms";
import { useSavingGoalsStore } from "@/stores/saving-goals";
import { useCurrenciesStore } from "@/stores/currencies";
import { guardSubmit } from "@/composables/ui/guard-submit";
import { getIconByName } from "@/shared/utils";
import IconPickerModal from "@/components/IconPickerModal.vue";
import DateField from "@/components/DateField.vue";
import PickerField from "@/components/PickerField.vue";
import CurrencyInput from "@/components/CurrencyInput.vue";
import ErrorChip from "@/components/ErrorChip.vue";
import CollapseTransition from "@/components/CollapseTransition.vue";
import { useToast } from '@/composables/ui/useToast';
import { useErrorHandler } from "@/composables";
import SubPageHeader from "@/components/SubPageHeader.vue";

const { t } = useI18n();
const { ionRouter, goBackOrFallback } = useAppNavigation();
const { handle } = useErrorHandler()
const toast = useToast()
const route = useRoute();
const savingGoalStore = useSavingGoalsStore();
const currencyStore = useCurrenciesStore();

const goalId = route.params.id as string;
const goalCurrencyId = ref('');

const { handleSubmit, defineField, errors, resetForm, isSubmitting } = useForm({
  validationSchema: updateSavingGoalSchema(),
  initialValues: {
    name: '',
    targetAmount: 0,
    targetDate: null as string | null,
    description: '',
  }
});

const [goalName] = defineField('name');
const [targetAmount] = defineField('targetAmount');
const [targetDate] = defineField('targetDate');
const [goalNote] = defineField('description');

// İkon/renk doğrulanmıyor: her ikisinin de geçerli bir varsayılanı var.
const selectedIconName = ref<string>('walletOutline');
const selectedColor = ref<string>('bg-indigo-500');

// Modal state
const showIconPicker = ref(false);

const goalCurrency = computed(() => currencyStore.currencyById(goalCurrencyId.value));

const handleIconPicker = (payload: { iconName: string, color: string }) => {
  selectedIconName.value = payload.iconName;
  selectedColor.value = payload.color;
};

const submitGoal = handleSubmit(async (values) => {
  try {
    await savingGoalStore.updateGoal({
      id: goalId,
      name: values.name,
      targetAmount: values.targetAmount,
      targetDate: values.targetDate ? new Date(values.targetDate) : null,
      description: values.description?.trim() ?? '',
      icon: selectedIconName.value,
      iconColor: selectedColor.value,
    });

    toast.show(t('savingGoals.updatedSuccess'))

    goBackOrFallback('/settings/savings');
  } catch (err) {
    handle(err, {
      context: 'EditSavingGoal',
      fallback: t('savingGoals.errors.update'),
    })
  }
});

/** Çift dokunuşta aynı güncelleme iki kez uygulanmasın (bkz. guardSubmit). */
const saveGoal = guardSubmit(isSubmitting, submitGoal);

onMounted(async () => {
  await currencyStore.loadCurrencies();

  const goal = await savingGoalStore.getGoalById(goalId);
  if (!goal) {
    toast.show(t('savingGoals.notFound'))
    // Geçersiz id: sayfa geçmişte iz bırakmasın, geri tuşu buraya dönmesin.
    ionRouter.navigate('/settings/savings', 'back', 'replace');
    return;
  }

  selectedIconName.value = goal.icon?.name || 'walletOutline';
  selectedColor.value = goal.icon?.color || 'bg-indigo-500';
  goalCurrencyId.value = goal.targetAmount.currencyId;

  // `resetForm` yüklenen değerleri yeni "temiz" hal yapar: kullanıcı hiçbir şeye
  // dokunmadan kaydederse form kirli sayılmaz ve hata gösterilmez.
  resetForm({
    values: {
      name: goal.name,
      targetAmount: goal.targetAmount.amount,
      targetDate: goal.targetDate ? new Date(goal.targetDate).toISOString() : null,
      description: goal.description || '',
    }
  });
});
</script>

<template>
  <ion-page>
    <sub-page-header :title="$t('savingGoals.edit')" default-href="/settings/savings"/>

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

        <!-- Para birimi (kilitli) — MD3 picker alanı, readonly -->
        <picker-field :label="$t('savingGoals.currency')" readonly>
          <template #start>
            <span
                slot="start"
                class="size-9 rounded-xl bg-[var(--md-secondary-container)] flex items-center justify-center shrink-0"
            >
              <span class="text-[14px] font-bold text-[var(--md-on-secondary-container)]">
                {{ goalCurrency?.symbol || '$' }}
              </span>
            </span>
          </template>
          {{ goalCurrency ? `${goalCurrency.code} — ${goalCurrency.name}` : '—' }}
          <template #end>
            <ion-icon slot="end" :icon="lockClosedOutline" class="size-[14px] text-content-faint shrink-0" />
          </template>
        </picker-field>

        <!-- Hedef tutar -->
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
                :currency-code="goalCurrency?.code || 'TRY'"
                :minor-unit="goalCurrency?.minorUnit"
                :error-text="errors.targetAmount"
                class="w-full"
            />
            <span class="amount-currency-code">{{ goalCurrency?.code || 'TRY' }}</span>
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
        <ion-button
            expand="block"
            class="app-button"
            :disabled="isSubmitting"
            @click="saveGoal"
        >
          {{ isSubmitting ? $t('savingGoals.updating') : $t('savingGoals.update') }}
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

ion-item.plain-item {
  --background: transparent;
  --background-hover: transparent;
  --background-hover-opacity: 0;
  --background-activated: #f8fafc; /* slate-50 */
  --background-activated-opacity: 1;
  --padding-start: 1rem;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  --inner-padding-end: 1rem;
  --min-height: 0;
  --border-color: #f1f5f9; /* slate-100 */
  --color: inherit;
  --ripple-color: transparent;
  font-size: inherit;
}

ion-item.plain-item [slot="start"] {
  margin: 0 12px 0 0; /* gap-3 */
}

ion-item.plain-item [slot="end"] {
  margin: 0 0 0 12px; /* gap-3 */
}
</style>
