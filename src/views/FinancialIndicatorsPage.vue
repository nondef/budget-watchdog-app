<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed } from 'vue'
import {
  IonPage,
  IonContent,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  IonToolbar,
  IonHeader,
  IonBackButton,
  IonTitle,
  IonButton,
  IonButtons,
  IonSegment,
  IonSegmentButton,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonCard,
  IonCardContent,
  IonSpinner,
  type RefresherCustomEvent,
} from '@ionic/vue'
import {
  refreshOutline,
  arrowUpOutline,
  arrowDownOutline,
  starOutline,
  star,
  alertCircleOutline,
  swapVerticalOutline,
  chevronBackOutline
} from 'ionicons/icons'
import { useI18n } from 'vue-i18n'
import { useMarketStore, type MarketSegment, type ChangeMode } from '@/stores/market'

const marketStore = useMarketStore()
const { locale } = useI18n()

const segments: MarketSegment[] = ['fiat', 'metal', 'crypto']
const changeModes: ChangeMode[] = ['session', 'fetch']

/** Segment/mod seçimleri store action'larından geçsin (mod kalıcılaşıyor). */
const activeSegment = computed({
  get: () => marketStore.segment,
  set: (value: MarketSegment) => marketStore.setSegment(value),
})

const activeChangeMode = computed({
  get: () => marketStore.changeMode,
  set: (value: ChangeMode) => marketStore.setChangeMode(value),
})

/**
 * Refresher'ın `complete()`'i yalnızca aşağı-çek olayında var; başlıktaki
 * butondan çağrılınca event MouseEvent olurdu ve `event.target.complete`
 * patlıyordu — bu yüzden buton `handleRefresh()` ile argümansız çağırır.
 * Hata durumunda da spinner kapansın diye complete `finally` içinde.
 */
const handleRefresh = async (event?: RefresherCustomEvent) => {
  try {
    await marketStore.refreshCurrencies()
  } finally {
    await event?.target.complete()
  }
}

const skeletons = Array.from({ length: 6 })

