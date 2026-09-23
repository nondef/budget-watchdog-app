<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
    IonPage,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonContent,
    IonIcon,
    IonBadge,
    IonAlert,
    IonActionSheet,
    IonToast,
    IonSkeletonText,
    alertController,
} from '@ionic/vue'
import {
    pencilOutline,
    trashOutline,
    pauseOutline,
    playOutline,
    refreshOutline,
    walletOutline,
    calendarOutline,
    notificationsOutline,
    ellipsisVertical,
    checkmarkCircleOutline,
    warningOutline,
    alertCircleOutline,
    receiptOutline,
} from 'ionicons/icons'
import { useBudgetStore } from '@/stores/budgets'
import { BudgetDetailOutput } from "@/application";
import { getIconByName } from "@/shared/utils";
import { useMoney } from "@/composables/money/useMoney";
import { useCategoryName } from "@/composables/features/useCategoryName";
import { useCurrencyDisplay } from "@/composables/money/useCurrencyDisplay";
import { formatDateLocalized } from "@/i18n/format";
import { useAppNavigation } from "@/composables/navigation/useAppNavigation";

const route = useRoute()
const router = useRouter()
const { goBackOrFallback } = useAppNavigation()
const { t } = useI18n()
const budgetStore = useBudgetStore()

const budgetId = route.params.id as string
const isActionSheetOpen = ref(false)
const isDeleteAlertOpen = ref(false)
const toastMessage = ref('')
const isToastOpen = ref(false)
const isLoading = ref(true)
const hasError = ref(false)
const budgetDetail = ref<BudgetDetailOutput | null>(null)

const { formatMoney } = useMoney()
const { categoryName } = useCategoryName()
const { currencyName } = useCurrencyDisplay()

const progress = computed(() => {
    if (!budgetDetail.value) return 0
    return Math.min((budgetDetail.value.budget.spentAmount.amount / budgetDetail.value.budget.amount.amount) * 100, 100)
})

const remainingAmount = computed(() => {
    if (!budgetDetail.value) return 0
    return Math.max(budgetDetail.value.budget.amount.amount - budgetDetail.value.budget.spentAmount.amount, 0)
})

const overBudgetAmount = computed(() => {
    if (!budgetDetail.value) return 0
    return budgetDetail.value.budget.spentAmount.amount - budgetDetail.value.budget.amount.amount
})

const isOverBudget = computed(() => {
    if (!budgetDetail.value) return false
    return budgetDetail.value.budget.spentAmount.amount > budgetDetail.value.budget.amount.amount
})

const isWarningLevel = computed(() => {
    if (!budgetDetail.value) return false
    return progress.value >= budgetDetail.value.budget.warningPercentage && !isOverBudget.value
})

const statusIcon = computed(() => {
    if (isOverBudget.value) return alertCircleOutline
    if (isWarningLevel.value) return warningOutline
    return checkmarkCircleOutline
})

// Durum rozeti için token uyumlu pill sınıfları (light/dark otomatik).
const statusPill = computed(() => {
    if (isOverBudget.value) return 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'
    if (isWarningLevel.value) return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
})

// İlerleme çubuğu dolgu rengi.
const barColor = computed(() => {
    if (isOverBudget.value) return 'bg-rose-500'
    if (isWarningLevel.value) return 'bg-amber-500'
    return 'bg-emerald-500'
})

const formatDate = (dateString: string) => formatDateLocalized(new Date(dateString))

const getTypeText = (type: string) => {
    const keys: Record<string, string> = {
        monthly: 'budgets.types.monthly',
        weekly: 'budgets.types.weekly',
        yearly: 'budgets.types.yearly',
        custom: 'budgets.types.custom'
    }
    return keys[type] ? t(keys[type]) : type
}

const getStatusText = (status: string) => {
    const keys: Record<string, string> = {
        active: 'budgets.status.active',
        paused: 'budgets.status.paused',
        completed: 'budgets.status.completed',
        draft: 'budgets.status.draft'
    }
    return keys[status] ? t(keys[status]) : status
}

