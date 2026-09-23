<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  IonPage,
  IonContent,
  IonIcon,
  IonInput,
  IonTextarea, IonButtons, IonTitle, IonHeader, IonBackButton, IonToolbar, IonFooter, IonButton,
} from '@ionic/vue'
import {
  chevronBackOutline, pricetagOutline,
} from "ionicons/icons";
import { useAccountsStore } from "@/stores/accounts";
import { useTransactionsStore } from "@/stores/transactions";
import { useCategoriesStore } from '@/stores/categories';
import { useCurrenciesStore } from '@/stores/currencies';
import { useExchangeRateStore } from '@/stores/exchange-rates';
import { useRoute } from 'vue-router';
import type { UpdateTransactionInput } from "@/application";
import { useForm } from "vee-validate";
import { createTransactionSchema } from "@/forms";
import CurrencyInput from "@/components/CurrencyInput.vue";
import TransactionTypeSegment from "@/components/TransactionTypeSegment.vue";
import AccountCarousel from "@/components/AccountCarousel.vue";
import DateTimeField from "@/components/DateTimeField.vue";
import TransferAccountFlow from "@/components/TransferAccountFlow.vue";
import ErrorChip from "@/components/ErrorChip.vue";
import PickerField from "@/components/PickerField.vue";
import CategoryPickerModal from "@/components/CategoryPickerModal.vue";
import { getIconByName } from "@/shared/utils";
import { useMoney } from "@/composables/money/useMoney";
import { useErrorHandler } from "@/composables/ui/useErrorHandler";
import { useAlert } from "@/composables/ui/useAlert";
import { guardSubmit } from "@/composables/ui/guard-submit";
import type { BudgetLimitBreach, PreviewTransactionBudgetImpactInput } from "@/application";
import { useAppNavigation } from "@/composables/navigation/useAppNavigation";

const accountStore = useAccountsStore()
const transactionStore = useTransactionsStore()
const categoriesStore = useCategoriesStore()
const currenciesStore = useCurrenciesStore()
const exchangeRateStore = useExchangeRateStore()
const route = useRoute()
const { goBackOrFallback } = useAppNavigation()

const { handle } = useErrorHandler()
const { t } = useI18n()
const { formatMoney } = useMoney()
const alert = useAlert()

const transactionId = route.params.id as string

// İşlemin para birimi düzenlemede sabittir: use-case, kaynak bacağı işlemin
// para biriminden farklı bir hesaba taşımayı `CurrencyMismatchException` ile
// reddeder. Kaydın yüklendiği para birimini burada kilitleyip kaynak hesap
// listesini buna göre süzeriz — aksi halde kullanıcı uyumsuz bir hesap seçip
// kaydetmede ham hata alıyordu.
const lockedCurrencyId = ref<string | null>(null)

const schema = createTransactionSchema()

const { errors, setFieldValue, values, handleSubmit, resetForm, defineField, isSubmitting } = useForm({
  validationSchema: schema,
  initialValues: {
    title: '',
    categoryId: '',
    accountId: '',
    targetAccountId: '',
    amount: 0,
    targetAmount: 0,
    description: '',
    date: new Date().toLocaleDateString('tr-TR'),
    time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    type: 'expense' as 'income' | 'expense' | 'transfer',
  }
})

const [title, titleAttr] = defineField('title')
const [amount] = defineField('amount')
const [description, descriptionAttr] = defineField('description')
const [type] = defineField('type')
const [accountId] = defineField('accountId')
const [targetAccountId] = defineField('targetAccountId')
const [targetAmount] = defineField('targetAmount')
const [date] = defineField('date')
const [time] = defineField('time')

const categoryPicker = ref(false)

const displayedCategories = computed(() => {
  if (values.type === 'income') return categoriesStore.incomeCategories
  if (values.type === 'expense') return categoriesStore.expenseCategories
  return []
})

const selectedAccount = computed(() =>
    accountStore.accounts.find(a => a.id === values.accountId)
)

const selectedCategory = computed(() =>
    categoriesStore.categoryById(values.categoryId)
)

