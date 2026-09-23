<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import { useSecurityStore } from './stores/security';
import { onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useBudgetStore } from './stores/budgets';
import { useAppStore } from "@/stores/app";
import { useCurrenciesStore } from "@/stores/currencies";
import { useAccountsStore } from "@/stores/accounts";
import { useNotificationsStore } from "@/stores/notifications";
import { useBudgetNotification } from "@/composables/features/useBudgetNotification";
import { useNotifier } from "@/composables/features/useNotifier";
import { useKeyboardVisibility } from "@/composables/ui/useKeyboardVisibility";
import { useBackupReminder } from "@/composables/features/useBackupReminder";
import { logger } from "@/infrastructure/logging";

const securityStore = useSecurityStore();
const budgetStore = useBudgetStore()
const appStore = useAppStore()
const currencyStore = useCurrenciesStore()
const accountsStore = useAccountsStore()
const notificationsStore = useNotificationsStore()
const router = useRouter();

// İzin artık onboarding'deki /permissions ekranında bir kez isteniyor;
// her açılışta OS dialog'u tetiklenmesin diye burada çağrılmıyor.
const { notifyReset } = useBudgetNotification()
const notifier = useNotifier()

// Klavye açıkken <html>.keyboard-open — footer'ın klavyenin üstünde asılı
// kalmasını engelleyen global CSS kuralı buna bağlı (bkz. src/theme/base/keyboard.css).
useKeyboardVisibility()
let resetTimer: number | undefined;
let midnightTimeout: number | undefined;

/**
 * Bildirim tercihlerini okur, cihaz izin durumunu tazeler, kanalları ve
 * cüzdan hatırlatıcısını yeniden kurar. Açılışta bildirim üretebilecek ilk
 * akıştan (bütçe devri) ÖNCE çalışmalı: tercihler okunmadan `pushEnabled`
 * varsayılan `false` görünür ve uyarılar sessizce yutulur.
 */
const syncNotifications = async () => {
  try {
    await notificationsStore.initiliaze()
    await notifier.checkPermission()
    await notifier.resyncSchedules()
  } catch (e) {
    logger.warn('Bildirim senkronizasyonu başarısız', { context: 'App', error: e })
  }
}

// Yedek hatırlatıcısının damgası. Cihaz yedeği bilinçli olarak kapalı ve bulut
// senkronu yok; kullanıcı bunu bilmediği sürece telefon kaybı tüm finansal
// geçmişin kalıcı kaybı demek (bkz. useBackupReminder).
//
// Uyarıyı App artık GÖSTERMİYOR — yalnızca durumu tazeliyor. Composable modül
// seviyesinde paylaşıldığı için Ana Sayfa'daki kart ve Ayarlar sekmesindeki
// rozet aynı damgayı okur; tazeleme burada kalmalı ki süreç günlerce arka
// planda kaldıktan sonra öne gelince gün sayısı ilerlesin.
const { refresh: refreshBackupStatus } = useBackupReminder()

const runResetCheck = async () => {
  try {
    // Önce sıfırla (gerçek reset sayısını buradan al), sonra listeyi yükle.
    // `loadBudgets` artık kendisi rollover yaptığı için sırayı ters çevirmek
    // sayacı sıfırlayıp bildirimi yutardı.
    const result = await budgetStore.resetBudgets()
    await budgetStore.loadBudgets()
    notifyReset(result.resetCount)
  } catch (e) {
    logger.error('Budget reset check failed', { context: 'App', error: e })
  }
}

const scheduleMidnight = () => {
  const now = new Date()
  const next = new Date(now)
  next.setHours(24, 0, 5, 0)
  const ms = next.getTime() - now.getTime()

  midnightTimeout = window.setTimeout(async () => {
    await runResetCheck()

    // 24 saatte bir
    resetTimer = window.setInterval(runResetCheck, 24 * 60 * 60 * 1000)
  }, ms)
}

