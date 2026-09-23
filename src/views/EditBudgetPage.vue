<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  IonPage, IonContent, IonIcon, IonAlert, IonInput, IonTextarea,
  IonToggle, IonChip, IonButton, IonProgressBar,
} from "@ionic/vue";
import {
  chevronBackOutline,
  closeOutline,
  notificationsOutline,
  addOutline,
  removeOutline,
} from "ionicons/icons";
import { useBudgetStore } from "@/stores/budgets";
import { useAccountsStore } from "@/stores/accounts";
import { useCategoriesStore } from '@/stores/categories';
import { useCurrenciesStore } from '@/stores/currencies';
import { useForm } from "vee-validate";
import { createBudgetSchema } from "@/forms";
import { CategoryDTO } from "@/application";
import type { BudgetType } from "@/domain/entities/budget";
import IconPickerModal from "@/components/IconPickerModal.vue";
import BudgetTypeSegment from "@/components/BudgetTypeSegment.vue";
import AccountField from "@/components/AccountField.vue";
import DateField from "@/components/DateField.vue";
import SheetModal from "@/components/SheetModal.vue";
import { useToast } from "@/composables/ui/useToast";
import { guardSubmit } from "@/composables/ui/guard-submit";
import { useCategoryName } from "@/composables/features/useCategoryName";
import { getIconByName } from "@/shared/utils";
import AmountCard from "@/components/AmountCard.vue";
import { useAppNavigation } from "@/composables/navigation/useAppNavigation";

const { ionRouter, goBackOrFallback } = useAppNavigation()
const route = useRoute()
const { t } = useI18n()
const toast = useToast()
const budgetStore = useBudgetStore();
const accountsStore = useAccountsStore();
const categoriesStore = useCategoriesStore();
const currenciesStore = useCurrenciesStore();
const { categoryName } = useCategoryName();

const budgetId = route.params.id as string

const schema = createBudgetSchema()

const { values, handleSubmit, setFieldValue, errors, resetForm, defineField, isSubmitting } = useForm({
  initialValues: {
    name: '',
    type: 'monthly',
    account: '',
    startDate: new Date().toISOString(),
    endDate: null as string | null,
    amount: 0,
    icon: '',
    iconColor: '',
    category: [] as string[],
    enableNotification: false,
    warningPercentage: 80,
    note: ''
  },
  validationSchema: schema
})

const [type] = defineField('type')
const [account] = defineField('account')
const [startDate] = defineField('startDate')
const [endDate] = defineField('endDate')

const showIconPicker = ref(false)
const showCategoryPicker = ref(false)
const selectedColor = ref('bg-indigo-500')
const selectedIconName = ref('walletOutline')
const selectedCategories = ref<CategoryDTO[]>([])
const showRemoveCategoryAlert = ref(false)
const categoryToRemove = ref<CategoryDTO | null>(null)
const isSaving = ref(false)

const selectedCategoryIds = computed(() =>
    new Set(selectedCategories.value.map(c => c.id))
)

const selectedAccount = computed(() =>
    accountsStore.accounts.find(a => a.id === values.account) ?? null
)

const currencyCode = computed(() =>
    currenciesStore.currencyById(selectedAccount.value?.balance.currencyId)?.code ?? ''
)
const currencyMinorUnit = computed(() =>
    currenciesStore.currencyById(selectedAccount.value?.balance.currencyId)?.minorUnit
)

const handleCategorySelection = (category: CategoryDTO) => {
  if (selectedCategoryIds.value.has(category.id)) {
    selectedCategories.value = selectedCategories.value.filter(c => c.id !== category.id)
  } else {
    selectedCategories.value.push(category)
  }
  setFieldValue('category', selectedCategories.value.map(c => c.id))
}

const removeCategory = (category: CategoryDTO) => {
  categoryToRemove.value = category
  showRemoveCategoryAlert.value = true
}

