<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  IonPage,
  IonContent,
  IonIcon,
  IonAlert,
  IonInput,
  IonTextarea,
  IonToggle,
  IonChip,
  IonButton,
  IonProgressBar,
  IonToolbar,
  IonHeader,
  IonBackButton,
  IonTitle,
  IonButtons,
  IonFooter,
  IonModal,
  IonList,
  IonItem,
  IonLabel,
} from "@ionic/vue";
import {
  chevronBackOutline,
  closeOutline,
  notificationsOutline,
  addOutline,
  removeOutline
} from "ionicons/icons";
import { useBudgetStore } from "@/stores/budgets";
import { useAccountsStore } from "@/stores/accounts";
import { useCategoriesStore } from '@/stores/categories';
import { useCurrenciesStore } from '@/stores/currencies';
import { useAppStore } from "@/stores/app";
import { useForm } from "vee-validate";
import { createBudgetSchema } from "@/forms";
import { AccountDTO, CategoryDTO } from "@/application";
import IconPickerModal from "@/components/IconPickerModal.vue";
import BudgetTypeSegment from "@/components/BudgetTypeSegment.vue";
import DateField from "@/components/DateField.vue";
import { useToast } from "@/composables/ui/useToast";
import { guardSubmit } from "@/composables/ui/guard-submit";
import { useCategoryName } from "@/composables/features/useCategoryName";
import { getIconByName } from "@/shared/utils";
import PickerField from "@/components/PickerField.vue";
import CurrencyInput from "@/components/CurrencyInput.vue";
import CategoryPickerModal from "@/components/CategoryPickerModal.vue";
import { BudgetType } from "@/domain";

const router = useRouter();
const toast = useToast()
const { t } = useI18n()
const budgetStore = useBudgetStore();
const accountsStore = useAccountsStore();
const categoriesStore = useCategoriesStore();
const currenciesStore = useCurrenciesStore();
const appStore = useAppStore();
const { categoryName } = useCategoryName();

const schema = createBudgetSchema()

const { values, handleSubmit, setFieldValue, errors, defineField, resetForm, isSubmitting } = useForm({
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

const [name] = defineField('name')
const [amount] = defineField('amount')
const [type] = defineField('type')
const [startDate] = defineField('startDate')
const [endDate] = defineField('endDate')
// Kategori alanını da kayıtlı tut: değer model üzerinden güncellenince
// vee-validate otomatik doğrular ve hata anında temizlenir.
const [categoryIds] = defineField('category')

const showIconPicker = ref(false)
const showCategoryPicker = ref(false)
const showAccountPicker = ref(false)
const selectedColor = ref('bg-indigo-500')
const selectedIconName = ref('walletOutline')
const selectedAccount = ref<AccountDTO | null>(null)
const selectedCategories = ref<CategoryDTO[]>([])
const showRemoveCategoryAlert = ref(false)
const categoryToRemove = ref<CategoryDTO | null>(null)
const isSaving = ref(false)

// const selectedCategoryIds = computed(() =>
//     new Set(selectedCategories.value.map(c => c.id))
// )

// const selectedAccount = computed(() =>
//     accountsStore.accounts.find(a => a.id === values.account) ?? null
// )

// Hesap seçilmemişken para birimi boş kalmasın diye base currency'ye düş.
const currency = computed(() =>
    currenciesStore.currencyById(selectedAccount.value?.balance.currencyId)
    ?? appStore.baseCurrency
    ?? undefined
)

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
        categoryIds.value = selectedCategories.value.map(c => c.id)
        categoryToRemove.value = null
      }
    },
  },
]

watch(() => values.type, (newType) => {
  if (newType !== 'once') {
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
    await budgetStore.addBudget({
      name: values.name,
      amount: values.amount,
      type: values.type as BudgetType,
      categoryIds: values.category,
      currencyId: selectedAccount.value?.balance.currencyId as string,
      accountId: values.account,
      startDate: new Date(values.startDate),
      endDate: values.type === 'once' && values.endDate ? new Date(values.endDate) : undefined,
      enableNotifications: values.enableNotification,
      warningPercentage: values.warningPercentage,
      icon: { name: selectedIconName.value, color: selectedColor.value },
      note: values.note,
    })

    resetForm()

    router.push('/budgets')
  } catch (e) {
    toast.error(t('budgets.addError'))
  } finally {
    isSaving.value = false
  }
})

/**
 * `isSaving` yalnızca doğrulama BİTTİKTEN sonra true oluyor; bu pencerede gelen
 * ikinci dokunuş ikinci bir bütçe yaratıyordu. `isSubmitting` tıklama anında
 * senkron olarak kalkar (bkz. guardSubmit).
 */
const saveBudget = guardSubmit(isSubmitting, submitBudget)

