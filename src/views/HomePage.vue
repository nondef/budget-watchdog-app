<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  onIonViewWillEnter,
  IonTitle,
  IonHeader,
  IonToolbar,
  IonButton,
} from '@ionic/vue';
import {
  addOutline,
  removeOutline,
  swapHorizontalOutline,
  flagOutline,
  eyeOutline,
  eyeOffOutline,
  warningOutline,
  refreshOutline
} from 'ionicons/icons';
import { useAccountsStore } from '@/stores/accounts';
import AccountsCard from '@/components/AccountsCard.vue';
import CashFlowCard from '@/components/CashFlowCard.vue';
import CategoriesCard from '@/components/CategoriesCard.vue';
import TransactionsCard from '@/components/TransactionsCard.vue';
import BudgetsCard from '@/components/BudgetsCard.vue';
import ExchangeRatesCard from '@/components/ExchangeRatesCard.vue';
import BackupReminderCard from '@/components/BackupReminderCard.vue';
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useTransactionsStore } from '@/stores/transactions';
import { useCategoriesStore } from '@/stores/categories';
import { useBudgetStore } from '@/stores/budgets';
import { useExchangeRateStore } from '@/stores/exchange-rates';
import { useCurrenciesStore } from '@/stores/currencies';
import { useRateRefresh } from '@/composables/features/useRateRefresh';
import { useThemeStore } from '@/stores/theme';
import { dateRangeBounds, TimeRange } from "@/shared/utils/date";
import { dateRangeText } from "@/i18n/format";
import { CategoryType, Percentage } from "@/domain";
import { useMoney } from "@/composables/money/useMoney";
import { useRangeTransactions } from "@/composables/data/useRangeTransactions";
import { translateCategoryName } from "@/composables/features/useCategoryName";
import { useI18n } from "vue-i18n";
import { useAppStore } from "@/stores/app";
import { PrivacySettings } from "@/domain/value-objects/privacy-settings";

interface CategoryRow {
  id: string
  name: string
  icon: { name: string; color: string }
  amount: string
  amountValue: number
  percentage: Percentage
}

const accountsStore = useAccountsStore();
const categoriesStore = useCategoriesStore()
const transactionsStore = useTransactionsStore()
const budgetsStore = useBudgetStore()
const exchangeRateStore = useExchangeRateStore()
const currenciesStore = useCurrenciesStore()

/**
 * Eksik kur uyarısı artık global şerit değil, tutarın altındaki satırın kendisi
 * — ve tıklanabilir. Yenileme eylemi uyarının bulunduğu yerde duruyor: kullanıcı
 * "~" işaretli tutarı görüp hemen altındaki satıra dokunarak düzeltebiliyor.
 *
 * Görünürlük koşulu bilinçli olarak composable'ınki DEĞİL, `totals.balanceMissing`:
 * bu satır tutardaki `~` işaretini açıklıyor, o yüzden tam olarak onunla birlikte
 * görünmeli. Overview ve İşlemler'de bağlanacak tek bir sayı olmadığından oralarda
 * MissingRatesNotice kartı kullanılıyor.
 */
const { refreshing: retryingRates, refresh: retryRates } = useRateRefresh()

const categoryMode = ref<CategoryType>('expense')

// Nakit akışı ve kategori kartları kendi tarih aralığını bağımsız seçer.
const cashFlowRange = ref<TimeRange>('thisMonth')
const categoryRange = ref<TimeRange>('thisMonth')

const cashFlowDateText = computed(() => dateRangeText(cashFlowRange.value))
const categoryDateText = computed(() => dateRangeText(categoryRange.value))

// Özet ve kategori kırılımı, truncated liste yerine seçili aralığın TAM
// verisinden hesaplanır (repo'dan yüklenir).
const cashFlowTx = useRangeTransactions(() => dateRangeBounds(cashFlowRange.value))
const categoryTx = useRangeTransactions(() => dateRangeBounds(categoryRange.value))

const { formatMoney, sumInBase, convertToBase } = useMoney()
const { t } = useI18n()

/**
 * Göz ikonu, Görünüm'deki "Tutarları Gizle" ayarının kısayolu — ayrı bir sayfa
 * durumu değil. Böylece gizleme kalıcı olur ve tüm uygulamadaki tutarları
 * (maske formatter'da uygulanıyor) birlikte kapatır.
 */
