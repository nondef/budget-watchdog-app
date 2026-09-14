<script setup lang="ts">
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonBackButton,
  IonContent,
  IonFooter,
  IonIcon,
} from "@ionic/vue";
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { TransactionDTO } from "@/application";
import { useMoney } from "@/composables/money/useMoney";
import { useTransactionsStore } from "@/stores/transactions";
import { useCategoriesStore } from "@/stores/categories";
import { useCategoryName } from "@/composables/features/useCategoryName";
import { useToast } from "@/composables/ui/useToast";
import { useAlert } from "@/composables/ui/useAlert";
import { useErrorHandler } from "@/composables/ui/useErrorHandler";
import { getIconByName } from "@/shared/utils";
import {
  arrowDownOutline,
  arrowUpOutline,
  calendarOutline,
  chatbubbleOutline,
  createOutline,
  documentTextOutline,
  pricetagOutline,
  receiptOutline,
  swapHorizontalOutline,
  trashOutline,
} from "ionicons/icons";

const route = useRoute();
const router = useRouter();
const { t, locale } = useI18n();

const transactionStore = useTransactionsStore();
const categoryStore = useCategoriesStore();
const { formatMoney, baseCurrency, formatInBase } = useMoney();
const { categoryName } = useCategoryName();
const toast = useToast();
const alert = useAlert();
const { handle } = useErrorHandler();

const transactionId = route.params.id as string;
const transaction = ref<TransactionDTO | null>(null);
const isLoading = ref(true);

const isBase = computed(
    () => transaction.value?.amount.currencyId === baseCurrency.value?.id
);

const amountFormatted = computed(() =>
    transaction.value
        ? formatMoney(transaction.value.amount.amount, transaction.value.amount.currencyId)
        : ""
);

const amountInBase = computed(() =>
    !transaction.value || isBase.value
        ? null
        : formatInBase(transaction.value.amount.amount, transaction.value.amount.currencyId)
);

const category = computed(() =>
    transaction.value ? categoryStore.categoryById(transaction.value.categoryId) : null
);

const typeMeta = computed(() => {
  if (!transaction.value) return null;

  const map = {
    income: {
      label: t("common.income"),
      icon: arrowUpOutline,
      sign: "+",
      text: "text-emerald-600",
      pill: "bg-emerald-100 text-emerald-700",
    },
    expense: {
      label: t("common.expense"),
      icon: arrowDownOutline,
      sign: "−",
      text: "text-rose-600",
      pill: "bg-rose-100 text-rose-700",
    },
    transfer: {
      label: t("common.transfer"),
      icon: swapHorizontalOutline,
      sign: "",
      text: "text-indigo-600",
      pill: "bg-indigo-100 text-indigo-700",
    },
  } as const;

  return map[transaction.value.type as keyof typeof map] ?? map.expense;
});