const formatRate = (n: number) =>
    new Intl.NumberFormat(locale.value, { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n)

const formatChange = (n: number) =>
    `${n > 0 ? '+' : ''}${n.toFixed(2)}%`

const hasData = computed(() => marketStore.visibleCurrencies.length > 0)
const isEmptyOther = computed(
    () => marketStore.segment !== 'fiat' && marketStore.visibleCurrencies.length === 0
)
const showStaleWarning = computed(() =>
    marketStore.isDataStale && !marketStore.isLoading && !marketStore.error && hasData.value
)

onMounted(() => {
  marketStore.initialize()
})

onBeforeUnmount(() => {
  marketStore.stopRefreshTimer()
})
</script>

<template>
  <ion-page>
    <!-- Üst bar -->
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" :icon="chevronBackOutline"/>
        </ion-buttons>

        <ion-title class="text-xl font-semibold">
          {{ $t('nav.market') }}
        </ion-title>

        <ion-buttons slot="end">
          <ion-button
              :disabled="!marketStore.canRefresh || marketStore.isLoading"
              :aria-label="$t('market.refresh')"
              @click="handleRefresh()"
          >
            <ion-spinner v-if="marketStore.isLoading" name="crescent" class="size-[18px]" />
            <ion-icon v-else :icon="refreshOutline" class="size-[18px]" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="market-content" :scroll-y="true">
      <ion-refresher slot="fixed" @ion-refresh="handleRefresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="px-4">
        <!-- Son güncelleme -->
        <div class="market-status">
          <span class="market-status__left">
            <span class="market-dot" :class="marketStore.isDataStale ? 'market-dot--stale' : 'market-dot--fresh'" />
            <ion-note class="market-status__text">
              <template v-if="marketStore.lastUpdateLabel">
                {{ $t('market.lastUpdate', { time: marketStore.lastUpdateLabel }) }}
              </template>
              <template v-else>{{ $t('market.neverUpdated') }}</template>
            </ion-note>
          </span>
          <ion-note v-if="!marketStore.canRefresh" class="market-status__text tabular-nums">
            {{ $t('market.cooldown', { seconds: marketStore.refreshCountdown }) }}
          </ion-note>
        </div>

        <!-- Segment seçici -->
        <ion-segment v-model="activeSegment" class="market-segment">
          <ion-segment-button
              v-for="s in segments"
              :key="s"
              :value="s"
              class="market-segment__button"
              :class="{ 'market-segment__button--active': activeSegment === s }"
          >
            <ion-label>{{ $t(`market.segments.${s}`) }}</ion-label>
          </ion-segment-button>
        </ion-segment>

        <!-- Değişim modu (sadece fiat) -->
        <div v-if="marketStore.segment === 'fiat'" class="market-mode">
          <ion-note class="market-mode__label">{{ $t('market.changeLabel') }}</ion-note>
          <ion-segment v-model="activeChangeMode" class="market-mode__segment">
            <ion-segment-button
                v-for="m in changeModes"
                :key="m"
                :value="m"
                class="market-mode__button"
                :class="{ 'market-mode__button--active': activeChangeMode === m }"
            >
              <ion-label>
                {{ m === 'session' ? $t('market.changeSession') : $t('market.changeFetch') }}
              </ion-label>
            </ion-segment-button>
          </ion-segment>
        </div>

        <!-- Stale uyarı -->
        <div v-if="showStaleWarning" class="market-alert market-alert--warning">
          <ion-icon :icon="alertCircleOutline" class="market-alert__icon" />
          <ion-note class="market-alert__text">{{ $t('market.staleWarning') }}</ion-note>
        </div>

        <!-- Hata -->
        <div v-if="marketStore.error && !marketStore.isLoading" class="market-alert market-alert--danger">
          <ion-icon :icon="alertCircleOutline" class="market-alert__icon" />
          <div class="flex-1 min-w-0">
            <p class="market-alert__title">{{ $t('market.loadFailed') }}</p>
            <ion-note class="market-alert__text">{{ marketStore.error }}</ion-note>

            <ion-button
                expand="block"
                size="small"
                fill="outline"
                color="danger"
                class="market-alert__action"
                :disabled="!marketStore.canRefresh"
                @click="handleRefresh()"
            >
              {{ $t('market.retry') }}
            </ion-button>
          </div>
        </div>
      </div>

      <!-- Favoriler -->
      <div v-if="marketStore.segment === 'fiat' && marketStore.favoriteCurrencies.length > 0" class="mt-5">
        <p class="market-section px-5">{{ $t('market.favorites') }}</p>

        <div class="overflow-x-auto no-scrollbar">
          <div class="flex gap-2 px-4 pb-1">
            <ion-card
                v-for="c in marketStore.favoriteCurrencies"
                :key="c.code"
                class="favorite-chip"
            >
              <ion-card-content class="favorite-chip__content">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="favorite-chip__code">{{ c.code }}</span>
                  <ion-icon
                      :icon="c.change >= 0 ? arrowUpOutline : arrowDownOutline"
                      class="size-3"
                      :class="c.change >= 0 ? 'market-up' : 'market-down'"
                  />
                </div>
                <div class="favorite-chip__rate tabular-nums">{{ formatRate(c.mid) }}</div>
                <div
                    class="favorite-chip__change tabular-nums"
                    :class="c.change >= 0 ? 'market-up' : 'market-down'"
                >
                  {{ formatChange(c.change) }}
                </div>
              </ion-card-content>
            </ion-card>
          </div>
        </div>
      </div>

      <!-- Liste -->
      <div class="mt-5 px-4 pb-10">
        <div class="market-card">
          <ion-list :inset="false" lines="full">
            <!-- Tablo başlığı (sadece fiat) -->
            <ion-item
                v-if="marketStore.segment === 'fiat' && hasData"
                class="plain-item market-head"
                lines="full"
                :button="false"
            >
              <div slot="start" class="market-star-spacer" />
              <ion-label class="market-head__cell">{{ $t('market.columns.unit') }}</ion-label>
              <div slot="end" class="market-cells">
                <span class="market-cells__change market-head__cell">{{ $t('market.columns.change') }}</span>
                <span class="market-cells__rate market-head__cell">{{ $t('market.columns.buying') }}</span>
                <span class="market-cells__rate market-head__cell">{{ $t('market.columns.selling') }}</span>
              </div>
            </ion-item>

            <!-- Skeleton -->
            <template v-if="marketStore.isLoading && !hasData">
              <ion-item
                  v-for="(_, i) in skeletons"
                  :key="i"
                  class="plain-item"
                  :lines="i === skeletons.length - 1 ? 'none' : 'full'"
                  :button="false"
              >
                <div slot="start" class="market-star-spacer" />
                <ion-label>
                  <ion-skeleton-text animated style="width: 40%; height: 12px;" />
                  <ion-skeleton-text animated style="width: 60%; height: 9px; margin-top: 4px;" />
                </ion-label>
                <ion-skeleton-text slot="end" animated style="width: 50px; height: 14px;" />
              </ion-item>
            </template>

            <!-- Empty (metal/crypto) -->
            <div v-else-if="isEmptyOther" class="market-empty">
              <div class="market-empty__icon">
                <ion-icon :icon="swapVerticalOutline" class="size-6" />
              </div>
              <ion-note class="market-empty__text">{{ $t('market.comingSoon') }}</ion-note>
            </div>

            <!-- Satırlar -->
            <template v-else>
              <ion-item
                  v-for="(c, idx) in marketStore.visibleCurrencies"
                  :key="c.code"
                  class="plain-item"
                  :lines="idx === marketStore.visibleCurrencies.length - 1 ? 'none' : 'full'"
                  :detail="false"
              >
                <ion-button
                    slot="start"
                    fill="clear"
                    size="small"
                    class="market-star"
                    :aria-label="marketStore.isFavorite(c.code) ? $t('market.removeFavorite') : $t('market.addFavorite')"
                    @click.stop="marketStore.toggleFavorite(c.code)"
                >
                  <ion-icon
                      slot="icon-only"
                      :icon="marketStore.isFavorite(c.code) ? star : starOutline"
                      :class="marketStore.isFavorite(c.code) ? 'market-star--on' : 'market-star--off'"
                  />
                </ion-button>

                <ion-label>
                  <h3 class="market-code">{{ c.code }}</h3>
                  <p class="market-name">{{ c.name }}</p>
                </ion-label>

                <div slot="end" class="market-cells">
                  <span
                      class="market-cells__change tabular-nums"
                      :class="c.change >= 0 ? 'market-up' : 'market-down'"
                  >
                    {{ formatChange(c.change) }}
                  </span>
                  <span class="market-cells__rate tabular-nums">{{ formatRate(c.buying) }}</span>
                  <span class="market-cells__rate tabular-nums">{{ formatRate(c.selling) }}</span>
                </div>
              </ion-item>
            </template>
          </ion-list>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.market-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}