const selectedCurrencyCode = computed(() =>
    currenciesStore.currencyById(selectedAccount.value?.balance.currencyId)?.code || 'TRY'
)
const selectedCurrencyMinorUnit = computed(() =>
    currenciesStore.currencyById(selectedAccount.value?.balance.currencyId)?.minorUnit
)

// Kaynak hesap yalnızca işlemin (kilitli) para biriminde olabilir. Kilit
// belirlenene kadar (ilk yükleme) tüm hesaplar gösterilir.
const sourceAccounts = computed(() =>
    lockedCurrencyId.value
        ? accountStore.accounts.filter(a => a.balance.currencyId === lockedCurrencyId.value)
        : accountStore.accounts
)

// Hedef bacak farklı para biriminde olabilir (kur dönüşümlü transfer); yalnız
// kaynakla aynı hesap elenir.
const availableTargetAccounts = computed(() =>
    accountStore.accounts.filter(a => a.id !== values.accountId)
)

const selectedTargetAccount = computed(() =>
    accountStore.accounts.find(a => a.id === values.targetAccountId)
)

const isCrossCurrencyTransfer = computed(() =>
    values.type === 'transfer' &&
    !!selectedAccount.value &&
    !!selectedTargetAccount.value &&
    selectedAccount.value.balance.currencyId !== selectedTargetAccount.value.balance.currencyId
)

const targetCurrencyCode = computed(() =>
    currenciesStore.currencyById(selectedTargetAccount.value?.balance.currencyId)?.code || ''
)
const targetCurrencyMinorUnit = computed(() =>
    currenciesStore.currencyById(selectedTargetAccount.value?.balance.currencyId)?.minorUnit
)

const targetAmountError = ref('')

// İlk yükleme (resetForm) hesap alanlarını topluca değiştirip watch'u tetikler;
// o ilk tetikte kaydın saklı hedef tutarını ezmemek için gate.
let suggestInitialized = false

// Kaynak/hedef hesap değişince hedef tutarı kurdan yeniden öner. Tutar
// değişiminde öneriyi ezmeyiz: mevcut cross-currency kaydın hedef tutarı
// kullanıcınındır, kaynağı düzeltince kaybolmamalı (sync yalnızca aynı-para
// transferde, o da domain tarafında yapılır).
watch(
    () => [values.accountId, values.targetAccountId, values.type] as const,
    () => {
      if (!suggestInitialized) return

      if (!isCrossCurrencyTransfer.value) {
        targetAmountError.value = ''
        return
      }

      const source = selectedAccount.value!.balance.currencyId
      const target = selectedTargetAccount.value!.balance.currencyId
      const suggested = exchangeRateStore.convertBetween(Number(values.amount || 0), source, target)

      if (suggested !== null && suggested > 0) {
        targetAmount.value = Math.round(suggested * 100) / 100
        targetAmountError.value = ''
      }
    }
)

const quickAmounts = [10, 50, 100, 250, 500]
const addAmount = (n: number) => {
  amount.value = Number(amount.value || 0) + n
}

// Modal tek/çoklu seçimi aynı olayla yayıyor; burada tek seçim kullanılıyor.
const selectCategory = (payload: string | string[]) => {
  setFieldValue('categoryId', Array.isArray(payload) ? payload[0] ?? '' : payload)
}

const createTransactionDate = (): Date => {
  const [day, month, year] = values.date!.split('.')
  const [hour, minute] = values.time!.split(':')
  return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute)
  )
}

/**
 * Düzenleme bir bütçeyi limit üstüne taşıyacaksa kullanıcıdan onay ister.
 *
 * Yeni işlem akışıyla aynı guard; tek farkı `transactionId` geçmesi. Bu işlem
 * bütçeye zaten yazılmış olduğu için önizleme eski etkiyi düşer, aksi halde
 * tutar iki kez sayılıp olmayan bir aşım raporlanırdı.
 *
 * Önizleme başarısız olursa kayıt engellenmez: bu bir yardımcı uyarı, doğruluk
 * guard'ı değil — bütçe etkisini asıl işleyen yine `updateTransaction`.
 *
 * @return Kaydetmeye devam edilmeli mi.
 */
