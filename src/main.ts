// Capacitor'un native köprü log dökümünü kapatır (import anında). Boot sırasındaki
// ilk plugin çağrısından önce çalışması için EN ÜSTTE kalmalı.
import '@/plugins/capacitor-bridge-log';

import { createApp } from 'vue'
import { createPinia } from 'pinia';
import App from './App.vue'
// Yup varsayılan mesajlarını i18n'e bağlar (import anında). Şema modüllerinden
// (router → views → validations) ÖNCE import edilmeli.
import '@/plugins/yup-locale';
import router from './router';

import { IonicVue } from '@ionic/vue';
import { modernNavAnimation as navAnimation } from '@/theme/nav-animation';
import { mdSnackbarEnterAnimation, mdSnackbarLeaveAnimation } from '@/theme/toast-animation';

/**
 * Ionic'ten YALNIZCA core.css alınır — bileşenlerin çalışması için zorunlu olan
 * tek parça budur.
 *
 * Starter'ın getirdiği diğerleri bilinçli olarak dışarıda:
 *  - typography/structure/normalize → `theme/base/` bunları kendi tokenlarıyla
 *    kuruyor, ikisi birden yüklenince Ionic'in değerleri bizimkini eziyor.
 *  - padding/display/flex-utils gibi yardımcılar → Tailwind'in işi.
 *  - dark palette dosyaları → tema `.ion-palette-dark` sınıfıyla `theme/tokens/`
 *    üzerinden sürülüyor (bkz. tailwind.config darkMode).
 */
import '@ionic/vue/css/core.css';

/* Uygulamanın kendi teması — tek giriş noktası (bkz. docs/design-system.md). */
import './theme/index.css';
import { repositoryManager } from "@/infrastructure/database/repositories/repository-manager";
import { useThemeStore } from "@/stores/theme";
import { DatabaseFactory } from "@/infrastructure/database/database-factory";
import { i18n } from "@/i18n";
import { SeederManager } from "@/infrastructure/database/seeders/seeder-manager";
import { logger } from "@/infrastructure/logging";
import { classifyPersistenceError, isRetryableFailure } from "@/infrastructure/database/errors";
import {
    clearPersistenceFailure,
    markPersistenceFailureFatal,
    reportPersistenceFailure,
    requiresRecovery,
} from "@/infrastructure/database/persistence-status";
import { RECOVERY_ROUTE } from "@/router/routes/recovery";

/** Yakalanmayan global hataları tek log sistemine yönlendir. */
function installGlobalErrorHandlers() {
    window.addEventListener('error', (e) => {
        logger.error(e.message || 'Uncaught error', {
            context: 'window',
            error: e.error ?? e,
            data: { source: e.filename, line: e.lineno, col: e.colno },
        });
    });

    window.addEventListener('unhandledrejection', (e) => {
        logger.error('Unhandled promise rejection', {
            context: 'promise',
            error: e.reason,
        });
    });
}

installGlobalErrorHandlers();

/** Kalıcı durum kurulumunun mount ÖNCESİ deneme sayısı. */
const BOOT_ATTEMPTS = 3
/**
 * Mount SONRASI arka plan denemelerinin üst sınırı.
 *
 * Sonlu olması şart: bu sayı tükendiğinde kullanıcı boş ekranda bırakılmak
 * yerine kurtarma ekranına alınır. Backoff ile birlikte ~1 dakikalık bir
 * pencere — geçici bir DB hatasının düzelmesi için fazlasıyla yeterli.
 */
const BOOT_BACKGROUND_ATTEMPTS = 5
/** Denemeler arası bekleme; her denemede ikiye katlanır. */
const BOOT_RETRY_BASE_MS = 1000
/** Beklemenin üst sınırı — kalıcı arıza pili ve log'u boğmasın. */
const BOOT_RETRY_MAX_MS = 30_000

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