const dateText = computed(() =>
    transaction.value
        ? new Date(transaction.value.date).toLocaleDateString(locale.value, {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
        : ""
);

const timeText = computed(() =>
    transaction.value
        ? new Date(transaction.value.date).toLocaleTimeString(locale.value, {
          hour: "2-digit",
          minute: "2-digit",
        })
        : ""
);

const showTitleRow = computed(
    () => !!transaction.value?.title && transaction.value.title !== category.value?.name
);

const editTransaction = () => {
  if (!transaction.value) return;
  router.push(`/transaction/${transaction.value.id}/edit`);
};

const deleteTransaction = async () => {
  if (!transaction.value) return;

  const confirmed = await alert.confirm({
    header: t("transactions.deleteTitle"),
    message: t("transactions.deleteConfirm", { title: transaction.value.title }),
    confirmText: t("common.delete"),
    cancelText: t("common.cancel"),
    destructive: true,
  });

  if (!confirmed) return;

  try {
    await transactionStore.deleteTransaction(transaction.value.id);
    toast.success(t("transactions.deletedSuccess"));
    router.back();
  } catch (err) {
    handle(err, {
      context: "TransactionDetailPage",
      fallback: t("transactions.deleteError"),
    });
  }
};

onMounted(async () => {
  await categoryStore.loadCategories();

  try {
    transaction.value = await transactionStore.findTransactionById(transactionId);
  } catch {
    transaction.value = null;
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar class="detail-toolbar">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/transactions" />
        </ion-buttons>
        <ion-title>{{ $t("transactionDetail.title") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
              v-if="transaction"
              fill="clear"
              :aria-label="$t('common.edit')"
              @click="editTransaction"
          >
            <ion-icon slot="icon-only" :icon="createOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="detail-content">
      <!-- Not found / hata durumu -->
      <div
          v-if="!isLoading && (!transaction || !typeMeta)"
          class="flex flex-col items-center justify-center h-full px-8 text-center"
      >
        <ion-icon :icon="receiptOutline" class="size-14 text-content-faint mb-3" />
        <h2 class="text-[16px] font-semibold text-content mb-1">
          {{ $t("transactionDetail.notFoundTitle") }}
        </h2>
        <p class="text-[13px] text-content-muted mb-6">
          {{ $t("transactionDetail.notFoundDesc") }}
        </p>
        <ion-button fill="outline" @click="router.back()">
          {{ $t("common.back") }}
        </ion-button>
      </div>

      <!-- Detay -->
      <div v-else-if="transaction && typeMeta" class="px-4 pt-4 pb-6">
        <!-- Hero: tür rozeti + kategori ikonu + tutar -->
        <section class="flex flex-col items-center pt-2 pb-6">
          <span
              class="inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-semibold"
              :class="typeMeta.pill"
          >
            <ion-icon :icon="typeMeta.icon" class="size-3" />
            {{ typeMeta.label }}
          </span>

          <div
              class="mt-4 size-16 rounded-2xl flex items-center justify-center"
              :class="category?.icon.color ?? 'bg-slate-400'"
          >
            <ion-icon :icon="getIconByName(category?.icon.name)" class="size-7 text-white" />
          </div>

          <h2 class="mt-4 text-[15px] font-semibold text-content text-center">
            {{ transaction.title || (category && categoryName(category.name)) || $t("transactionDetail.fallbackTitle") }}
          </h2>

          <p
              class="mt-3 text-[34px] leading-none font-extrabold tabular-nums tracking-tight"
              :class="typeMeta.text"
          >
            {{ typeMeta.sign }} {{ amountFormatted }}
          </p>

          <p v-if="amountInBase" class="mt-1 text-[12px] text-content-muted tabular-nums">
            ≈ {{ amountInBase }}
          </p>
        </section>

        <!-- Detay kartı -->
        <section class="bg-surface rounded-2xl overflow-hidden">
          <!-- Kategori -->
          <div class="flex items-center gap-3 px-4 py-3 border-b border-line">
            <div class="size-8 rounded-xl bg-surface-sunken flex items-center justify-center">
              <ion-icon :icon="pricetagOutline" class="size-[15px] text-content-muted" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[11px] text-content-muted">{{ $t("transactions.category") }}</p>
              <div class="flex items-center gap-1.5 mt-0.5">
                <span
                    class="size-2 rounded-full shrink-0"
                    :class="category?.icon.color ?? 'bg-slate-400'"
                />
                <p class="text-[14px] font-medium text-content truncate">
                  {{ category ? categoryName(category.name) : $t("transactionDetail.uncategorized") }}
                </p>
              </div>
            </div>
          </div>

          <!-- Tarih & Saat -->
          <div
              class="flex items-center gap-3 px-4 py-3"
              :class="{ 'border-b border-line': showTitleRow || transaction.description }"
          >
            <div class="size-8 rounded-xl bg-surface-sunken flex items-center justify-center">
              <ion-icon :icon="calendarOutline" class="size-[15px] text-content-muted" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[11px] text-content-muted">{{ $t("transactionDetail.dateTime") }}</p>
              <p class="text-[14px] font-medium text-content mt-0.5">
                {{ dateText }}
                <span class="text-content-muted mx-1">·</span>
                <span class="text-content-muted">{{ timeText }}</span>
              </p>
            </div>
          </div>

          <!-- Başlık (kategori adından farklıysa) -->
          <div
              v-if="showTitleRow"
              class="flex items-center gap-3 px-4 py-3"
              :class="{ 'border-b border-line': transaction.description }"
          >
            <div class="size-8 rounded-xl bg-surface-sunken flex items-center justify-center">
              <ion-icon :icon="documentTextOutline" class="size-[15px] text-content-muted" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[11px] text-content-muted">{{ $t("transactionDetail.titleLabel") }}</p>
              <p class="text-[14px] font-medium text-content mt-0.5 truncate">
                {{ transaction.title }}
              </p>
            </div>
          </div>

          <!-- Açıklama -->
          <div v-if="transaction.description" class="flex items-start gap-3 px-4 py-3">
            <div
                class="size-8 rounded-xl bg-surface-sunken flex items-center justify-center shrink-0 mt-0.5"
            >
              <ion-icon :icon="chatbubbleOutline" class="size-[15px] text-content-muted" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-[11px] text-content-muted">{{ $t("transactionDetail.description") }}</p>
              <p class="text-[14px] text-content mt-0.5 leading-snug whitespace-pre-wrap break-words">
                {{ transaction.description }}
              </p>
            </div>
          </div>
        </section>
      </div>
    </ion-content>

    <!-- Aksiyon barı -->
    <ion-footer v-if="transaction && typeMeta" class="ion-no-border">
      <ion-toolbar class="detail-toolbar">
        <div class="flex gap-2 px-4]">
          <ion-button expand="block" class="app-button flex-1" @click="editTransaction">
            <ion-icon slot="start" :icon="createOutline" class="size-[16px]" />
            {{ $t("common.edit") }}
          </ion-button>
          <ion-button
              expand="block"
              fill="outline"
              class="delete-button flex-1"
              @click="deleteTransaction"
          >
            <ion-icon slot="start" :icon="trashOutline" class="size-[16px]" />
            {{ $t("common.delete") }}
          </ion-button>
        </div>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<style scoped>
.detail-content {
  --background: var(--c-page);
}

.detail-toolbar {
  --background: var(--c-page);
  --border-width: 0;
}

/* Sil butonu: koyu değil — hem light hem dark'a uygun kırmızı outline */
.delete-button {
  --background: transparent;
  --background-activated: rgba(244, 63, 94, 0.12); /* rose-500 */
  --background-hover: rgba(244, 63, 94, 0.08);
  --color: theme('colors.rose.500');
  --border-color: rgba(244, 63, 94, 0.45);
  --border-radius: 1rem;
  --box-shadow: none;
  height: 52px;
  font-size: 15px;
  font-weight: 600;
  text-transform: none;
  letter-spacing: normal;
  margin: 0;
}

html.ion-palette-dark .delete-button {
  --background-activated: rgba(251, 113, 133, 0.16); /* rose-400 */
  --background-hover: rgba(251, 113, 133, 0.12);
  --color: theme('colors.rose.400');
  --border-color: rgba(251, 113, 133, 0.45);
}
</style>