const confirmBudgetLimit = async (
    input: PreviewTransactionBudgetImpactInput
): Promise<boolean> => {
  let breaches: BudgetLimitBreach[]

  try {
    ({ breaches } = await transactionStore.previewBudgetImpact(input))
  } catch (err) {
    handle(err, { context: 'EditTransactionPage', silent: true })
    return true
  }

  if (breaches.length === 0) return true

  const money = (m: { amount: number; currencyId: string }) =>
      formatMoney(m.amount, m.currencyId)

  // Metin iki durumu ayırır: sınırı bu düzenleme mi geçiriyor, yoksa
  // halihazırda aşılmış bir bütçeyi mi derinleştiriyor.
  const params = (b: BudgetLimitBreach) => ({
    budget: b.budgetName,
    limit: money(b.limit),
    spent: money(b.spentAfter),
    over: money(b.overBy),
    overBefore: money(b.overByBefore),
  })

  const body = breaches.length === 1
      ? t(
          breaches[0].alreadyExceeded
              ? 'transactions.budgetLimitConfirm.oneAlready'
              : 'transactions.budgetLimitConfirm.one',
          params(breaches[0])
      )
      : [
        t('transactions.budgetLimitConfirm.many', { count: breaches.length }),
        ...breaches.map(b => t(
            b.alreadyExceeded
                ? 'transactions.budgetLimitConfirm.lineAlready'
                : 'transactions.budgetLimitConfirm.line',
            params(b)
        )),
      ].join('\n')

  return alert.confirm({
    header: t('transactions.budgetLimitConfirm.title'),
    message: `${body}\n\n${t('transactions.budgetLimitConfirm.question')}`,
    confirmText: t('transactions.budgetLimitConfirm.confirm'),
    cancelText: t('transactions.budgetLimitConfirm.cancel'),
    // Yanlışlıkla onaylanmasın: backdrop ile kapanma kapalı.
    backdropDismiss: false,
  })
}

const submitTransaction = handleSubmit(async (values) => {
  try {
    const date = createTransactionDate()

    const isTransfer = values.type === 'transfer'

    if (isCrossCurrencyTransfer.value && !(Number(values.targetAmount) > 0)) {
      targetAmountError.value = t('transactions.targetAmountRequired')
      return
    }

    // Hesap ve hedef hesap alanları formda düzenlenebilir; eskiden input'a hiç
    // konmadığı için değişiklik kaydedilmiş görünüp sessizce kayboluyordu.
    const input: UpdateTransactionInput = {
      id: transactionId,
      title: values.title?.trim() || selectedCategory.value?.name || t('transactions.defaultUpdateTitle'),
      amount: values.amount!,
      toAmount: isCrossCurrencyTransfer.value ? Number(values.targetAmount) : undefined,
      description: values.description?.trim() || undefined,
      categoryId: isTransfer ? undefined : (values.categoryId || undefined),
      accountId: values.accountId || undefined,
      toAccountId: isTransfer ? (values.targetAccountId || undefined) : undefined,
      date,
    }

    const proceed = await confirmBudgetLimit({
      transactionId: transactionId,
      accountId: input.accountId ?? '',
      categoryId: input.categoryId,
      currencyId: selectedAccount.value?.balance.currencyId ?? '',
      amount: input.amount ?? 0,
      date,
      type: values.type,
    })

    if (!proceed) return

    await transactionStore.updateTransaction(input)

    goBackOrFallback('/tabs/transactions')
  } catch (err) {
    handle(err, {
      context: 'EditTransactionPage',
      fallback: t('transactions.updateError'),
    })
  }
})

/** Çift dokunuşta aynı güncelleme iki kez uygulanmasın (bkz. guardSubmit). */
const saveTransaction = guardSubmit(isSubmitting, submitTransaction)