const appStore = useAppStore()
const balanceHidden = computed(() => appStore.hideAmounts)
const toggleBalanceHidden = () => {
  void appStore.updatePrivacy(PrivacySettings.create({ hideAmounts: !balanceHidden.value }))
}

/**
 * Logo dosyası temaya göre seçilir — ama TERS eşlemeyle.
 *
 * Dosya adları varlığın kendi zeminini anlatıyor: `logo-light.png` krem
 * zeminde koyu kalkan, `logo-dark.png` koyu zeminde krem kalkan. Büyük
 * panellerde (AboutPage, WelcomePage) temayla eşleştirmek zemini sayfaya
 * kaynatıyor; başlıktaki 36px rozette ise tersi isteniyor: rozet sayfanın
 * zıddı olunca öne çıkıyor. Açık temada koyu rozet, koyu temada krem rozet.
 *
 * Kaynak `themeStore.isDark` — `ion-palette-dark` sınıfını da o besliyor.
 * AboutPage/WelcomePage aynı işi iki `<img>` + tema seçicili CSS ile yapıyor;
 * o da çalışıyor ama tek img + reaktif src hem daha az işaretleme hem de
 * temayı CSS yerine tek bir kaynaktan okumak demek.
 */
const themeStore = useThemeStore()

const logoSrc = computed(() =>
    themeStore.isDark ? '/brand/logo-light.png' : '/brand/logo-dark.png'
)

/**
 * Açılışta karşılama metni bir kez karşılamadan durum metnine geçer.
 *
 * `onMounted` bilinçli: `onIonViewWillEnter` sekmeye her dönüşte tetikleniyor
 * ve geçiş her seferinde baştan oynardı; bu ise uygulamaya giriş başına bir kez.
 */
const WELCOME_SWAP_DELAY_MS = 1800

const welcomeSwapped = ref(false)

const welcomeText = computed(() =>
    welcomeSwapped.value ? t('home.welcomeFollowUp') : t('home.welcomeFallback')
)

let welcomeSwapTimer: ReturnType<typeof setTimeout> | undefined

onMounted(() => {
    welcomeSwapTimer = setTimeout(() => {
        welcomeSwapped.value = true
    }, WELCOME_SWAP_DELAY_MS)
})

// Sayfa süre dolmadan sökülürse zamanlayıcı ölü bir ref'i güncellemesin.
onBeforeUnmount(() => clearTimeout(welcomeSwapTimer))

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return t('home.greetingNight')
  if (h < 12) return t('home.greetingMorning')
  if (h < 18) return t('home.greetingDay')
  return t('home.greetingEvening')
})

const totals = computed(() => {
  const totalBalance = sumInBase(
      accountsStore.activeAccounts.map(a => ({
        currencyId: a.balance.currencyId,
        amount: a.balance.amount
      }))
  )

  const filtered = cashFlowTx.value

  let income = 0
  let expense = 0
  let txMissing = false

  for (const transaction of filtered) {
    const converted = convertToBase(transaction.amount.amount, transaction.amount.currencyId)

    if (converted === null) {
      txMissing = true
      continue
    }

    if (transaction.type === 'income') income += converted
    else if (transaction.type === 'expense') expense += converted
  }

  // Maske açıkken formatter zaten '••••' döner; '~' maskenin önüne eklenmez.
  const ftmt = (n: number, missing: boolean) => {
    const s = formatMoney(n)
    return missing && !balanceHidden.value ? `~${s}` : s
  }

  const balanceMissing = totalBalance.missing.length > 0

  return {
    totalBalance: ftmt(totalBalance.total, balanceMissing),
    income: ftmt(income, txMissing),
    expense: ftmt(expense, txMissing),
    cashFlow: ftmt(income - expense, txMissing),
    balanceMissing,
    txMissing
  }
})

