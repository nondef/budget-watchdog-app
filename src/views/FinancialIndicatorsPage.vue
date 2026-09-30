<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed } from 'vue'
import {
  IonPage,
  IonContent,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  IonButton,
  IonSegment,
  IonSegmentButton,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonCard,
  IonCardContent,
  IonSpinner,
  type RefresherCustomEvent
} from '@ionic/vue'
import {
  refreshOutline,
  arrowUpOutline,
  arrowDownOutline,
  starOutline,
  star,
  alertCircleOutline,
  swapVerticalOutline
} from 'ionicons/icons'
import { useI18n } from 'vue-i18n'
import { useMarketStore, type MarketSegment, type ChangeMode } from '@/stores/market'

import SubPageHeader from '@/components/SubPageHeader.vue';
import AnimatedHeight from '@/components/AnimatedHeight.vue';
import CollapseTransition from '@/components/CollapseTransition.vue';
import SwapText from '@/components/SwapText.vue';
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
    <sub-page-header :title="$t('nav.market')">
      <template #end>
        <ion-button
          class="refresh-action"
          :disabled="!marketStore.canRefresh || marketStore.isLoading"
          :aria-label="$t('market.refresh')"
          @click="handleRefresh()"
        >
          <transition name="icon-swap" mode="out-in">
            <ion-spinner v-if="marketStore.isLoading" name="crescent" class="size-[18px]" />
            <ion-icon v-else :icon="refreshOutline" class="size-[18px]" />
          </transition>
        </ion-button>
      </template>
    </sub-page-header>

    <ion-content class="market-content" :scroll-y="true">
      <ion-refresher slot="fixed" @ion-refresh="handleRefresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="mx-auto w-full max-w-2xl px-4">
        <ion-card class="market-controls">
        <ion-card-content class="market-controls__content">
        <!-- Son güncelleme -->
        <div class="market-status">
          <span class="market-status__left">
            <span class="market-dot" :class="marketStore.isDataStale ? 'market-dot--stale' : 'market-dot--fresh'" />
            <ion-note class="market-status__text">
              <swap-text
                  :text="marketStore.lastUpdateLabel
                      ? $t('market.lastUpdate', { time: marketStore.lastUpdateLabel })
                      : $t('market.neverUpdated')"
              />
            </ion-note>
          </span>
          <transition name="fade">
            <ion-note v-if="!marketStore.canRefresh" class="market-status__text tabular-nums">
              {{ $t('market.cooldown', { seconds: marketStore.refreshCountdown }) }}
            </ion-note>
          </transition>
        </div>

        <!-- Segment seçici -->
        <ion-segment v-model="activeSegment" mode="md" class="market-segment" :aria-label="$t('nav.market')">
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

        <!-- Değişim modu (sadece fiat): segment değişince yerinde açılır/katlanır. -->
        <collapse-transition>
        <div v-if="marketStore.segment === 'fiat'" class="market-mode">
          <ion-note class="market-mode__label">{{ $t('market.changeLabel') }}</ion-note>
          <ion-segment v-model="activeChangeMode" mode="md" class="market-mode__segment" :aria-label="$t('market.changeLabel')">
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
        </collapse-transition>

        <!-- Stale uyarı -->
        <collapse-transition>
        <div v-if="showStaleWarning" class="market-alert market-alert--warning" role="status">
          <ion-icon :icon="alertCircleOutline" class="market-alert__icon" />
          <ion-note class="market-alert__text">{{ $t('market.staleWarning') }}</ion-note>
        </div>
        </collapse-transition>

        <!-- Hata -->
        <collapse-transition>
        <div v-if="marketStore.error && !marketStore.isLoading" class="market-alert market-alert--danger" role="alert">
          <ion-icon :icon="alertCircleOutline" class="market-alert__icon" />
          <div class="flex-1 min-w-0">
            <p class="market-alert__title">{{ $t('market.loadFailed') }}</p>
            <ion-note class="market-alert__text">{{ marketStore.error }}</ion-note>

            <ion-button
                expand="block"
                size="small"
                fill="outline"
                class="market-alert__action"
                :disabled="!marketStore.canRefresh"
                @click="handleRefresh()"
            >
              {{ $t('market.retry') }}
            </ion-button>
          </div>
        </div>
        </collapse-transition>
        </ion-card-content>
        </ion-card>
      </div>

      <!-- Favoriler: ilk favori eklenince bölüm açılır, son favori çıkınca
           katlanır; kartlar yıldıza basıldıkça solarak girer/çıkar. Yatay
           şeritte çıkanı akıştan almak (list-row) yerleşimi bozar, bu yüzden fade. -->
      <collapse-transition>
      <div v-if="marketStore.segment === 'fiat' && marketStore.favoriteCurrencies.length > 0" class="mx-auto mt-5 w-full max-w-2xl">
        <p class="market-section px-4">{{ $t('market.favorites') }}</p>

        <div class="overflow-x-auto no-scrollbar">
          <transition-group tag="div" name="fade" class="flex gap-2 px-4 pb-1">
            <ion-card
                v-for="c in marketStore.favoriteCurrencies"
                :key="c.code"
                class="favorite-chip"
            >
              <ion-card-content class="favorite-chip__content">
                <div class="flex items-center justify-between mb-3">
                  <span class="favorite-chip__code">{{ c.code }}</span>
                  <ion-icon
                      :icon="c.change >= 0 ? arrowUpOutline : arrowDownOutline"
                      class="size-3"
                      :class="c.change >= 0 ? 'market-up' : 'market-down'"
                  />
                </div>
                <swap-text class="block favorite-chip__rate tabular-nums" :text="formatRate(c.mid)" />
                <swap-text
                    class="block favorite-chip__change tabular-nums"
                    :class="c.change >= 0 ? 'market-up' : 'market-down'"
                    :text="formatChange(c.change)"
                />
              </ion-card-content>
            </ion-card>
          </transition-group>
        </div>
      </div>
      </collapse-transition>

      <!-- Liste: segment değişince kart yüksekliği yumuşakça değişir;
           yenilemede kurlar yerinde kayarak güncellenir. -->
      <div class="mx-auto mt-5 w-full max-w-2xl px-4 pb-10">
        <ion-card class="market-card">
          <animated-height>
          <ion-list :inset="false" lines="full">
            <!-- Tablo başlığı (sadece fiat) -->
            <ion-item
                v-if="marketStore.segment === 'fiat' && hasData"
                class="plain-item market-head"
                lines="full"
                :button="false"
            >
              <div class="market-row-content">
                <span aria-hidden="true" />
                <span class="market-head__cell">{{ $t('market.columns.unit') }}</span>
                <span class="market-head__cell market-number">{{ $t('market.columns.change') }}</span>
                <span class="market-head__cell market-number">{{ $t('market.columns.buying') }}</span>
                <span class="market-head__cell market-number">{{ $t('market.columns.selling') }}</span>
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
                <div class="market-row-content">
                <ion-button
                    fill="clear"
                    size="small"
                    class="market-star"
                    :aria-label="`${c.code}: ${marketStore.isFavorite(c.code) ? $t('market.removeFavorite') : $t('market.addFavorite')}`"
                    :aria-pressed="marketStore.isFavorite(c.code)"
                    @click.stop="marketStore.toggleFavorite(c.code)"
                >
                  <transition name="icon-swap" mode="out-in">
                    <ion-icon
                        slot="icon-only"
                        :key="String(marketStore.isFavorite(c.code))"
                        :icon="marketStore.isFavorite(c.code) ? star : starOutline"
                        :class="marketStore.isFavorite(c.code) ? 'market-star--on' : 'market-star--off'"
                    />
                  </transition>
                </ion-button>

                <ion-label class="market-identity">
                  <h3 class="market-code">{{ c.code }}</h3>
                  <p class="market-name">{{ c.name }}</p>
                </ion-label>

                    <swap-text
                      class="market-cells__change tabular-nums"
                      :class="c.change >= 0 ? 'market-up' : 'market-down'"
                      :text="formatChange(c.change)"
                  />
                    <swap-text class="market-cells__rate tabular-nums" :text="formatRate(c.buying)" />
                    <swap-text class="market-cells__rate tabular-nums" :text="formatRate(c.selling)" />
                </div>
              </ion-item>
            </template>
          </ion-list>
          </animated-height>
        </ion-card>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.market-content {
  --background: var(--c-page);
  --market-positive: #047857;
  --market-negative: var(--c-error);
  --market-warning: #92400e;
}