onMounted(async () => {
  await Promise.all([
    accountStore.loadAccounts(),
    categoriesStore.loadCategories(),
    currenciesStore.loadCurrencies(),
  ])

  if (!transactionId) {
    goBackOrFallback('/tabs/transactions')
    return
  }

  const transaction = await transactionStore.findTransactionById(transactionId)

  if (!transaction) {
    goBackOrFallback('/tabs/transactions')
    return
  }

  const txDate = new Date(transaction.date)
  const dateStr = txDate.toLocaleDateString('tr-TR')
  const timeStr = txDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

  resetForm({
    values: {
      title: transaction.title || '',
      categoryId: transaction.categoryId || '',
      accountId: transaction.accountId || '',
      targetAccountId: transaction.toAccountId || '',
      amount: transaction.amount.amount,
      // Kaydın saklı hedef tutarı (kur dönüşümlü transfer); yoksa kaynak tutar.
      targetAmount: transaction.toAmount?.amount ?? transaction.amount.amount,
      description: transaction.description || '',
      date: dateStr,
      time: timeStr,
      type: transaction.type,
    }
  })

  // Kaynak hesap süzgeci bu andan itibaren işlemin para birimine kilitlenir.
  lockedCurrencyId.value = transaction.amount.currencyId

  // İlk resetForm watch'u tetikledikten sonra öneriyi aç.
  await nextTick()
  suggestInitialized = true

  // Transfer işlemi düzenleniyor ama hedef için yeterli hesap kalmamışsa uyar.
  if (transaction.type === 'transfer' && accountStore.accounts.length < 2) {
    alert.info(
        t('transactions.transferNeedsAccountsTitle'),
        t('transactions.transferNeedsAccounts'),
    )
  }
})
</script>

