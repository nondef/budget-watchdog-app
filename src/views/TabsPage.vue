<script setup lang="ts">
import { IonTabBar, IonTabButton, IonTabs, IonIcon, IonPage, IonRouterOutlet } from '@ionic/vue';
import {
  homeOutline,
  pieChartOutline,
  documentTextOutline,
  settingsOutline,
} from 'ionicons/icons';
import { onMounted, onBeforeUnmount, ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAccountsStore } from '@/stores/accounts';
import { useBackupReminder } from '@/composables/features/useBackupReminder';

const route = useRoute();
const { t } = useI18n();

/**
 * Ayarlar sekmesindeki yedek rozeti.
 *
 * Koşul, Ana Sayfa kartı ve Ayarlar listesindeki satır rozetiyle AYNI
 * (`shouldWarn`): çarpı hatırlatmanın üç yüzeyini birden erteler. Geride bir
 * "iz" bırakmak denendi ve bırakılmadı — kullanıcı kapattığı uyarının kalıntısını
 * taşımaya devam ediyordu. Erteleme dolunca üçü birden geri gelir; yedek
 * alınınca üçü birden söner.
 */
const accountsStore = useAccountsStore();
const { shouldWarn: shouldWarnBackup } = useBackupReminder();

const backupBadgeVisible = computed(
    () => shouldWarnBackup(accountsStore.activeAccounts.length > 0)
);

const tabs = [
  { tab: 'home', link: '/tabs/home', icon: homeOutline, label: 'nav.home' },
  { tab: 'overview', link: '/tabs/overview', icon: pieChartOutline, label: 'nav.overview' },
  { tab: 'transactions', link: '/tabs/transactions', icon: documentTextOutline, label: 'nav.transactions' },
  { tab: 'settings', link: '/tabs/settings', icon: settingsOutline, label: 'nav.settings' },
];

const isActive = (link: string) => route.path.startsWith(link);

// Ionic tab geçişleri varsayılan olarak yön 'none' ile, süre=0 ile commit edilir;
// yani ion-router-outlet'in `animated` prop'u ve global navAnimation tab
// değişiminde HİÇ çalışmaz. Önceki deneme `ionTabsDidChange` üzerinde animasyon
// oynatıyordu, ama o olay sayfa zaten TAM görünür (opacity 1, yerinde) olduktan
// SONRA tetiklendiği için "önce göründü, sonra zıpladı" hissi veriyordu.
//
// Doğru zamanlama: Ionic yeni sayfadan `ion-page-hidden` sınıfını kaldırdığı anı
// bir MutationObserver ile yakalıyoruz. Observer callback'i bir microtask'tır ve
// tarayıcı sayfayı İLK BOYAMADAN önce çalışır — böylece başlangıç durumunu
// (opacity 0 + yatay kayma) zıplama olmadan verip animasyonu oynatabiliyoruz.
const tabOrder = ['home', 'overview', 'transactions', 'settings', 'accounts'];

const tabRef = ref<{ $el: HTMLElement } | null>(null);
let observer: MutationObserver | null = null;

const currentTabName = () => route.path.split('/')[2] ?? 'home';
let lastTab = currentTabName();