:global(.ion-palette-dark .market-content) {
  --market-positive: #6ee7b7;
  --market-warning: #fcd34d;
}

.refresh-action {
  --color: var(--c-content);
  --background-hover: var(--c-surface-sunken);
  --border-radius: 12px;
  width: 44px;
  height: 44px;
}

.market-controls {
  margin: 24px 0 0;
  border: 1px solid var(--c-line);
  border-radius: 1.25rem;
  background: linear-gradient(145deg, var(--c-surface), var(--c-surface-sunken));
  box-shadow: 0 8px 24px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.market-controls__content {
  padding: 16px;
}

/* ── Durum çubuğu ─────────────────────────────────────────────────── */
.market-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 0;
  padding-inline: 2px;
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
.market-dot--fresh { background: var(--market-positive); }
.market-dot--stale { background: var(--market-warning); }

/* ── Segmentler ───────────────────────────────────────────────────── */
.market-segment {
  --background: var(--c-surface);
  margin-top: 16px;
  border-radius: 1rem;
  padding: 4px;
  border: 1px solid var(--c-line);
}

/* Seçili ZEMİN yalnız `--active` sınıfından gelir (`--background-checked` de
   boyarsa iki kaynak bir kare boyunca farklı butonu vurgulayabiliyor), ama
   METİN rengi `--color-checked` ile de verilmeli: Ionic seçili butonda
   `color: var(--color-checked)` okur, tanımsız bırakılırsa kendi nötr
   varsayılanına düşüyor ve çip zeminiyle aynı tona gelip okunmaz oluyordu. */
.market-segment__button {
  --border-radius: 0.75rem;
  --color: var(--c-content-tertiary);
  --color-checked: var(--c-on-primary);
  --indicator-color: transparent;
  min-height: 44px;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: none;
}

/* Ionic seçili çipi `segment-button-checked` sınıfıyla boyar, o sınıf da
   Stencil'in yazma kuyruğundan geçer; seçili zemini/metnini doğrudan seçili
   değere bağlayarak her koşulda doğru butonda tutuyoruz. */
.market-segment__button--active {
  --color: var(--c-on-primary);
  background: var(--c-primary);
  border-radius: 0.75rem;
  box-shadow: 0 3px 10px color-mix(in srgb, var(--c-primary) 24%, transparent);
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
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  margin-top: 12px;
  padding: 12px 2px 0;
  border-top: 1px solid var(--c-line);
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
  width: 100%;
  border: 1px solid var(--c-line);
}

.market-mode__button {
  --border-radius: 9999px;
  --color: var(--c-content-muted);
  --color-checked: var(--c-content);
  --padding-start: 12px;
  --padding-end: 12px;
  min-height: 44px;
  min-width: 0;
  font-size: 11px;
  font-weight: 600;
  text-transform: none;
}

.market-mode__button--active {
  --color: var(--c-content);
  background: var(--c-surface);
  border-radius: 9999px;
  box-shadow: 0 2px 7px color-mix(in srgb, var(--c-content) 8%, transparent);
}

/* Ionic MD'nin native düğmesi varsayılan olarak kare. Odak ve ripple
   katmanlarını da kapsayan aynı yuvarlak sınırı her iki seçicide uygula. */
.market-segment__button,
.market-mode__button {
  overflow: hidden;
  border-radius: var(--border-radius);
  --background-hover: var(--c-primary);
  --background-focused: var(--c-primary);
  --color-hover: var(--c-content);
  --color-focused: var(--c-content);
  --indicator-box-shadow: none;
}

.market-segment__button::part(native),
.market-mode__button::part(native) {
  border-radius: var(--border-radius);
  overflow: hidden;
}

.market-segment__button.ion-focused::part(native),
.market-mode__button.ion-focused::part(native),
.market-segment__button::part(native):focus-visible,
.market-mode__button::part(native):focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -3px;
}

