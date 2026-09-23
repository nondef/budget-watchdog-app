<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  IonPage,
  IonContent,
  IonIcon,
  IonInput,
  IonTextarea, IonButtons, IonTitle, IonHeader, IonBackButton, IonToolbar, IonFooter, IonButton
} from '@ionic/vue'
import {
  chevronBackOutline, pricetagOutline
} from "ionicons/icons";
import { useAccountsStore } from "@/stores/accounts";
import { useTransactionsStore } from "@/stores/transactions";
import { useCategoriesStore } from '@/stores/categories';
import { useRoute } from 'vue-router';
import { useAppNavigation } from "@/composables/navigation/useAppNavigation";
import { useForm } from "vee-validate";
import { createTransactionSchema } from "@/forms";
import { useCurrenciesStore } from "@/stores/currencies";
import { useExchangeRateStore } from "@/stores/exchange-rates";
import { useErrorHandler } from "@/composables/ui/useErrorHandler";
import { useAlert } from "@/composables/ui/useAlert";
import { guardSubmit } from "@/composables/ui/guard-submit";
import type { BudgetLimitBreach, PreviewTransactionBudgetImpactInput } from "@/application";
import CurrencyInput from "@/components/CurrencyInput.vue";
import TransactionTypeSegment from "@/components/TransactionTypeSegment.vue";
import AccountCarousel from "@/components/AccountCarousel.vue";
import DateTimeField from "@/components/DateTimeField.vue";
import TransferAccountFlow from "@/components/TransferAccountFlow.vue";
import ErrorChip from "@/components/ErrorChip.vue";
import { getIconByName } from "@/shared/utils";
import PickerField from "@/components/PickerField.vue";
import { useMoney } from "@/composables/money/useMoney";
import CategoryPickerModal from "@/components/CategoryPickerModal.vue";
import { translateCategoryName } from "@/composables/features/useCategoryName";

const accountStore = useAccountsStore()
const transactionStore = useTransactionsStore()
const categoriesStore = useCategoriesStore()
const currencyStore = useCurrenciesStore()
const exchangeRateStore = useExchangeRateStore()
const { goBackOrFallback } = useAppNavigation()
const route = useRoute()

const { t } = useI18n()
const { formatMoney } = useMoney()
const { handle } = useErrorHandler()
const alert = useAlert()

const schema = createTransactionSchema()

const initialType = (Array.isArray(route.query.type)
    ? route.query.type[0]
    : route.query.type) as 'income' | 'expense' | 'transfer' ?? 'expense'

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
    type: initialType,
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

const currencyCode = (currencyId?: string) =>
    currencyStore.currencyById(currencyId)?.code ?? ''

const selectedCategory = computed(() =>
    categoriesStore.categoryById(values.categoryId)
)

const selectedCurrencyCode = computed(() =>
    currencyCode(selectedAccount.value?.balance.currencyId) || 'TRY'
)
const selectedCurrencyMinorUnit = computed(() =>
    currencyStore.currencyById(selectedAccount.value?.balance.currencyId)?.minorUnit
)

const availableTargetAccounts = computed(() =>
    accountStore.accounts.filter(a => a.id !== values.accountId)
)

const selectedTargetAccount = computed(() =>
    accountStore.accounts.find(a => a.id === values.targetAccountId)
)

// Kur dönüşümlü transfer: kaynak ve hedef hesap farklı para birimindeyse hedef
// tutar ayrı girilmeli (banka kuru değişken).
const isCrossCurrencyTransfer = computed(() =>
    values.type === 'transfer' &&
    !!selectedAccount.value &&
    !!selectedTargetAccount.value &&
    selectedAccount.value.balance.currencyId !== selectedTargetAccount.value.balance.currencyId
)

const targetCurrencyCode = computed(() =>
    currencyCode(selectedTargetAccount.value?.balance.currencyId) || ''
)
const targetCurrencyMinorUnit = computed(() =>
    currencyStore.currencyById(selectedTargetAccount.value?.balance.currencyId)?.minorUnit
)

const targetAmountError = ref('')