const editBudget = () => {
    router.push(`/budget/${budgetId}/edit`)
}

const showActionSheet = () => {
    isActionSheetOpen.value = true
}

const pauseResumeBudget = async () => {
    if (!budgetDetail.value) return

    if (budgetDetail.value.budget.status === 'active') {
        await budgetStore.pauseBudget(budgetId)
        showToast(t('budgets.paused'))
    } else if (budgetDetail.value.budget.status === 'paused') {
        await budgetStore.resumeBudget(budgetId)
        showToast(t('budgets.resumed'))
    }
}

const resetBudget = async () => {
    const alert = await alertController.create({
        header: t('budgets.resetTitle'),
        message: t('budgets.resetMessage'),
        buttons: [
            {
                text: t('common.cancel'),
                role: 'cancel'
            },
            {
                text: t('budgets.reset'),
                role: 'destructive',
                handler: async () => {
                    try {
                        await budgetStore.resetBudget(budgetId)

                        // Harcama ve günlük dağılım sıfırlandı; detay yeniden yüklenir.
                        budgetDetail.value = await budgetStore.getBudgetDetail(budgetId)

                        showToast(t('budgets.resetSuccess'))
                    } catch {
                        showToast(t('budgets.resetFailed'))
                    }
                }
            }
        ]
    })

    await alert.present()
}

const deleteBudget = () => {
    budgetStore.deleteBudget(budgetId)
    showToast(t('budgets.deleted'))
    goBackOrFallback('/settings/budget-goals')
}

const showToast = (message: string) => {
    toastMessage.value = message
    isToastOpen.value = true
}

onMounted(async () => {
    try {
        budgetDetail.value = await budgetStore.getBudgetDetail(budgetId)
    } catch {
        hasError.value = true
    } finally {
        isLoading.value = false
    }
})
</script>