onMounted(async () => {
  // SIRA KASITLI: önce yaşam döngüsü dinleyicileri, sonra veri yüklemeleri.
  //
  // Eskiden tersiydi ve `loadCurrencies()` try/catch'siz await ediliyordu:
  // kalıcı durum kurulumu patladığında onMounted ilk await'te kopuyor,
  // arkasındaki auto-lock dinleyicileri (appStateChange / visibilitychange) ve
  // gece yarısı timer'ı HİÇ kaydolmuyordu. main.ts kurulumu sonradan
  // toparlasa bile o oturum boyunca ekran kilidi ve bütçe devri ölü kalıyordu.
  //
  // Aşağıdaki veri yüklemelerinin her biri kendi try/catch'inde: biri patlarsa
  // diğerleri ve buradaki dinleyiciler etkilenmez.

  scheduleMidnight()

  // Not: buradaki eski 'visibilitychange' dinleyicisi kaldırıldı. Aşağıdaki
  // web fallback'i zaten runResetCheck'i çağırıyordu; ikisi birden kayıtlıyken
  // her öne gelişte bütçe devri iki kez koşuyor ve bildirim tekrarlanıyordu.

  const handleResume = async () => {
    if (securityStore.shouldAutoLock()) {
      securityStore.lock()
      if (router.currentRoute.value.path !== '/lock') {
        router.replace({
          path: '/lock',
          query: { redirect: router.currentRoute.value.fullPath },
        })
      }
    }
  }

  const handlePause = () => {
    void securityStore.markActive()
  }

  // Capacitor native lifecycle
  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      void handleResume()
      // Native'de resume yalnızca appStateChange ile geliyor; bütçe devrini de
      // burada tetiklemezsek arka planda geçen dönemler (timer'lar mobilde
      // durur) uygulama tekrar öne gelene kadar sıfırlanmıyordu.
      void runResetCheck()
      // Aynı gerekçe kurlar için: süreç günlerce arka planda kalabildiğinden
      // öne gelirken bayat kurları sessizce tazeliyoruz.
      void appStore.ensureFreshRates()
      // Aynı gerekçe yedek hatırlatıcısı için: "kaç gündür yedek alınmadı"
      // arka planda geçen günlerle ilerlemeli, damga değişmese bile.
      void refreshBackupStatus()
      // Kullanıcı sistem ayarlarından bildirim iznini değiştirmiş olabilir.
      void syncNotifications()
    } else {
      handlePause()
    }
  }).catch(() => {})

  // Web tarayıcı fallback — native'de aynı işi appStateChange yapıyor;
  // ikisi birden kayıtlıysa her öne gelişte akış iki kez koşar.
  if (!Capacitor.isNativePlatform()) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void handleResume()
        void runResetCheck()
        void appStore.ensureFreshRates()
        void refreshBackupStatus()
      } else {
        handlePause()
      }
    })
  }

  // ── Veri yüklemeleri ──────────────────────────────────────────────────
  // Buradan sonrası patlasa bile yukarıdaki dinleyiciler kayıtlı kalır.

  // Güvenlik durumu DB'ye değil Preferences'a dayanır: kalıcı durum kurulumu
  // patlamış olsa da ekran kilidi çalışmalı. Idempotent — guard da çağırıyor.
  try {
    await securityStore.initialize()
  } catch (e) {
    logger.error('Güvenlik durumu yüklenemedi', { context: 'App', error: e })
  }

  try {
    await currencyStore.loadCurrencies()
  } catch (e) {
    logger.error('Para birimleri yüklenemedi', { context: 'App', error: e })
  }

  // Yedek hatırlatıcısı damga okunana kadar görünmez; DB'ye dokunmadığı için
  // kalıcı durum kurulumu patlamış olsa da çalışır.
  void refreshBackupStatus()

  // Hatırlatıcının "verisi olan kullanıcı" kapısı hesap sayısına bakıyor
  // (verisi olmayan yeni kurulumda "yedek al" demek anlamsız gürültü olurdu).
  // Bu yükleme eskiden yalnızca Ana Sayfa'da yapılıyordu: uygulama Ayarlar
  // sekmesinde açıldığında hesaplar boş görünüyor, hatırlatma kartı ve rozet
  // yedek gerçekten bayat olmasına rağmen hiç çıkmıyordu.
  try {
    await accountsStore.loadAccounts()
  } catch (e) {
    logger.error('Hesaplar yüklenemedi', { context: 'App', error: e })
  }

  // İkisi de kendi try/catch'ini taşıyor. Sıra korunmalı: tercihler okunmadan
  // `pushEnabled` varsayılan false görünür ve bütçe devri bildirimleri
  // sessizce yutulur.
  await syncNotifications()
  await runResetCheck()
});

onBeforeUnmount(() => {
  if (midnightTimeout) clearTimeout(midnightTimeout);
  if (resetTimer) clearInterval(resetTimer);
});
</script>

<template>
  <ion-app>
    <!-- Status bar / çentik scrim'i: edge-to-edge modunda kaydırılan içerik
         şeffaf status bar'ın altından görünüyordu. Sayfa rengiyle dolu opak
         sabit bir şerit, çentik bölgesini kapatır; içerik arkasında gizlenir. -->
    <div class="status-bar-scrim"></div>

    <ion-router-outlet/>

    <!-- Buraya global uyarı şeridi EKLEME. Eskiden burada `position: fixed;
         bottom: 0` iki şerit vardı; tab bar ile aynı noktaya sabitlenip
         gezinme butonlarının üstünü örtüyor, safe-area payını tab bar'la
         birlikte iki kez sayıyor, klavye açıkken (`html.keyboard-open` yalnızca
         `ion-footer`'ı gizler) klavyenin üstünde asılı kalıyor ve kilit ekranı,
         onboarding, form sayfaları dahil her ekranda görünüyordu.
         Uyarılar artık bağlamlarında duruyor:
           • eksik kur → Ana Sayfa'da tutarın altındaki tıklanabilir satır
             (HomePage) + başarısız yenilemede tek seferlik toast,
           • yedek hatırlatıcısı → Ana Sayfa akışındaki BackupReminderCard
             + Ayarlar sekmesindeki kalıcı rozet (TabsPage). -->
  </ion-app>
</template>

<style>
/* Global stilleriniz burada */

.status-bar-scrim {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: env(safe-area-inset-top);
  background: var(--c-page);
  z-index: 1000;
  pointer-events: none;
}

</style>