/* ── Durum çubuğu ─────────────────────────────────────────────────── */
.market-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  padding-inline: 4px;
}

.market-status__left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.market-status__text {
  font-size: 11px;
  color: var(--c-content-muted);
}

.market-dot {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  flex-shrink: 0;
}

/* Sabit hue'lar: tint değil dolu nokta olduğu için her iki temada okunur. */
.market-dot--fresh { background: #10b981; }
.market-dot--stale { background: #f59e0b; }

/* ── Segmentler ───────────────────────────────────────────────────── */
.market-segment {
  --background: var(--c-surface);
  margin-top: 16px;
  border-radius: 1rem;
  padding: 4px;
}

/* Seçili ZEMİN yalnız `--active` sınıfından gelir (`--background-checked` de
   boyarsa iki kaynak bir kare boyunca farklı butonu vurgulayabiliyor), ama
   METİN rengi `--color-checked` ile de verilmeli: Ionic seçili butonda
   `color: var(--color-checked)` okur, tanımsız bırakılırsa kendi nötr
   varsayılanına düşüyor ve çip zeminiyle aynı tona gelip okunmaz oluyordu. */
.market-segment__button {
  --border-radius: 0.75rem;
  --color: var(--c-content-tertiary);
  --color-checked: var(--c-inverse-on-surface);
  min-height: 36px;
  font-size: 12px;
  font-weight: 600;
  text-transform: none;
}

/* Ionic seçili çipi `segment-button-checked` sınıfıyla boyar, o sınıf da
   Stencil'in yazma kuyruğundan geçer; seçili zemini/metnini doğrudan seçili
   değere bağlayarak her koşulda doğru butonda tutuyoruz. */
.market-segment__button--active {
  --color: var(--c-inverse-on-surface);
  background: var(--c-inverse-surface);
  border-radius: 0.75rem;
}

/* MD'de indicator butonun ALTINDA 2px'lik bir çizgi olarak çizilir; seçili
   durumu çip zemini verdiği için o çizgi fazlalık (projedeki diğer
   segmentlerde de böyle kapatılıyor). */
.market-segment ion-segment-button::part(indicator),
.market-mode__segment ion-segment-button::part(indicator) {
  display: none;
}

.market-mode {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-inline: 4px;
}

.market-mode__label {
  font-size: 11px;
  color: var(--c-content-muted);
  flex-shrink: 0;
}

.market-mode__segment {
  --background: var(--c-surface-sunken);
  border-radius: 9999px;
  padding: 2px;
  width: auto;
}

.market-mode__button {
  --border-radius: 9999px;
  --color: var(--c-content-muted);
  --color-checked: var(--c-content);
  --padding-start: 12px;
  --padding-end: 12px;
  min-height: 28px;
  font-size: 11px;
  font-weight: 600;
  text-transform: none;
}

.market-mode__button--active {
  --color: var(--c-content);
  background: var(--c-surface);
  border-radius: 9999px;
}

/* ── Uyarı / hata kutuları ────────────────────────────────────────── */
.market-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 1rem;
}

/* Yarı şeffaf hue tint: light'ta pastel, dark'ta koyu zemine karışır. */
.market-alert--warning {
  background: rgb(245 158 11 / 0.14);
}

.market-alert--danger {
  background: rgb(244 63 94 / 0.12);
}

.market-alert__icon {
  width: 14px;
  height: 14px;
  margin-top: 2px;
  flex-shrink: 0;
}

.market-alert--warning .market-alert__icon { color: #d97706; }
.market-alert--danger .market-alert__icon { color: #e11d48; }

html.ion-palette-dark .market-alert--warning .market-alert__icon { color: #fbbf24; }
html.ion-palette-dark .market-alert--danger .market-alert__icon { color: #fb7185; }

.market-alert__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--c-content);
}

.market-alert__text {
  display: block;
  font-size: 11px;
  line-height: 1.45;
  color: var(--c-content-secondary);
}

.market-alert__action {
  margin-top: 10px;
  --border-radius: 0.75rem;
  text-transform: none;
}

/* ── Favori çipleri ───────────────────────────────────────────────── */
.market-section {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--c-content-muted);
  margin-bottom: 8px;
}

.favorite-chip {
  min-width: 120px;
  margin: 0;
  border-radius: 1rem;
  /* Kart yüzeyi tokendan: eskiden sabit #fff olduğu için dark modda
     beyaz kart olarak patlıyordu. */
  --background: var(--c-surface);
  box-shadow: none;
}

.favorite-chip__content {
  padding: 10px 12px;
}

.favorite-chip__code {
  font-size: 13px;
  font-weight: 700;
  color: var(--c-content);
}

.favorite-chip__rate {
  font-size: 15px;
  font-weight: 700;
  color: var(--c-content);
}

.favorite-chip__change {
  font-size: 11px;
  font-weight: 600;
  margin-top: 2px;
}

.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }

/* ── Liste ────────────────────────────────────────────────────────── */
.market-card {
  background: var(--c-surface);
  border-radius: 1rem;
  overflow: hidden;
}

.market-card ion-list {
  background: transparent;
  padding: 0;
  margin: 0;
}

.market-card ion-item.plain-item {
  --background: transparent;
  --background-activated: var(--c-surface-sunken);
  --background-focused: var(--c-surface-sunken);
  --background-hover: transparent;
  --border-color: var(--c-line);
  --padding-start: 8px;
  --inner-padding-end: 10px;
  --min-height: 56px;
}

.market-card ion-item.market-head {
  --min-height: 34px;
}

.market-head__cell {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--c-content-muted);
}