const backoff = (attempt: number) =>
    Math.min(BOOT_RETRY_BASE_MS * 2 ** (attempt - 1), BOOT_RETRY_MAX_MS)

/** DB → repository → seeder. Ya hepsi ya hiçbiri. */
async function bootstrapPersistence(): Promise<void> {
    logger.info('Initializing database', { context: 'boot' });
    const db = await DatabaseFactory.initialize()

    logger.info('Initializing repositories', { context: 'boot' });
    await repositoryManager.initialize(db)

    logger.info('Running seeders', { context: 'boot' });
    const seeder = new SeederManager(db)
    await seeder.runAll()
}

/**
 * Yarım kalmış kurulumu temizler ki sonraki deneme sıfırdan başlasın.
 *
 * İkisi de şart:
 *  - `DatabaseFactory.close()` olmadan her deneme yeni bir adapter (ve web'de
 *    yeni kalıcılık dinleyicileri) bırakır.
 *  - `repositoryManager.clear()` olmadan `initialize()` içindeki `db ??= db`
 *    ilk denemenin **kapatılmış** adapter'ını tutmaya devam eder ve sonraki
 *    deneme başarılı olsa bile repository'ler ölü bağlantıya yazar.
 */
async function resetPersistence(): Promise<void> {
    try {
        await DatabaseFactory.close()
    } catch (error) {
        logger.debug('Cleanup after failed init', { context: 'boot', error })
    }

    repositoryManager.clear()
}

type InitOutcome = { ok: true } | { ok: false; error: unknown }

/**
 * Kurulumu `attempts` kez dener.
 *
 * Yeniden denemeye güvenli: `SqliteDatabaseAdapter.getOrCreateConnection`
 * tutarlı bir bağlantı bulursa onu yeniden kullanır, aynı dosyaya ikinci
 * bağlantı açmaz.
 *
 * Determinist bir hatada (şifreleme anahtarı kaybı, patlayan migration) kalan
 * denemeler HARCANMAZ: aynı girdiyle sonuç değişmez, beklemek yalnızca
 * kullanıcıyı boş ekranda tutar.
 */
async function initPersistence(attempts: number, level: 'error' | 'warn'): Promise<InitOutcome> {
    let lastError: unknown

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            await bootstrapPersistence()
            return { ok: true }
        } catch (error) {
            lastError = error

            logger.log(level, 'Persistence init failed', {
                context: 'boot',
                error,
                data: { attempt },
            });

            await resetPersistence()

            if (!isRetryableFailure(classifyPersistenceError(error))) {
                break
            }

            if (attempt < attempts) {
                await delay(backoff(attempt))
            }
        }
    }

    return { ok: false, error: lastError }
}

/**
 * Mount sonrası, kurulum tamamlanana kadar arka planda denemeyi sürdürür.
 *
 * SINIRLI. Eskiden bitiş koşulu yoktu ve gerekçesi "alternatifi kullanıcı için
 * kalıcı boş ekran"dı — ama pratikte sonuç zaten kalıcı boş ekrandı: guard
 * navigasyonu iptal ettiği için hiçbir sayfa render edilmiyor, üstelik 30
 * saniyede bir yeniden denenen kurulum pili yakıyordu. Artık denemeler
 * tükendiğinde kullanıcı kurtarma ekranına alınıyor: hatayı görüyor, verisini
 * dışa aktarabiliyor ve elle yeniden deneyebiliyor.
 *
 * Deneme log'ları bilinçli olarak `warn`: `error` seviyesi localStorage'a
 * kalıcı yazılıyor ve döngü 100 kayıtlık tamponu gerçek hataların üstüne
 * yazardı.
 */
