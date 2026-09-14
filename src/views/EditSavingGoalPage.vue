<script lang="ts" setup>
import {
  IonPage, IonContent, IonIcon, IonInput, IonTextarea,
} from '@ionic/vue';
import {
  chevronBackOutline,
  lockClosedOutline,
} from 'ionicons/icons';
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useForm } from 'vee-validate';
import { updateSavingGoalSchema } from "@/forms";
import { useSavingGoalsStore } from "@/stores/saving-goals";
import { useCurrenciesStore } from "@/stores/currencies";
import { useToast } from "@/composables/ui/useToast";
import { guardSubmit } from "@/composables/ui/guard-submit";
import { logger } from "@/infrastructure/logging";
import { getIconByName } from "@/shared/utils";
import IconPickerModal from "@/components/IconPickerModal.vue";
import DateField from "@/components/DateField.vue";
import PickerField from "@/components/PickerField.vue";
import AmountCard from "@/components/AmountCard.vue";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const savingGoalStore = useSavingGoalsStore();
const currencyStore = useCurrenciesStore();
const toast = useToast();

const goalId = route.params.id as string;
const goalCurrencyId = ref('');

// Form — doğrulama kuralları @/forms/saving-goal.schema içinde.
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
const isSaving = ref(false);
const submitError = ref<string | null>(null);

// Modal state
const showIconPicker = ref(false);

const goalCurrency = computed(() => currencyStore.currencyById(goalCurrencyId.value));

const handleIconPicker = (payload: { iconName: string, color: string }) => {
  selectedIconName.value = payload.iconName;
  selectedColor.value = payload.color;
};

const submitGoal = handleSubmit(async (values) => {
  submitError.value = null;

  isSaving.value = true;
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

    toast.success(t('savingGoals.updatedSuccess'));
    router.back();
  } catch (err: unknown) {
    logger.error('Goal update error', { context: 'EditSavingGoal', error: err });
    submitError.value = err instanceof Error
        ? err.message
        : t('savingGoals.errors.update');
  } finally {
    isSaving.value = false;
  }
});

/** Çift dokunuşta aynı güncelleme iki kez uygulanmasın (bkz. guardSubmit). */
const saveGoal = guardSubmit(isSubmitting, submitGoal);

onMounted(async () => {
  await currencyStore.loadCurrencies();

  const goal = await savingGoalStore.getGoalById(goalId);
  if (!goal) {
    toast.error(t('savingGoals.notFound'));
    router.replace('/settings/savings');
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
    <ion-content class="form-content" :scroll-y="true">
      <div class="px-4 pt-[max(env(safe-area-inset-top),1rem)]">
        <header class="flex items-center justify-between pt-2 px-1">
          <button
              class="size-9 rounded-full flex items-center justify-center text-content-secondary active:bg-surface-strong transition"
              @click="router.back()"
              :aria-label="$t('common.back')"
          >
            <ion-icon :icon="chevronBackOutline" class="size-[20px]" />
          </button>
          <h1 class="text-[15px] font-semibold text-content">{{ $t('savingGoals.edit') }}</h1>
          <div class="size-9" />
        </header>

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
        <amount-card
            :label="$t('savingGoals.targetAmount')"
            v-model="targetAmount"
            :currency-code="goalCurrency?.code || 'TRY'"
            :error="errors.targetAmount"
        />

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

      <div class="save-bar">
        <p v-if="submitError" class="text-[12px] text-rose-600 dark:text-rose-400 text-center mb-2">{{ submitError }}</p>
        <button
            type="button"
            class="w-full h-12 rounded-2xl bg-indigo-600 text-white text-[15px] font-semibold active:bg-indigo-700 disabled:bg-slate-300 transition"
            :disabled="isSubmitting || isSaving"
            @click="saveGoal"
        >
          {{ isSubmitting || isSaving ? $t('savingGoals.updating') : $t('savingGoals.update') }}
        </button>
      </div>
    </ion-content>

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

ion-page {
  overflow: hidden;
}

.form-content ion-textarea :deep(textarea) {
  resize: none;
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

.save-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 16px calc(env(safe-area-inset-bottom) + 12px);
  background: linear-gradient(180deg, rgba(244, 244, 245, 0) 0%, #f4f4f5 30%);
  z-index: 10;
}
</style>