/* Yukarıdaki ortak hover/focus kuralıyla aynı özgüllükte; onu ezebilmesi
   için ondan SONRA gelmeli (ilk --active bloğuna taşınamaz). */
.market-segment__button--active {
  --color-hover: var(--c-on-primary);
  --color-focused: var(--c-on-primary);
  --background-hover: var(--c-on-primary);
  --background-focused: var(--c-on-primary);
}

.market-segment__button ion-label,
.market-mode__button ion-label {
  white-space: normal;
  line-height: 1.4;
}

/* ── Uyarı / hata kutuları ────────────────────────────────────────── */
.market-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 1rem;
  border: 1px solid transparent;
}

/* Yarı şeffaf hue tint: light'ta pastel, dark'ta koyu zemine karışır. */
.market-alert--warning {
  background: color-mix(in srgb, var(--market-warning) 10%, var(--c-surface));
  border-color: color-mix(in srgb, var(--market-warning) 30%, var(--c-line));
}

.market-alert--danger {
  background: color-mix(in srgb, var(--c-error) 10%, var(--c-surface));
  border-color: color-mix(in srgb, var(--c-error) 30%, var(--c-line));
}

.market-alert__icon {
  width: 14px;
  height: 14px;
  margin-top: 2px;
  flex-shrink: 0;
}