const alertButtons = [
  { text: t('common.cancel'), role: 'cancel' },
  {
    text: t('budgets.remove'),
    role: 'confirm',
    handler: () => {
      if (categoryToRemove.value) {
        selectedCategories.value = selectedCategories.value.filter(c => c.id !== categoryToRemove.value!.id)
        setFieldValue('category', selectedCategories.value.map(c => c.id))
        categoryToRemove.value = null
      }
    },
  },
]

watch(() => values.type, (newType, oldType) => {
  if (oldType !== undefined && newType !== 'once') {
    setFieldValue('endDate', null)
  }
})

const adjustWarning = (delta: number) => {
  const next = Math.max(10, Math.min(100, (values.warningPercentage ?? 80) + delta))
  setFieldValue('warningPercentage', next)
}

const submitBudget = handleSubmit(async (values) => {
  isSaving.value = true
  try {
    await budgetStore.updateBudget({
      id: budgetId,
      name: values.name,
      amount: values.amount,
      // Para birimi bütçenin hesabına bağlı ve değiştirilemiyor; gönderilen
      // `currencyId` zaten use-case tarafından yok sayılıyordu.
      type: values.type as BudgetType,
      categoryIds: values.category,
      accountId: values.account,
      startDate: new Date(values.startDate),
      endDate: values.type === 'once' && values.endDate ? new Date(values.endDate) : undefined,
      enableNotifications: values.enableNotification,
      warningPercentage: values.warningPercentage,
      icon: { name: selectedIconName.value, color: selectedColor.value },
      note: values.note,
    })

    goBackOrFallback('/settings/budget-goals')
  } catch (e) {
    toast.error(t('budgets.updateError'))
  } finally {
    isSaving.value = false
  }
})

/**
 * `isSaving` yalnızca doğrulama BİTTİKTEN sonra kalkıyor; o pencerede gelen
 * ikinci dokunuş güncellemeyi iki kez uyguluyordu (bkz. guardSubmit).
 */
const saveBudget = guardSubmit(isSubmitting, submitBudget)

const handleIconPicker = (payload: { iconName: string, color: string }) => {
  selectedIconName.value = payload.iconName
  selectedColor.value = payload.color
}

onMounted(async () => {
  try {
    await Promise.all([
      categoriesStore.loadCategories(),
      accountsStore.loadAccounts()
    ])

    const result = await budgetStore.getBudgetById(budgetId)
    if (!result) {
      toast.error(t('budgets.notFound'))
      // Geçersiz id: sayfa geçmişte iz bırakmasın, geri tuşu buraya dönmesin.
      ionRouter.navigate('/settings/budget-goals', 'back', 'replace')
      return
    }

    resetForm({
      values: {
        name: result.name,
        type: result.type,
        account: result.accountId,
        startDate: new Date(result.startDate).toISOString(),
        endDate: result.endDate ? new Date(result.endDate).toISOString() : null,
        icon: result.icon.name,
        iconColor: result.icon.color,
        amount: result.amount.amount,
        category: result.categoryIds,
        enableNotification: result.enableNotifications,
        warningPercentage: result.warningPercentage,
        note: result.note,
      }
    })

    selectedIconName.value = result.icon.name
    selectedColor.value = result.icon.color

    selectedCategories.value = result.categoryIds
        .map(id => categoriesStore.categoryById(id))
        .filter(Boolean) as CategoryDTO[]
  } catch (e) {
    toast.error(t('budgets.loadError'))
  }
})
</script>