<template>
    <ion-page>
        <ion-header class="ion-no-border">
            <ion-toolbar class="detail-toolbar">
                <ion-buttons slot="start">
                    <ion-back-button default-href="/settings/budget-goals" />
                </ion-buttons>
                <ion-title>{{ $t('pageTitles.budgetDetail') }}</ion-title>
                <ion-buttons slot="end">
                    <ion-button
                        v-if="budgetDetail"
                        fill="clear"
                        :aria-label="$t('budgets.actions')"
                        @click="showActionSheet"
                    >
                        <ion-icon slot="icon-only" :icon="ellipsisVertical" />
                    </ion-button>
                </ion-buttons>
            </ion-toolbar>
        </ion-header>

        <ion-content class="detail-content">
            <!-- Loading Skeleton -->
            <div v-if="isLoading" class="px-4 pt-4 space-y-3">
                <section class="bg-surface rounded-2xl p-5">
                    <div class="flex items-center gap-3 mb-4">
                        <ion-skeleton-text :animated="true" style="width: 56px; height: 56px; border-radius: 16px;" />
                        <div class="flex-1">
                            <ion-skeleton-text :animated="true" style="width: 60%; height: 18px;" />
                            <ion-skeleton-text :animated="true" style="width: 40%; height: 13px; margin-top: 6px;" />
                        </div>
                    </div>
                    <ion-skeleton-text :animated="true" style="width: 100%; height: 8px; border-radius: 4px; margin-bottom: 16px;" />
                    <div class="grid grid-cols-2 gap-3">
                        <ion-skeleton-text :animated="true" style="width: 100%; height: 64px; border-radius: 12px;" />
                        <ion-skeleton-text :animated="true" style="width: 100%; height: 64px; border-radius: 12px;" />
                    </div>
                </section>
                <section class="bg-surface rounded-2xl p-4">
                    <ion-skeleton-text v-for="i in 3" :key="i" :animated="true" style="width: 100%; height: 44px; margin-bottom: 8px; border-radius: 12px;" />
                </section>
            </div>

            <!-- Budget Detail -->
            <div v-else-if="budgetDetail" class="px-4 pt-4 pb-6 space-y-3">
                <!-- Hero -->
                <section class="bg-surface rounded-2xl p-5">
                    <div class="flex items-start justify-between mb-4">
                        <div class="flex items-center gap-3 min-w-0">
                            <div
                                class="size-14 rounded-2xl flex items-center justify-center shrink-0"
                                :class="budgetDetail.budget.icon.color"
                            >
                                <ion-icon :icon="getIconByName(budgetDetail.budget.icon.name)" class="size-6 text-white" />
                            </div>
                            <div class="min-w-0">
                                <h1 class="text-[17px] font-bold text-content truncate">{{ budgetDetail.budget.name }}</h1>
                                <p
                                    v-for="category in budgetDetail.categories"
                                    :key="category.id"
                                    class="text-[12px] text-content-muted truncate"
                                >
                                    {{ category ? categoryName(category.name) : '' }}
                                </p>
                            </div>
                        </div>
                        <span
                            class="inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-semibold shrink-0"
                            :class="statusPill"
                        >
                            <ion-icon :icon="statusIcon" class="size-3" />
                            {{ getStatusText(budgetDetail.budget.status) }}
                        </span>
                    </div>

                    <!-- İlerleme -->
                    <div class="flex items-center justify-between mb-1.5">
                        <span class="text-[12px] font-medium text-content-muted">{{ $t('budgets.spent') }}</span>
                        <span
                            class="text-[12px] font-semibold tabular-nums"
                            :class="isOverBudget ? 'text-rose-600' : 'text-content'"
                        >
                            {{ Math.round(progress) }}%
                        </span>
                    </div>
                    <div class="h-2 rounded-full bg-surface-sunken overflow-hidden">
                        <div
                            class="h-full rounded-full transition-all"
                            :class="barColor"
                            :style="{ width: progress + '%' }"
                        />
                    </div>

                    <!-- Harcanan / Kalan -->
                    <div class="grid grid-cols-2 gap-3 mt-4">
                        <div class="text-center p-3 bg-surface-sunken rounded-xl">
                            <p class="text-[19px] font-bold text-content tabular-nums">
                                {{ formatMoney(budgetDetail.budget.spentAmount.amount, budgetDetail.budget.spentAmount.currencyId) }}
                            </p>
                            <p class="text-[11px] text-content-muted mt-0.5">{{ $t('budgets.spent') }}</p>
                        </div>
                        <div class="text-center p-3 bg-surface-sunken rounded-xl">
                            <p
                                class="text-[19px] font-bold tabular-nums"
                                :class="isOverBudget ? 'text-rose-600' : 'text-emerald-600'"
                            >
                                {{ isOverBudget ? '-' : '' }}{{ formatMoney(isOverBudget ? overBudgetAmount : remainingAmount, budgetDetail.budget.amount.currencyId) }}
                            </p>
                            <p class="text-[11px] text-content-muted mt-0.5">{{ isOverBudget ? $t('budgets.over') : $t('budgets.remaining') }}</p>
                        </div>
                    </div>

                    <p class="mt-4 text-center text-[13px] font-medium text-content-secondary">
                        {{ $t('budgets.totalBudget') }}:
                        <span class="tabular-nums">{{ formatMoney(budgetDetail.budget.amount.amount, budgetDetail.budget.amount.currencyId) }}</span>
                    </p>
                </section>

                <!-- İşlemler -->
                <section class="bg-surface rounded-2xl overflow-hidden">
                    <h3 class="px-4 pt-4 pb-2 text-[13px] font-semibold text-content">{{ $t('budgets.transactionsTitle') }}</h3>
                    <template v-if="budgetDetail.transactions.length > 0">
                        <div
                            v-for="transaction in budgetDetail.transactions"
                            :key="transaction.id"
                            class="flex items-center gap-3 px-4 py-3 border-t border-line"
                        >
                            <div class="flex-1 min-w-0">
                                <p class="text-[14px] font-medium text-content truncate">{{ transaction.title }}</p>
                                <p class="text-[12px] text-content-muted tabular-nums">
                                    {{ formatMoney(transaction.amount.amount, transaction.amount.currencyId) }}
                                </p>
                            </div>
                            <ion-badge :color="transaction.type === 'income' ? 'success' : 'danger'">
                                {{ transaction.type === 'income' ? $t('common.income') : $t('common.expense') }}
                            </ion-badge>
                        </div>
                    </template>
                    <div v-else class="flex flex-col items-center py-6 text-content-faint">
                        <ion-icon :icon="receiptOutline" class="size-9 mb-2" />
                        <p class="text-[13px]">{{ $t('budgets.noTransactions') }}</p>
                    </div>
                </section>

                <!-- Bilgiler -->
                <section class="bg-surface rounded-2xl overflow-hidden">
                    <h3 class="px-4 pt-4 pb-2 text-[13px] font-semibold text-content">{{ $t('budgets.infoTitle') }}</h3>

                    <div class="flex items-center gap-3 px-4 py-3 border-t border-line">
                        <div class="size-8 rounded-xl bg-surface-sunken flex items-center justify-center shrink-0">
                            <ion-icon :icon="calendarOutline" class="size-[15px] text-content-muted" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-[11px] text-content-muted">{{ $t('budgets.period') }}</p>
                            <p class="text-[14px] font-medium text-content mt-0.5">{{ getTypeText(budgetDetail.budget.type) }}</p>
                        </div>
                    </div>

                    <div class="flex items-center gap-3 px-4 py-3 border-t border-line">
                        <div class="size-8 rounded-xl bg-surface-sunken flex items-center justify-center shrink-0">
                            <ion-icon :icon="calendarOutline" class="size-[15px] text-content-muted" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-[11px] text-content-muted">{{ $t('budgets.startDate') }}</p>
                            <p class="text-[14px] font-medium text-content mt-0.5">{{ formatDate(new Date(budgetDetail.budget.startDate).toISOString()) }}</p>
                        </div>
                    </div>

                    <div v-if="budgetDetail.budget.endDate" class="flex items-center gap-3 px-4 py-3 border-t border-line">
                        <div class="size-8 rounded-xl bg-surface-sunken flex items-center justify-center shrink-0">
                            <ion-icon :icon="calendarOutline" class="size-[15px] text-content-muted" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-[11px] text-content-muted">{{ $t('budgets.endDate') }}</p>
                            <p class="text-[14px] font-medium text-content mt-0.5">{{ formatDate(new Date(budgetDetail.budget.endDate).toISOString()) }}</p>
                        </div>
                    </div>

                    <div v-if="budgetDetail.currency" class="flex items-center gap-3 px-4 py-3 border-t border-line">
                        <div class="size-8 rounded-xl bg-surface-sunken flex items-center justify-center shrink-0">
                            <ion-icon :icon="walletOutline" class="size-[15px] text-content-muted" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-[11px] text-content-muted">{{ $t('budgets.currency') }}</p>
                            <p class="text-[14px] font-medium text-content mt-0.5">{{ currencyName(budgetDetail.currency) }} ({{ budgetDetail.currency.symbol }})</p>
                        </div>
                    </div>

                    <div v-if="budgetDetail.account" class="flex items-center gap-3 px-4 py-3 border-t border-line">
                        <div class="size-8 rounded-xl bg-surface-sunken flex items-center justify-center shrink-0">
                            <ion-icon :icon="walletOutline" class="size-[15px] text-content-muted" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-[11px] text-content-muted">{{ $t('budgets.linkedAccount') }}</p>
                            <p class="text-[14px] font-medium text-content mt-0.5">{{ budgetDetail.account.name }}</p>
                        </div>
                    </div>
                </section>

                <!-- Uyarılar & Limitler -->
                <section class="bg-surface rounded-2xl overflow-hidden">
                    <h3 class="px-4 pt-4 pb-2 text-[13px] font-semibold text-content">{{ $t('budgets.alertsLimits') }}</h3>

                    <div class="flex items-center gap-3 px-4 py-3 border-t border-line">
                        <div class="size-8 rounded-xl bg-surface-sunken flex items-center justify-center shrink-0">
                            <ion-icon :icon="warningOutline" class="size-[15px] text-content-muted" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-[11px] text-content-muted">{{ $t('budgets.warningPercentage') }}</p>
                            <p class="text-[14px] font-medium text-content mt-0.5">{{ $t('budgets.warnAtPercent', { percent: budgetDetail.budget.warningPercentage }) }}</p>
                        </div>
                    </div>

                    <div class="flex items-center gap-3 px-4 py-3 border-t border-line">
                        <div class="size-8 rounded-xl bg-surface-sunken flex items-center justify-center shrink-0">
                            <ion-icon :icon="notificationsOutline" class="size-[15px] text-content-muted" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-[11px] text-content-muted">{{ $t('budgets.notifications') }}</p>
                            <p class="text-[14px] font-medium text-content mt-0.5">
                                {{ budgetDetail.budget.enableNotifications ? $t('budgets.active') : $t('budgets.passive') }}
                            </p>
                        </div>
                    </div>
                </section>

                <!-- Not -->
                <section v-if="budgetDetail.budget.note" class="bg-surface rounded-2xl p-4">
                    <h3 class="text-[13px] font-semibold text-content mb-2">{{ $t('budgets.notesTitle') }}</h3>
                    <p class="text-[14px] text-content-secondary leading-snug whitespace-pre-wrap break-words">
                        {{ budgetDetail.budget.note }}
                    </p>
                </section>
            </div>

            <!-- Error / Not Found State -->
            <div v-else class="flex flex-col items-center justify-center h-full px-8 text-center">
                <ion-icon :icon="alertCircleOutline" class="size-14 text-content-faint mb-3" />
                <h2 class="text-[16px] font-semibold text-content mb-1">
                    {{ hasError ? $t('budgets.errorOccurred') : $t('budgets.notFoundTitle') }}
                </h2>
                <p class="text-[13px] text-content-muted mb-6">
                    {{ hasError ? $t('budgets.errorDesc') : $t('budgets.notFoundDesc') }}
                </p>
                <ion-button fill="outline" router-link="/budgets">
                    {{ $t('budgets.backToBudgets') }}
                </ion-button>
            </div>

            <!-- Action Sheet -->
            <ion-action-sheet :is-open="isActionSheetOpen" :header="$t('budgets.actions')" :buttons="[
                {
                    text: $t('common.edit'),
                    icon: pencilOutline,
                    handler: editBudget
                },
                {
                    text: budgetDetail?.budget?.status === 'active' ? $t('budgets.pause') : $t('budgets.resume'),
                    icon: budgetDetail?.budget?.status === 'active' ? pauseOutline : playOutline,
                    handler: pauseResumeBudget
                },
                {
                    text: $t('budgets.reset'),
                    icon: refreshOutline,
                    handler: resetBudget
                },
                {
                    text: $t('common.delete'),
                    role: 'destructive',
                    icon: trashOutline,
                    handler: () => { isDeleteAlertOpen = true }
                },
                {
                    text: $t('common.cancel'),
                    role: 'cancel'
                }
            ]" @didDismiss="isActionSheetOpen = false" />

            <!-- Delete Confirmation -->
            <ion-alert :is-open="isDeleteAlertOpen" :header="$t('budgets.deleteTitle')"
                :message="$t('budgets.deleteMessage')" :buttons="[
                    {
                        text: $t('common.cancel'),
                        role: 'cancel',
                        handler: () => { isDeleteAlertOpen = false }
                    },
                    {
                        text: $t('common.delete'),
                        role: 'destructive',
                        handler: deleteBudget
                    }
                ]" @didDismiss="isDeleteAlertOpen = false" />

            <!-- Toast -->
            <ion-toast :is-open="isToastOpen" :message="toastMessage" :duration="2000"
                @didDismiss="isToastOpen = false" />
        </ion-content>
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