const categoryRows = computed<CategoryRow[]>(() => {
  const filtered = categoryTx.value
      .filter(t => t.type === categoryMode.value)

  const totalsByCategory = new Map<string, number>()
  for (const t of filtered) {
    // Kategorisiz işlem (transfer) kırılıma girmez.
    if (!t.categoryId) continue

    const converted = convertToBase(t.amount.amount, t.amount.currencyId)
    if (converted === null) continue
    totalsByCategory.set(
        t.categoryId,
        (totalsByCategory.get(t.categoryId) ?? 0) + converted
    )
  }

  const grandTotal = [...totalsByCategory.values()].reduce((a, b) => a + b, 0)

  return [...totalsByCategory.entries()]
      .map(([categoryId, amountValue]) => {
        const cat = categoriesStore.categoryById(categoryId)
        if (!cat) return null
        return {
          id: cat.id,
          name: translateCategoryName(cat.name),
          icon: cat.icon,
          amount: formatMoney(amountValue),
          amountValue,
          percentage: Percentage.fromRatio(amountValue, grandTotal),
        }
      })
      .filter((x): x is CategoryRow => x !== null)
      .sort((a, b) => b.amountValue - a.amountValue)
})

const toggleCategoryMode = () => {
  categoryMode.value = categoryMode.value === 'expense' ? 'income' : 'expense'
}

const onCashFlowRangeChange = (range: TimeRange) => cashFlowRange.value = range
const onCategoryRangeChange = (range: TimeRange) => categoryRange.value = range

const quickActions = computed(() => [
  { label: t('home.quickActions.income'), icon: addOutline, tone: 'income', link: '/transaction/new?type=income' },
  { label: t('home.quickActions.expense'), icon: removeOutline, tone: 'expense', link: '/transaction/new?type=expense' },
  { label: t('home.quickActions.transfer'), icon: swapHorizontalOutline, tone: 'transfer', link: '/transaction/new?type=transfer' },
  { label: t('home.quickActions.goal'), icon: flagOutline, tone: 'goal', link: '/savings/new' },
])

onIonViewWillEnter(async () => {
  await Promise.all([
    accountsStore.loadAccounts(),
    // Kartın ihtiyacı son N işlem; `loadTransactions()` TransactionsPage'in
    // sayfalanmış listesini ve imlecini sıfırlıyordu.
    transactionsStore.loadRecentTransactions(),
    categoriesStore.loadCategories(),
    budgetsStore.loadBudgets(),
    currenciesStore.loadCurrencies(),
    exchangeRateStore.loadRates(),
  ])
})
</script>