const handleIconPicker = (payload: { iconName: string, color: string }) => {
  selectedIconName.value = payload.iconName
  selectedColor.value = payload.color
}

const selectAccount = (account: AccountDTO) => {
  selectedAccount.value = account
  // vee-validate alanını da güncelle: yoksa "Hesap seçimi zorunludur" hatası
  // kalkmaz ve kaydederken accountId boş gider.
  setFieldValue('account', account.id)
  showAccountPicker.value = false
}

// Modal tek/çoklu seçimi aynı olayla yayıyor; burada çoklu seçim kullanılıyor.
const onCategoriesSelected = (payload: string | string[]) => {
  const ids = Array.isArray(payload) ? payload : [payload]

  categoryIds.value = ids
  selectedCategories.value = categoriesStore.expenseCategories.filter(c => ids.includes(c.id))
}

onMounted(async () => {
  await Promise.all([
    categoriesStore.loadCategories(),
    accountsStore.loadAccounts()
  ])
})
</script>

<template>
  <ion-page>
    <!-- Üst bar -->
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-buttons slot="start">
          <ion-back-button default-href="/settings/budgets" :icon="chevronBackOutline"/>
        </ion-buttons>

        <ion-title class="text-xl font-semibold">
          {{ $t('budgets.new') }}
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="form-content" :scroll-y="true">
      <div class="px-4">
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
            v-model="name"
            fill="solid"
            label-placement="floating"
            :label="$t('budgets.nameLabel')"
            :placeholder="$t('budgets.namePlaceholder')"
            :error-text="errors.name"
            :class="{ 'ion-touched ion-invalid': errors.name }"
        />

        <!-- Bütçe tutarı — MD3 filled currency alanı -->
        <currency-input
            v-model="amount"
            :label="$t('budgets.amountLabel')"
            :currency-code="currency?.code || 'TRY'"
            :symbol="currency?.symbol"
            :error-text="errors.amount"
        />

        <!-- Tür -->
        <section class="bg-surface rounded-2xl px-4 py-4">
          <p class="text-[12px] font-semibold text-content mb-3">{{ $t('budgets.type') }}</p>
          <BudgetTypeSegment v-model="type"/>
          <p v-if="errors.type" class="field-error text-[11px] text-rose-600 mt-2">{{ errors.type }}</p>
        </section>

        <!-- Hesap -->
<!--        <AccountField v-model="account" :accounts="accountsStore.accounts" :error="errors.account"/>-->

        <picker-field
            :label="t('common.account')"
            :error="errors.account"
            :empty="!selectedAccount"
            @click="showAccountPicker = true"
        >
          <template #start>
            <div
                slot="start"
                class="size-9 rounded-xl flex items-center justify-center text-white shrink-0"
                :class="selectedAccount?.icon.color || 'bg-surface-strong'"
            >
              <ion-icon :icon="getIconByName(selectedAccount?.icon.name || 'walletOutline')" class="size-[16px]"/>
            </div>
          </template>
          {{ selectedAccount?.name || $t('accounts.selectAccount') }}
        </picker-field>

        <!-- Tarih -->
        <DateField
            v-model="startDate"
            :label="$t('budgets.startLabel')"
            :error="errors.startDate"
        />

        <DateField
            v-if="values.type === 'once'"
            v-model="endDate"
            :label="$t('budgets.endLabel')"
            :placeholder="$t('budgets.endPlaceholder')"
            :error="errors.endDate"
        />

        <!-- Kategoriler -->
        <div>
          <section
              class="bg-surface rounded-2xl px-4 py-4"
              :class="{ 'ring-1 ring-rose-600': errors.category }"
          >
            <div class="flex items-center justify-between mb-3">
              <p class="text-[12px] font-semibold text-content">{{ $t('budgets.categories') }}</p>
              <ion-chip class="m-0 h-7 min-h-7 py-0 px-[10px] text-[11px] font-semibold" @click="showCategoryPicker = true">
                <ion-icon :icon="addOutline" class="size-4" />
                <ion-label>{{ $t('common.add') }}</ion-label>
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
              <div class="size-9 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                <ion-icon :icon="notificationsOutline" class="size-[16px] text-amber-600 dark:text-amber-400" />
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
                {{ $t('common.percentValue', { value: values.warningPercentage }) }}
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
    </ion-content>

    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <ion-button
            expand="block"
            class="app-button"
            :disabled="isSubmitting || isSaving"
            @click="saveBudget"
        >
          {{ isSubmitting || isSaving ? $t('budgets.saving') : $t('budgets.save') }}
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

    <!-- Account Modal -->
    <ion-modal :is-open="showAccountPicker" class="account-picker-modal" @dismiss="showAccountPicker = false">
      <ion-header class="ion-no-border">
        <ion-toolbar>
          <ion-title>{{ $t('accounts.pickAccount') }}</ion-title>

          <ion-buttons slot="end">
            <ion-button @click="showAccountPicker = false">
              <ion-icon :icon="closeOutline"/>
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content>
        <ion-list inset class="category-list">
          <ion-item
              v-for="account in accountsStore.accounts"
              :key="account.id"
              class="category-item"
              button
              :detail="false"
              lines="none"
              :class="{ 'is-selected': selectedAccount?.id === account.id }"
              @click="selectAccount(account)"
          >
            <span
                slot="start"
                class="size-10 rounded-2xl flex items-center justify-center text-white shrink-0"
                :class="account.icon.color"
            >
              <ion-icon :icon="getIconByName(account.icon.name)" class="size-[18px]"/>
            </span>
            <ion-label class="text-[15px] font-medium">{{ account.name }}</ion-label>