.market-star {
  --padding-start: 4px;
  --padding-end: 4px;
  margin-inline-end: 4px;
  height: 28px;
  width: 28px;
  min-width: 28px;
}

.market-star--on { color: #f59e0b; }
.market-star--off { color: var(--c-content-muted); }

/* Başlık satırı yıldız kolonuyla hizalansın: ion-button'ın kendi 2px yan
   boşluğu da hesaba katılır, aksi halde "Birim" 2px kayıyor. */
.market-star-spacer {
  width: 28px;
  margin-inline-start: 2px;
  margin-inline-end: 4px;
  flex-shrink: 0;
}

.market-code {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-content);
}

.market-name {
  font-size: 11px;
  color: var(--c-content-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.market-cells {
  display: flex;
  align-items: center;
  gap: 8px;
}

.market-cells__change {
  width: 56px;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
}

.market-cells__rate {
  width: 72px;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: var(--c-content);
}

/* Artış/azalış renkleri: dark modda okunur tonlara yükseltilir. */
.market-up { color: #059669; }
.market-down { color: #e11d48; }

html.ion-palette-dark .market-up { color: #34d399; }
html.ion-palette-dark .market-down { color: #fb7185; }

/* ── Boş durum ────────────────────────────────────────────────────── */
.market-empty {
  padding: 48px 16px;
  text-align: center;
}

.market-empty__icon {
  width: 3rem;
  height: 3rem;
  border-radius: 1rem;
  background: var(--c-surface-sunken);
  color: var(--c-content-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
}

.market-empty__text {
  display: block;
  margin-top: 12px;
  font-size: 13px;
  color: var(--c-content-muted);
}
</style>