.market-alert--warning .market-alert__icon { color: var(--market-warning); }
.market-alert--danger .market-alert__icon { color: var(--c-error); }

.market-alert__title {
  margin-bottom: 6px;
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
  --color: var(--c-error);
  --border-color: var(--c-error);
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
  margin-bottom: 12px;
}

.favorite-chip {
  min-width: 120px;
  flex-shrink: 0;
  margin: 0;
  border-radius: 1rem;
  /* Kart yüzeyi tokendan: eskiden sabit #fff olduğu için dark modda
     beyaz kart olarak patlıyordu. */
  --background: var(--c-surface);
  box-shadow: none;
  border: 1px solid var(--c-line);
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
  margin: 0;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: 1.25rem;
  overflow: hidden;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.market-card ion-list {
  background: transparent;
  padding: 0;
  margin: 0;
}

.market-card ion-item.plain-item {
  min-width: 0;
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
  --min-height: 44px;
}

.market-head .market-row-content {
  padding-block: 12px;
}

/* Başlık ve veri satırları aynı grid ölçülerini paylaşır. */
.market-row-content {
  display: grid;
  grid-template-columns: 28px minmax(36px, 0.9fr) minmax(0, 0.95fr) repeat(2, minmax(0, 1.2fr));
  gap: 4px;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.market-head__cell {
  min-width: 0;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--c-content-muted);
  overflow-wrap: anywhere;
}

.market-number {
  text-align: end;
}

.market-star {
  --padding-start: 0;
  --padding-end: 0;
  --border-radius: 10px;
  margin: 0;
  height: 44px;
  width: 28px;
  min-width: 0;
}

.market-star ion-icon {
  font-size: 18px;
}

.market-star--on { color: var(--market-warning); }
.market-star--off { color: var(--c-content-muted); }

.market-star-spacer {
  width: 28px;
  margin-inline-end: 4px;
  flex-shrink: 0;
}

.market-card .market-identity {
  min-width: 0;
  margin: 8px 0;
}

.market-card .market-code {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--c-content);
}

.market-card .market-name {
  margin: 2px 0 0;
  font-size: 10px;
  line-height: 1.3;
  color: var(--c-content-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.market-cells__change,
.market-cells__rate {
  min-width: 0;
  text-align: end;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.market-cells__rate {
  color: var(--c-content);
}

@media (max-width: 380px) {
  .market-row-content {
    gap: 3px;
  }

  .market-cells__change,
  .market-cells__rate {
    font-size: 11px;
  }
}
/* Artış/azalış renkleri: dark modda okunur tonlara yükseltilir. */
.market-up { color: var(--market-positive); }
.market-down { color: var(--market-negative); }

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