<!--            <ion-icon
                v-if="selectedCategoryIds.has(account.id)"
                slot="end"
                :icon="checkmarkOutline"
                class="size-5 text-indigo-600 shrink-0"
            />-->
          </ion-item>
        </ion-list>
      </ion-content>

      <ion-footer>
        <ion-toolbar>
          <ion-button
              expand="block"
              class="app-button"
              @click="showAccountPicker = false"
          >
            {{ $t('common.close') }}
          </ion-button>
        </ion-toolbar>
      </ion-footer>
    </ion-modal>

    <!-- Kategori modal -->
    <CategoryPickerModal multi-select
                         v-model:isOpen="showCategoryPicker"
                         :categories="categoriesStore.expenseCategories"
                         :selected-ids="categoryIds"
                         @select="onCategoriesSelected"
    />

    <ion-alert
        :is-open="showRemoveCategoryAlert"
        :header="$t('budgets.removeCategory')"
        :message="categoryToRemove?.name ? $t('budgets.removeCategoryConfirm', { name: categoryName(categoryToRemove.name) }) : ''"
        :buttons="alertButtons"
        @did-dismiss="showRemoveCategoryAlert = false"
    />
  </ion-page>
</template>

<style>
/* Hesap seçici modal — IconPicker/CurrencyPicker/CategoryPicker ile aynı yüzey
   dili. Modal teleport edildiği için bu blok global. */
ion-modal.account-picker-modal {
  --background: var(--md-surface-container-high);
}
ion-modal.account-picker-modal::part(content) {
  background: var(--md-surface-container-high);
}
ion-modal.account-picker-modal ion-content {
  --background: var(--md-surface-container-high) !important;
}
ion-modal.account-picker-modal ion-header ion-toolbar,
ion-modal.account-picker-modal ion-footer ion-toolbar {
  --background: var(--md-surface-container-high) !important;
  --color: var(--c-content);
  --border-color: transparent;
}

ion-modal.account-picker-modal ion-list.category-list {
  background: transparent;
}

/* Liste satırı: modal zemininden ayrılan kart + hairline halka. Light'ta kağıt
   tonu, dark'ta elevated (eski --c-surface dark modda modal zemini ile aynı
   tondu ve satırlar kayboluyordu). */
ion-modal.account-picker-modal .category-item {
  --background: var(--md-surface-container-lowest) !important;
  --background-hover: var(--md-surface-container-highest) !important;
  --background-activated: var(--md-surface-container-highest) !important;
  --background-focused: var(--md-surface-container-highest) !important;
  --color: var(--c-content) !important;
  --border-radius: 16px;
  --padding-top: 5px;
  --padding-bottom: 5px;
  --padding-start: 14px;
  --inner-padding-end: 14px;
  --min-height: 60px;
  margin-bottom: 10px;
  border-radius: 16px;
  box-shadow: inset 0 0 0 1px var(--c-line);
  overflow: hidden;
  transition: box-shadow 0.18s ease;
}
html.ion-palette-dark ion-modal.account-picker-modal .category-item {
  --background: var(--md-surface-container-highest) !important;
  --background-hover: var(--md-surface-container) !important;
  --background-activated: var(--md-surface-container) !important;
  --background-focused: var(--md-surface-container) !important;
}

/* Seçili hesap: diğer picker'lardaki gibi 2px primary halka. */
ion-modal.account-picker-modal .category-item.is-selected,
html.ion-palette-dark ion-modal.account-picker-modal .category-item.is-selected {
  --background: var(--md-surface-container) !important;
  --background-hover: var(--md-surface-container) !important;
  --background-activated: var(--md-surface-container) !important;
  --background-focused: var(--md-surface-container) !important;
  box-shadow: inset 0 0 0 2px var(--c-primary);
}
</style>

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