async function retryPersistenceInBackground(): Promise<void> {
    for (let attempt = 1; attempt <= BOOT_BACKGROUND_ATTEMPTS; attempt++) {
        await delay(backoff(attempt))

        const outcome = await initPersistence(1, 'warn')

        if (outcome.ok) {
            clearPersistenceFailure()
            logger.info('Persistence recovered after retry', { context: 'boot', data: { attempt } })
            return
        }

        // Tür değişmiş olabilir (ör. geçici bir hata artık migration hatası
        // olarak dönüyor); durumu her turda tazele.
        reportPersistenceFailure(outcome.error)

        if (requiresRecovery.value) {
            break
        }
    }

    markPersistenceFailureFatal()
    logger.fatal('Persistence unavailable; routing to recovery', { context: 'boot' })

    // Guard yalnızca bir navigasyon olduğunda çalışır; ilk navigasyon iptal
    // edilmiş olabileceği için kurtarma ekranına buradan geçiliyor.
    try {
        await router.replace(RECOVERY_ROUTE)
    } catch (error) {
        logger.error('Recovery navigation failed', { context: 'boot', error })
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    // Mount ÖNCESİ sınırlı deneme: geçici bir DB hatasında kullanıcı boş ekran
    // görmesin. Başarısız olursa uygulama YİNE DE mount edilir ve deneme arka
    // planda sürer.
    //
    // Eskiden bu blok `app.mount()`'u da kapsayan tek bir try içindeydi ve hata
    // yeniden fırlatılıyordu: tek bir geçici DB hatası `#app`'i sonsuza dek boş
    // bırakıyordu — ne hata ekranı ne de yedekten geri yükleme çıkışı kalıyordu.
    // Guard'ın yeniden deneme mekanizması da ancak uygulama ayaktayken çalışır.
    const boot = await initPersistence(BOOT_ATTEMPTS, 'error')

    if (!boot.ok) {
        const failure = reportPersistenceFailure(boot.error)

        logger.fatal('Persistence unavailable; mounting anyway', {
            context: 'boot',
            data: { kind: failure.kind, migration: failure.migration },
        })

        // Determinist hatada arka planda denemenin anlamı yok; guard ilk
        // navigasyonu doğrudan kurtarma ekranına çeviriyor (bkz. router/guards.ts).
        if (failure.retryable) {
            void retryPersistenceInBackground()
        }
    }

    const pinia = createPinia()

    const app = createApp(App)
        .use(IonicVue, {
            // Stack navigasyonu (route push/pop) için modern geçiş.
            // Tab geçişleri ayrıca TabsPage.vue içinde animasyonlanır.
            navAnimation,
            // ion-toast'un MD3 snackbar hareketi. Global config olarak
            // veriliyor ki useToast dışında doğrudan <ion-toast> kullanan
            // sayfalar (ör. FeedbackPage) da aynı hareketi alsın.
            toastEnter: mdSnackbarEnterAnimation,
            toastLeave: mdSnackbarLeaveAnimation,
        })
        .use(pinia)
        .use(i18n)
        .use(router);

    // Vue render/lifecycle hataları → log sistemi
    app.config.errorHandler = (err, _instance, info) => {
        logger.error('Vue error', { context: 'vue', error: err, data: { info } });
    };

    // Argümansız: localStorage'daki son tema seçimini senkron uygular
    // (flash yok). DB kaynak-of-truth değeri guard'da appStore.initialize()
    // → themeStore.initialize(result.theme) ile senkronlanır.
    // DB'ye dokunmaz (localStorage + matchMedia), bu yüzden kurulum patlamış
    // olsa da güvenle çağrılır.
    useThemeStore().initialize()

    // İlk navigasyon guard tarafından iptal edilmişse (init hatası)
    // `isReady()` reject eder. Uygulama yine de mount edilmeli: guard aynı
    // hedefi arka planda yeniden deniyor, mount etmezsek DB toparlansa bile
    // ekran kalıcı olarak boş kalırdı.
    try {
        await router.isReady()
    } catch (error) {
        logger.error('Initial navigation aborted; router will retry', { context: 'boot', error })
    }

    app.mount('#app')
})