const animateIn = (page: HTMLElement) => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const toTab = currentTabName();
  // Aynı geçiş için iki kez oynatma (childList + class mutasyonu birlikte
  // gelebilir) ve uygulama açılışındaki İLK sayfa için animasyon yok:
  // lastTab başlangıçta açılış tab'ına eşit olduğundan ikisi de burada elenir.
  if (toTab === lastTab) return;

  const fromIndex = tabOrder.indexOf(lastTab);
  const toIndex = tabOrder.indexOf(toTab);
  lastTab = toTab;

  // Daha sağdaki tab'a geçiyorsak içerik soldan, soldakine geçiyorsak sağdan
  // kayıp gelir. Bilinmeyen tab (-1) için ileri yön varsayılır.
  const goingForward = fromIndex === -1 || toIndex === -1 ? true : toIndex > fromIndex;
  const offset = goingForward ? 16 : -16;

  // Boyamadan önce başlangıç durumunu uygula, sonra WAAPI ile yerine getir.
  page.animate(
      [
        { opacity: 0, transform: `translateX(${offset}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 260, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'backwards' },
  );
};

const isPage = (n: Node): n is HTMLElement =>
    n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).classList.contains('ion-page');

onMounted(() => {
  const outlet = tabRef.value?.$el.querySelector('ion-router-outlet');
  if (!outlet) return;

  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      // 1) İLK ZİYARET: tab tembel (lazy) yüklendiğinde sayfa DOM'a yeni eklenir;
      //    "gizli→görünür" geçişi olmadığından class mutasyonu tetiklenmez.
      //    Bu yüzden yeni eklenen .ion-page düğümlerini ayrıca yakalıyoruz.
      if (m.type === 'childList') {
        m.addedNodes.forEach((n) => {
          if (isPage(n)) animateIn(n);
        });
      }

      // 2) ÖNBELLEKTEKİ TAB: daha önce ziyaret edilmiş tab'a dönünce Ionic
      //    sadece `ion-page-hidden` sınıfını kaldırır.
      if (m.type === 'attributes' && m.attributeName === 'class') {
        const el = m.target as HTMLElement;
        if (
            el.classList.contains('ion-page') &&
            !el.classList.contains('ion-page-hidden') &&
            (m.oldValue ?? '').includes('ion-page-hidden')
        ) {
          animateIn(el);
        }
      }
    }
  });

  observer.observe(outlet, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
    attributeOldValue: true,
  });
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <ion-page>
    <ion-tabs ref="tabRef">
      <ion-router-outlet></ion-router-outlet>
      <ion-tab-bar slot="bottom" class="app-tab-bar">
        <ion-tab-button
            v-for="tab in tabs"
            :key="tab.tab"
            :tab="tab.tab"
            :href="tab.link"
            class="app-tab-button"
        >
          <div class="tab-inner">
            <div class="tab-icon-wrap" :class="{ active: isActive(tab.link) }">
              <ion-icon :icon="tab.icon" aria-hidden="true" />
              <span
                  v-if="tab.tab === 'settings' && backupBadgeVisible"
                  class="tab-badge"
                  :aria-label="$t('backup.reminder.action')"
              />
            </div>
            <span class="tab-label" :class="{ active: isActive(tab.link) }">
              {{ t(tab.label) }}
            </span>
          </div>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<style scoped>
.app-tab-bar {
  --background: var(--c-surface);
  --border: none;
  /* Tab bar safe-area'ya kadar uzansın, böylece alt boşluk olmaz.
     İç içerik (buton/ikon) padding ile home indicator üstünde kalır. */
  height: calc(65px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  /*border-top: 1px solid var(--c-line-strong);*/
  box-shadow: 2px 2px 2px rgba(15, 23, 42, 0.02);
}

.app-tab-button {
  --color: var(--c-content-tertiary);
  --color-selected: var(--c-content);
  --background: transparent;
  --background-focused: transparent;
  --background-hover: transparent;
  --ripple-color: transparent;
}

.tab-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 0 4px;
}

.tab-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 35px;
  border-radius: 999px;
  transition: background-color 180ms ease, transform 180ms ease;
}

/* Sayısız nokta rozet: "bakılacak bir şey var" der, sayı iddia etmez.
   Zemin rengiyle çevrelenir ki hem açık hem koyu temada ikondan ayrışsın. */
.tab-badge {
  position: absolute;
  top: 3px;
  right: 11px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgb(245 158 11); /* amber-500 */
  box-shadow: 0 0 0 2px var(--c-surface);
}

.tab-icon-wrap ion-icon {
  font-size: 24px;
  color: var(--c-content-tertiary);
  transition: color 180ms ease, transform 180ms ease;
}

/* Nötr navigation active indicator = gri pill */
.tab-icon-wrap.active {
  background: var(--c-surface-strong);
}

.tab-icon-wrap.active ion-icon {
  color: var(--c-content);
  transform: scale(1.1);
}

.tab-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-content-tertiary);
  letter-spacing: -0.01em;
  transition: color 180ms ease;
}

.tab-label.active {
  color: var(--c-content);
  font-weight: 700;
}

</style>

<!-- Non-scoped dark mode rules — global selectors guarantee override.
     Renkler artık adaptif --c-* tokenlarından geldiği için dark'ta
     sadece tab bar zemini ve hairline'ı (gölgesiz) ayarlamak yeterli. -->
<style>
.ion-palette-dark .app-tab-bar {
  --background: var(--c-surface) !important;
  border-top: 1px solid var(--c-line-strong) !important;
  box-shadow: none !important;
}
</style>