<template>
  <ion-page>
    <!-- Üst bar -->
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-title class="font-semibold">
          <div class="flex items-center gap-3">
            <div class="brand-mark">
              <img :src="logoSrc" :alt="$t('home.logoAlt')" class="brand-logo"/>
            </div>
            <div class="min-w-0">
              <p class="text-xs text-content-muted">{{ greeting }}</p>
              <!-- Karşılama metni açılışta bir kez karşılamadan durum metnine
                   olarak geçer; `key` değişince Transition tetiklenir. -->
              <h1 class="welcome-line text-xl font-semibold text-content truncate mt-0.5">
                <transition name="welcome-swap" mode="out-in">
                  <span :key="welcomeText">{{ welcomeText }}</span>
                </transition>
              </h1>
            </div>
          </div>
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="home-content" :scroll-y="true">
      <main class="mx-auto w-full max-w-xl px-4 pb-12 pt-5">
        <!-- Bakiye + Hızlı işlemler tek kart -->
        <section class="app-hero balance-card overflow-hidden px-5 py-5">
          <div class="flex items-center justify-between gap-2 font-semibold text-content">
            <p class="text-[12px]">{{ $t('home.totalBalance') }}</p>
            <ion-button
                fill="clear"
                class="balance-visibility"
                @click="toggleBalanceHidden"
                :aria-label="$t('home.hideBalance')"
            >
              <transition name="icon-swap" mode="out-in">
                <ion-icon
                    slot="icon-only"
                    :key="String(balanceHidden)"
                    :icon="balanceHidden ? eyeOffOutline : eyeOutline"
                />
              </transition>
            </ion-button>
          </div>
          <h2 class="mt-2 text-[38px] leading-none font-extrabold text-content tabular-nums tracking-tight">
            <transition name="value-swap" mode="out-in">
              <span :key="totals.totalBalance" class="inline-block">{{ totals.totalBalance }}</span>
            </transition>
          </h2>

          <!-- Uyarı ve çaresi aynı yerde: dokunmak kurları yeniden çeker.
               Satır yüksekliği sıfırdan açılır/kapanır ki altındaki kart içeriği
               zıplamasın; kapalıyken `inert` ile odak ve dokunma dışı kalır. -->
          <div
              class="collapse-row"
              :class="{ 'collapse-row--open': !balanceHidden && totals.balanceMissing }"
              :inert="balanceHidden || !totals.balanceMissing"
          >
            <div class="collapse-row-inner">
              <button
                  class="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-600 active:opacity-60 transition disabled:opacity-60"
                  :disabled="retryingRates"
                  @click="() => void retryRates()"
              >
                <ion-icon
                    :icon="retryingRates ? refreshOutline : warningOutline"
                    class="size-3"
                    :class="{ 'animate-spin': retryingRates }"
                />
                <span>{{ retryingRates ? $t('common.loading') : $t('home.missingRates') }}</span>
                <span v-if="!retryingRates" class="font-semibold underline underline-offset-2">
                  {{ $t('common.retry') }}
                </span>
              </button>
            </div>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-2 text-[12px]">
            <div class="balance-stat flex min-w-0 items-center gap-2 rounded-xl px-3 py-2.5">
              <span class="size-1.5 rounded-full bg-emerald-500" />
              <div class="min-w-0">
                <span class="block text-[10px] text-content-muted">{{ $t('home.income') }}</span>
                <transition name="value-swap" mode="out-in">
                  <span :key="totals.income" class="block truncate font-bold text-content tabular-nums">
                    {{ totals.income }}
                  </span>
                </transition>
              </div>
            </div>
            <div class="balance-stat flex min-w-0 items-center gap-2 rounded-xl px-3 py-2.5">
              <span class="size-1.5 rounded-full bg-rose-500" />
              <div class="min-w-0">
                <span class="block text-[10px] text-content-muted">{{ $t('home.expense') }}</span>
                <transition name="value-swap" mode="out-in">
                  <span :key="totals.expense" class="block truncate font-bold text-content tabular-nums">
                    {{ totals.expense }}
                  </span>
                </transition>
              </div>
            </div>
          </div>

          <div class="mt-5 grid grid-cols-4 gap-2 border-t border-line pt-5">
            <router-link
                v-for="action in quickActions"
                :key="action.label"
                :to="action.link"
                class="quick-action flex min-w-0 flex-col items-center gap-1.5 rounded-xl py-2 transition"
            >
              <div
                  class="quick-action-icon flex size-11 items-center justify-center rounded-2xl"
                  :class="`quick-action-icon--${action.tone}`"
              >
                <ion-icon :icon="action.icon" class="size-[20px]" />
              </div>
              <span class="text-[11px] text-content-tertiary">{{ action.label }}</span>
            </router-link>
          </div>
        </section>
        <div class="home-sections mt-4 -mb-4">
        <!-- Kartların en üstünde: bakiyeden hemen sonra görülür ama hiçbir
             şeyin üstünü örtmez ve kaydırınca gider. -->
        <BackupReminderCard class="dashboard-section" />

        <BudgetsCard v-if="budgetsStore.activeBudgets" class="dashboard-section" />

        <TransactionsCard
            :transactions="transactionsStore.sortedByDateDesc"
            :title="$t('home.recentTransactions')"
            class="dashboard-section"
        />

        <AccountsCard :accounts="accountsStore.accounts" class="dashboard-section"/>

        <CashFlowCard
            :income="totals.income"
            :expense="totals.expense"
            :total="totals.cashFlow"
            :dateText="cashFlowDateText"
            class="dashboard-section"
            @timeRangeChange="onCashFlowRangeChange"
        />

        <CategoriesCard
            :categories="categoryRows"
            :mode="categoryMode"
            :dateText="categoryDateText"
            class="dashboard-section"
            @toggleMode="toggleCategoryMode"
            @timeRangeChange="onCategoryRangeChange"
        />

        <ExchangeRatesCard class="dashboard-section" />
        </div>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
/* Buradaki `.plain-content` kuralları kaldırıldı: o sınıf hiçbir elemanda
   yoktu (ion-content zemini inline `--background: var(--c-page)` ile geliyor),
   dolayısıyla ölü koddu. Dahası dark kuralı `:global(...)` ile yazıldığı için
   derlenirken torun kısmını kaybedip `--background`i doğrudan <html>'e
   basıyordu; oradan da değeri okuyan her elemana miras kalıyordu. */