<template>
  <ion-page class="design-page">
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/transactions" :icon="chevronBackOutline" />
        </ion-buttons>
        <ion-title class="font-semibold">{{ $t('transactions.edit') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="tx-form-content" :scroll-y="true">
      <div class="px-4">
        <!-- Tip segmenti (düzenlemede tip değiştirilemez — salt görünüm) -->
        <TransactionTypeSegment class="mt-5 pointer-events-none" v-model="type" />

        <!-- Büyük tutar -->
        <section class="mt-6">
          <p class="text-center text-[13px] font-medium uppercase tracking-wider text-content-muted mb-2">
            {{ $t('transactions.amount') }}
          </p>

          <div class="amount-card relative flex items-center justify-center rounded-2xl border border-line bg-surface px-3">
            <!-- Tutar (kart genişliğinde ortalı) -->
            <CurrencyInput
                v-model="amount"
                variant="plain"
                hide-currency
                :label="$t('transactions.amount')"
                :currency-code="selectedCurrencyCode"
                :minor-unit="selectedCurrencyMinorUnit"
                :error-text="errors.amount"
                class="tx-amount-input w-full"
            />
            <span class="amount-currency-code">{{ selectedCurrencyCode }}</span>
          </div>

          <!-- Hızlı ekleme -->
          <div class="mt-2 grid grid-cols-5 gap-2">
            <button
                v-for="q in quickAmounts"
                :key="q"
                type="button"
                class="quick-chip"
                @click="addAmount(q)"
            >
              +{{ formatMoney(q, selectedAccount?.balance.currencyId) }}
            </button>
          </div>

          <div v-if="errors.amount" class="mt-2 flex justify-center">
            <ErrorChip :message="errors.amount"/>
          </div>
        </section>
      </div>

      <!-- Form alanları -->
      <div class="mt-6 px-4 pb-32 space-y-3">
        <TransferAccountFlow
            v-if="values.type === 'transfer'"
            v-model:source-account-id="accountId"
            v-model:target-account-id="targetAccountId"
            v-model:target-amount="targetAmount"
            :source-accounts="sourceAccounts"
            :target-accounts="availableTargetAccounts"
            :source-error="errors.accountId"
            :target-error="errors.targetAccountId"
            :cross-currency="isCrossCurrencyTransfer"
            :source-currency-code="selectedCurrencyCode"
            :target-currency-code="targetCurrencyCode"
            :target-currency-minor-unit="targetCurrencyMinorUnit"
            :target-amount-error="targetAmountError"
        />

        <template v-else>
          <AccountCarousel
              v-model="accountId"
              :accounts="sourceAccounts"
              :label="$t('transactions.account')"
          />
          <div v-if="errors.accountId" class="mt-1 px-1">
            <ErrorChip :message="errors.accountId"/>
          </div>
        </template>

        <!-- İşlem adı — MD3 filled text field -->
        <ion-input
            v-model="title"
            fill="solid"
            label-placement="floating"
            :label="$t('transactions.nameLabel')"
            :placeholder="$t('transactions.namePlaceholder')"
            :error-text="errors.title"
            :class="{ 'ion-touched ion-invalid': errors.title }"
            @ion-input="titleAttr.onInput"
            @ion-blur="titleAttr.onBlur"
            @ion-change="titleAttr.onChange"
        />

        <!-- Kategori — MD3 picker alanı -->
        <picker-field
            v-if="values.type !== 'transfer'"
            :label="values.type === 'income' ? $t('transactions.incomeCategory') : $t('transactions.expenseCategory')"
            :error="errors.categoryId"
            :empty="!selectedCategory"
            @click="categoryPicker = true"
        >
          <template #start>
            <div
                slot="start"
                class="size-9 rounded-xl flex items-center justify-center text-white shrink-0"
                :class="selectedCategory?.icon.color || 'bg-surface-strong'"
            >
              <ion-icon :icon="selectedCategory ? getIconByName(selectedCategory.icon.name) : pricetagOutline" class="size-5"/>
            </div>
          </template>
          {{ selectedCategory?.name || 'Kategori seç' }}
        </picker-field>

        <!-- Tarih & Saat -->
        <DateTimeField v-model:date="date" v-model:time="time"/>

        <!-- Not — MD3 filled textarea -->
        <ion-textarea
            v-model="description"
            fill="solid"
            label-placement="floating"
            :label="$t('accounts.noteOptional')"
            :maxlength="150"
            :rows="3"
            counter
            :auto-grow="false"
            :placeholder="$t('transactions.notePlaceholder')"
            :error-text="errors.description"
            :class="{ 'ion-touched ion-invalid': errors.description }"
            @ion-change="descriptionAttr.onChange"
            @ion-blur="descriptionAttr.onBlur"
            @ion-input="descriptionAttr.onInput"
        />

      </div>
    </ion-content>

    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <ion-button
            expand="block"
            class="app-button"
            :disabled="isSubmitting"
            @click="saveTransaction"
        >
          {{ isSubmitting ? $t('transactions.saving') : $t('transactions.update') }}
        </ion-button>
      </ion-toolbar>
    </ion-footer>

    <!-- Kategori modal -->
    <CategoryPickerModal v-model:is-open="categoryPicker"
                         :categories="displayedCategories"
                         :selected-ids="selectedCategory ? [selectedCategory.id] : []"
                         @select="selectCategory"
    />
  </ion-page>
</template>

<style scoped>
.tx-form-content {
  --background: var(--c-page);
}

.tx-form-content ion-textarea :deep(textarea) {
  resize: none;
}

ion-page {
  overflow: hidden;
}

/* Rakam ve üst etiketi gerçek kart merkezinde kalır; para birimi sağdaki eşit
   boşluk alanında sabitlenir. Simetrik padding kodun rakama binmesini önler. */
.tx-amount-input {
  --background: transparent;
  --color: inherit;
  --padding-start: 48px;
  --padding-end: 48px;
  font-size: clamp(26px, 8vw, 32px);
  font-weight: 800;
}

.tx-amount-input :deep(input) {
  font: inherit;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.amount-currency-code {
  position: absolute;
  inset-inline-end: 12px;
  top: 50%;
  transform: translateY(-50%);
  padding-inline-start: 10px;
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
}

/* Hızlı ekleme çipleri */
.quick-chip {
  height: 36px;
  border-radius: 12px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  color: var(--c-content-secondary);
  font-size: 12px;
  font-weight: 600;
  transition: background 120ms ease;
}

.quick-chip:active {
  background: var(--c-surface-sunken);
}
</style>