<template>
  <ion-page class="design-page">
    <ion-content class="form-content" :scroll-y="true">
      <div class="px-4 pt-[max(env(safe-area-inset-top),1rem)]">
        <!-- Üst bar -->
        <header class="flex items-center justify-between pt-2 px-1">
          <button
              class="size-9 rounded-full flex items-center justify-center text-content-secondary active:bg-surface-strong transition"
              @click="goBackOrFallback('/settings/budget-goals')"
              :aria-label="$t('common.back')"
          >
            <ion-icon :icon="chevronBackOutline" class="size-[20px]" />
          </button>
          <h1 class="text-[15px] font-semibold text-content">{{ $t('budgets.edit') }}</h1>
          <div class="size-9" />
        </header>

        <!-- Hero: ikon -->
        <section class="mt-6 flex flex-col items-center">
          <button
              type="button"
              class="size-20 rounded-3xl flex items-center justify-center shadow-md active:scale-95 transition"
              :class="selectedColor"
              @click="showIconPicker = true"
              :aria-label="$t('budgets.pickIcon')"
          >
            <ion-icon :icon="getIconByName(selectedIconName)" class="size-9 text-white" />
          </button>
          <p class="mt-2 text-[11px] text-content-muted">{{ $t('budgets.tapToChangeIcon') }}</p>
        </section>
      </div>

      <!-- Form alanları -->
      <div class="mt-5 px-4 pb-32 space-y-3">

        <!-- Bütçe adı — MD3 filled text field -->
        <ion-input
            v-model="values.name"
            fill="solid"
            label-placement="floating"
            :label="$t('budgets.nameLabel')"
            :placeholder="$t('budgets.namePlaceholder')"
            :error-text="errors.name"
            :class="{ 'ion-touched ion-invalid': errors.name }"
        />

        <!-- Tür -->
        <section class="bg-surface rounded-2xl px-4 py-4">
          <p class="text-[12px] font-semibold text-content mb-3">{{ $t('budgets.type') }}</p>
          <BudgetTypeSegment v-model="type"/>
        </section>

        <!-- Hesap -->
        <AccountField v-model="account" :accounts="accountsStore.accounts" :error="errors.account"/>

        <!-- Tarih -->
        <DateField
            v-model="startDate"
            :label="$t('budgets.startLabel')"
        />

        <DateField
            v-if="values.type === 'once'"
            v-model="endDate"
            :label="$t('budgets.endLabel')"
            :placeholder="$t('budgets.endPlaceholder')"
        />

        <!-- Tutar -->
        <amount-card
            :label="$t('budgets.amountLabel')"
            v-model="values.amount"
            :currency-code="currencyCode || 'TRY'"
            :minor-unit="currencyMinorUnit"
            :error="errors.amount"
        />

        <!-- Kategoriler -->
        <div>
          <section
              class="bg-surface rounded-2xl px-4 py-4"
              :class="{ 'ring-1 ring-rose-600': errors.category }"
          >
            <div class="flex items-center justify-between mb-3">
              <p class="text-[12px] font-semibold text-content">{{ $t('budgets.categories') }}</p>
              <ion-chip class="add-chip" @click="showCategoryPicker = true">
                <ion-icon :icon="addOutline" class="size-3.5" />
                {{ $t('common.add') }}
              </ion-chip>
            </div>

            <div v-if="selectedCategories.length" class="flex flex-wrap gap-1.5">
              <ion-chip
                  v-for="cat in selectedCategories"
                  :key="cat.id"
                  class="cat-chip"
                  @click="removeCategory(cat)"
              >
                <div
                    class="size-6 rounded-full flex items-center justify-center text-white"
                    :class="cat.icon.color"
                >
                  <ion-icon :icon="getIconByName(cat.icon.name)" class="size-[12px]" />
                </div>
                <span class="text-[12px] text-content-secondary">{{ categoryName(cat.name) }}</span>
                <ion-icon :icon="closeOutline" class="size-3 text-slate-400" />
              </ion-chip>
            </div>
            <p v-else class="text-[12px] text-slate-400">{{ $t('budgets.noCategory') }}</p>
          </section>
          <p v-if="errors.category" class="field-error text-[11px] text-rose-600 mt-1.5 px-1">{{ errors.category }}</p>
        </div>

        <!-- Bildirim -->
        <section class="bg-surface rounded-2xl px-4 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="size-9 rounded-xl bg-amber-50 flex items-center justify-center">
                <ion-icon :icon="notificationsOutline" class="size-[16px] text-amber-600" />
              </div>
              <div>
                <p class="text-[14px] font-medium text-content">{{ $t('budgets.notifications') }}</p>
                <p class="text-[11px] text-content-muted mt-0.5">{{ $t('budgets.notificationsDesc') }}</p>
              </div>
            </div>
            <ion-toggle
                class="plain-toggle shrink-0"
                :checked="values.enableNotification"
                :aria-label="$t('budgets.notifications')"
                @ionChange="setFieldValue('enableNotification', $event.detail.checked)"
            />
          </div>

          <div v-if="values.enableNotification" class="mt-3 pt-3 border-t border-line">
            <div class="flex items-center justify-between mb-2">
              <span class="text-[12px] text-content-tertiary">{{ $t('budgets.warningThreshold') }}</span>
              <span class="text-[15px] font-bold text-indigo-700 tabular-nums">
                %{{ values.warningPercentage }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <ion-button
                  class="step-btn"
                  :disabled="(values.warningPercentage ?? 0) <= 10"
                  @click="adjustWarning(-10)"
              >
                <ion-icon slot="icon-only" :icon="removeOutline" class="size-[14px]" />
              </ion-button>
              <ion-progress-bar
                  class="plain-progress flex-1"
                  :value="(values.warningPercentage ?? 0) / 100"
              />
              <ion-button
                  class="step-btn"
                  :disabled="(values.warningPercentage ?? 0) >= 100"
                  @click="adjustWarning(10)"
              >
                <ion-icon slot="icon-only" :icon="addOutline" class="size-[14px]" />
              </ion-button>
            </div>
          </div>
        </section>

        <!-- Not — MD3 filled textarea -->
        <ion-textarea
            v-model="values.note"
            fill="solid"
            label-placement="floating"
            :label="$t('budgets.noteOptional')"
            :maxlength="150"
            :counter="true"
            :rows="3"
            :auto-grow="false"
            :placeholder="$t('budgets.notePlaceholder')"
        />
      </div>

      <!-- Sticky save -->
      <div class="save-bar">
        <button
            type="button"
            class="w-full h-12 rounded-2xl bg-indigo-600 text-white text-[15px] font-semibold active:bg-indigo-700 disabled:bg-slate-300 transition"
            :disabled="isSubmitting || isSaving"
            @click="saveBudget"
        >
          {{ isSubmitting || isSaving ? $t('budgets.updating') : $t('budgets.update') }}
        </button>
      </div>
    </ion-content>

    <IconPickerModal
        :icon-name="selectedIconName"
        v-model:is-open="showIconPicker"
        :color="selectedColor"
        @select="handleIconPicker"
    />

    <!-- Kategori modal -->
    <SheetModal :is-open="showCategoryPicker" :title="$t('budgets.pickCategory')" @dismiss="showCategoryPicker = false">
      <div class="grid grid-cols-4 gap-2">
        <button
            v-for="cat in categoriesStore.expenseCategories"
            :key="cat.id"
            type="button"
            class="sheet-option flex flex-col items-center gap-1.5 py-3 rounded-xl transition"
            :class="{ 'is-selected': selectedCategoryIds.has(cat.id) }"
            @click="handleCategorySelection(cat)"
        >
          <div
              class="size-11 rounded-2xl flex items-center justify-center text-white"
              :class="cat.icon.color"
          >
            <ion-icon :icon="getIconByName(cat.icon.name)" class="size-5" />
          </div>
          <span class="text-[10px] font-medium text-content-secondary text-center leading-tight px-1">
            {{ categoryName(cat.name) }}
          </span>
        </button>
      </div>
    </SheetModal>

    <ion-alert
        :is-open="showRemoveCategoryAlert"
        :header="$t('budgets.removeCategory')"
        :message="categoryToRemove?.name ? $t('budgets.removeCategoryConfirm', { name: categoryName(categoryToRemove.name) }) : ''"
        :buttons="alertButtons"
        @did-dismiss="showRemoveCategoryAlert = false"
    />
  </ion-page>
</template>

<style scoped>
.form-content {
  --background: var(--c-page);
}

.form-content ion-textarea :deep(textarea) {
  resize: none;
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

ion-page {
  overflow: hidden;
}
</style>