.home-content {
  --background: var(--c-page);
}

ion-button.balance-visibility {
  width: 32px;
  height: 32px;
  min-height: 0;
  margin: -8px 0;
  --border-radius: 10px;
  --color: var(--c-content-secondary);
  --padding-start: 0;
  --padding-end: 0;
}

ion-button.balance-visibility ion-icon {
  font-size: 18px;
}

.balance-stat {
  background: color-mix(in srgb, var(--c-surface) 72%, transparent);
  border: 1px solid var(--c-line);
}

.quick-action:active {
  background: var(--c-surface-strong);
}

.quick-action-icon {
  border: 1px solid transparent;
}

.quick-action-icon--income {
  --income-icon-color: #15803d;
  background: color-mix(in srgb, var(--income-icon-color) 12%, var(--c-surface));
  border-color: color-mix(in srgb, var(--income-icon-color) 24%, var(--c-line));
  color: var(--income-icon-color);
}

:global(.ion-palette-dark .quick-action-icon--income) {
  --income-icon-color: #86efac;
}

.quick-action-icon--expense {
  background: color-mix(in srgb, var(--c-error) 10%, var(--c-surface));
  border-color: color-mix(in srgb, var(--c-error) 22%, var(--c-line));
  color: var(--c-error);
}

.quick-action-icon--transfer {
  background: var(--c-primary);
  color: var(--c-on-primary);
}

.quick-action-icon--goal {
  --goal-icon-color: #92400e;
  background: color-mix(in srgb, var(--goal-icon-color) 13%, var(--c-surface));
  border-color: color-mix(in srgb, var(--goal-icon-color) 26%, var(--c-line));
  color: var(--goal-icon-color);
}

:global(.ion-palette-dark .quick-action-icon--goal) {
  --goal-icon-color: #fcd34d;
}

/* Kartlar arası boşluk kapsayıcının `space-y`si değil, her kartın kendi alt
   boşluğu: kart kapanırken (CollapseTransition) boşluğunu da götürebilsin,
   ilk/son kart değişince komşunun boşluğu zıplamasın. Son kartın fazlası
   kapsayıcının negatif alt boşluğuyla sıfırlanıyor. */
.dashboard-section {
  margin-bottom: 1rem;
  border: 1px solid var(--c-line);
  border-radius: 18px;
  box-shadow: 0 5px 18px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.brand-mark {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 11px;
  overflow: hidden;
  background: var(--c-surface-sunken);
}

.brand-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Metin değişirken satır yüksekliği zıplamasın diye sabit blok.

   Yazı boyutu `text-xl`e sabitlenmiyor: durum metni karşılamadan uzun ve
   320px'lik ekranlarda logo + boşluk düştükten sonra kalan 224px'e sığmayıp
   ellipsis'e düşüyordu. Alt sınır dar ekranda sığacak kadar küçük, üst sınır
   `text-xl` ile aynı — 390px ve üstünde görünüm değişmiyor. */
.welcome-line {
  display: block;
  min-height: 1.75rem;
  font-size: clamp(1.125rem, 5.5vw, 1.328rem);
}

.welcome-swap-enter-active,
.welcome-swap-leave-active {
  transition: opacity 260ms ease, transform 260ms ease;
}

.welcome-swap-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.welcome-swap-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* `height: auto`ya geçiş yapılamadığı için grid satırı 0fr ↔ 1fr arasında
   animasyonlanıyor; iç kutu `min-height: 0` ile satıra sığacak kadar büzülüyor. */
.collapse-row {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 240ms ease, opacity 240ms ease;
}

.collapse-row--open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.collapse-row-inner {
  min-height: 0;
  overflow: hidden;
}

/* Hareket hassasiyeti: geçiş animasyonsuz, anında olur. */
@media (prefers-reduced-motion: reduce) {
  .welcome-swap-enter-active,
  .welcome-swap-leave-active,
  .collapse-row {
    transition: none;
  }

  .welcome-swap-enter-from,
  .welcome-swap-leave-to {
    opacity: 1;
    transform: none;
  }
}
</style>