// Kaynak tutar veya hedef hesap değişince hedef tutarı kurdan öner; kur yoksa
// alan boş kalır ve kullanıcı elle girer. Kullanıcı sonradan üzerine yazabilir.
watch(
    () => [values.amount, values.targetAccountId, values.accountId, values.type] as const,
    () => {
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

// Kaydet'e basıldığında tutar geçersizse kart hafifçe sallanır;
// animasyon bitince bayrak sıfırlanır ki sonraki denemede yeniden oynasın.
const amountShake = ref(false)

// Aynı anda yalnızca tek transfer uyarısı: tetik birden çok kez gelse de
// (çift ionChange / mount+watch) ikinci kez açılmaz.
const transferWarnOpen = ref(false)
const warnTransferNeedsAccounts = () => {
  if (transferWarnOpen.value) return
  transferWarnOpen.value = true
  alert.info(
      t('transactions.transferNeedsAccountsTitle'),
      t('transactions.transferNeedsAccounts'),
  ).finally(() => { transferWarnOpen.value = false })
}

watch(() => values.type, (newType, oldType) => {
  // Tür değişince kategori seçimi sıfırlanır (transfer'de kategori yoktur,
  // gelir/gider listeleri de birbirinden ayrı).
  setFieldValue('categoryId', '', false)

  // Transfer için en az iki hesap gerekir; yoksa uyar ve tipi geri al.
  if (newType === 'transfer' && accountStore.accounts.length < 2) {
    warnTransferNeedsAccounts()

    // Geri almayı nextTick'e ertele: aksi halde ion-segment kendi ionChange'i
    // içinde resync olamayıp 'transfer'da takılı kalır ve ikinci dokunuş
    // ionChange üretmez (uyarı bir daha çıkmaz).
    nextTick(() => setFieldValue('type', oldType, false))
  }
})

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
 * İşlem bir bütçeyi limit üstüne taşıyacaksa kullanıcıdan onay ister.
 *
 * Kayıttan ÖNCE çalışır ve salt okunurdur; "aşacak mı" kararını domain'in
 * kendi `addSpending`/`isExceeded` mantığı bellekte çalıştırılarak verilir
 * (bkz. PreviewTransactionBudgetImpactUseCase), böylece diyalog ile gerçekte
 * olan iş ayrışamaz.
 *
 * Önizleme başarısız olursa kayıt engellenmez: bu bir yardımcı uyarı, doğruluk
 * guard'ı değil — bütçe etkisini asıl işleyen yine `addTransaction`.
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
    handle(err, { context: 'NewTransactionPage', silent: true })
    return true
  }

  if (breaches.length === 0) return true

  const money = (m: { amount: number; currencyId: string }) =>
      formatMoney(m.amount, m.currencyId)

  // Metin iki durumu ayırır: sınırı bu işlem mi geçiriyor, yoksa halihazırda
  // aşılmış bir bütçeyi mi derinleştiriyor. Uyarı her iki halde de çıkar.
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
    // Kur dönüşümlü transferde hedef tutar zorunlu; kur alınamadıysa alan boş
    // kalır, kullanıcıyı burada uyar (domain de ayrıca guard'lar).
    if (isCrossCurrencyTransfer.value && !(Number(values.targetAmount) > 0)) {
      targetAmountError.value = t('transactions.targetAmountRequired')
      return
    }

    const date = createTransactionDate()

    const proceed = await confirmBudgetLimit({
      accountId: values.accountId,
      categoryId: values.categoryId,
      currencyId: selectedAccount.value?.balance.currencyId ?? '',
      amount: values.amount,
      date,
      type: values.type,
    })

    if (!proceed) return

    await transactionStore.addTransaction({
      title: values.title?.trim() || (selectedCategory.value ? selectedCategory.value.name : t('transactions.defaultTitle')),
      amount: values.amount,
      currencyId: selectedAccount.value?.balance.currencyId ?? '',
      description: values.description?.trim() || '',
      categoryId: values.categoryId,
      date,
      type: values.type,
      accountId: values.accountId,
      toAccountId: values.targetAccountId || undefined,
      toAmount: isCrossCurrencyTransfer.value ? Number(values.targetAmount) : undefined
    })

    resetForm()

    goBackOrFallback('/tabs/transactions')
  } catch (err) {
    handle(err,{
      context: 'NewTransactionPage',
      fallback: t('transactions.addError'),
    })
  }
}, ({ errors: submitErrors }) => {
  if (submitErrors.amount) amountShake.value = true
})

/**
 * Çift dokunuş iki ayrı işlem yaratıyordu: hesap iki kez düşülüyor, bütçe iki
 * kez doluyor ve hiçbir hata görünmüyordu. Bütçe limiti onayı (alert) gönderim
 * süresini uzattığı için pencere burada özellikle genişti.
 */
const saveTransaction = guardSubmit(isSubmitting, submitTransaction)

onMounted(async () => {
  await Promise.all([
    accountStore.loadAccounts(),
    categoriesStore.loadCategories(),
    currencyStore.loadCurrencies()
  ])

  if (accountStore.accounts.length > 0) {
    setFieldValue('accountId', accountStore.accounts[0].id, false)
  }

  // Sayfaya transfer tipiyle gelinmişse (query) ve tek hesap varsa uyar.
  if (values.type === 'transfer' && accountStore.accounts.length < 2) {
    alert.info(
        t('transactions.transferNeedsAccountsTitle'),
        t('transactions.transferNeedsAccounts'),
    )
    setFieldValue('type', 'expense', false)
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
        <ion-title class="font-semibold">{{ $t('transactions.new') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="tx-form-content" :scroll-y="true">
      <div class="px-4">
        <!-- Tip segmenti -->
        <TransactionTypeSegment class="mt-5" v-model="type" />

        <!-- Büyük tutar -->
        <section class="mt-6">
          <p class="text-center text-[13px] font-medium uppercase tracking-wider text-content-muted mb-2">
            {{ $t('transactions.amount') }}
          </p>

          <div
              class="amount-card relative flex items-center justify-center rounded-2xl border border-line bg-surface px-3"
              :class="{ 'amount-card-error': errors.amount, 'amount-card-shake': amountShake }"
              @animationend="amountShake = false"
          >
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
          <div class="mt-4 grid grid-cols-5 gap-2">
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
            :source-accounts="accountStore.accounts"
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
              :accounts="accountStore.accounts"
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
          {{ translateCategoryName(selectedCategory?.name) || $t('transactions.selectCategory') }}
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
          {{ isSubmitting ? $t('transactions.saving') : $t('transactions.save') }}
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

/* Tutar kartı validation hatası: border hafifçe hata rengine döner,
   kaydetme denemesinde kart sağa sola sallanır. */
.amount-card {
  transition: border-color 150ms ease;
}

.amount-card.amount-card-error {
  border-color: color-mix(in srgb, var(--c-error) 60%, var(--c-line));
}

.amount-card-shake {
  animation: amount-shake 400ms ease;
}

@keyframes amount-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-5px); }
  40% { transform: translateX(5px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(3px); }
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
