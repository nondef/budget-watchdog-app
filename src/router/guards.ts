import { Router } from "vue-router";
import { useAppStore } from "@/stores/app";
import { useSecurityStore } from "@/stores/security";
import { logger } from "@/infrastructure/logging";
import {
    clearPersistenceFailure,
    markPersistenceFailureFatal,
    reportPersistenceFailure,
    requiresRecovery,
} from "@/infrastructure/database/persistence-status";
import { RECOVERY_ROUTE } from "@/router/routes/recovery";

const LOCK_BYPASS_ROUTES = ['/lock', '/splash']
const ONBOARDING_ROUTES = ['/welcome', '/base-currency-selection', '/first-wallet', '/splash', '/permissions']

/** Guard içinde peş peşe denenecek init sayısı (geçici DB hataları için). */
const INIT_ATTEMPTS = 3
/** Guard içi denemeler arası bekleme; deneme sayısıyla çarpılır. */
const INIT_ATTEMPT_DELAY_MS = 250
/** Navigasyon iptal edildikten sonraki ilk yeniden deneme gecikmesi. */
const INIT_RETRY_BASE_MS = 1000
/** Yeniden deneme gecikmesinin üst sınırı (kalıcı arıza log'u boğmasın). */
const INIT_RETRY_MAX_MS = 30_000
/**
 * Navigasyonu kaç kez iptal edip yeniden deneyeceğiz.
 *
 * Sonlu olması şart: her iptal kullanıcıya boş ekran olarak görünüyor. Bu sayı
 * dolduğunda hata kalıcı sayılır ve kurtarma ekranına geçilir.
 */
const MAX_INIT_RETRIES = 5

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export function registerGuards(router: Router) {
    let retryTimer: number | undefined
    let retryCount = 0

    /**
     * Init'i birkaç kez dener. Soğuk açılışta SQLite'ın ilk sorguları
     * (migration/seeder hemen öncesinde koştuğu için) geçici olarak
     * patlayabiliyor; tek deneme bu yüzden yeterli değil.
     *
     * Başarıda `null`, başarısızlıkta SON hatayı döndürür — çağıran tarafın
     * hatayı sınıflandırıp (geçici mi, determinist mi) kurtarma ekranına
     * geçip geçmeyeceğine karar vermesi gerekiyor.
     */
    const initializeWithRetry = async (
        appStore: ReturnType<typeof useAppStore>
    ): Promise<unknown | null> => {
        let lastError: unknown

        for (let attempt = 1; attempt <= INIT_ATTEMPTS; attempt++) {
            try {
                logger.debug('app init', { context: 'router', data: { attempt } })
                await appStore.initialize()
                return null
            } catch (error) {
                lastError = error
                logger.error('app init failed', { context: 'router', error, data: { attempt } })

                if (attempt < INIT_ATTEMPTS) {
                    await delay(INIT_ATTEMPT_DELAY_MS * attempt)
                }
            }
        }

        return lastError ?? new Error('app init failed')
    }

    /**
     * Init hiç başarılamadıysa navigasyon iptal edilir (aşağıda `false`) ve
     * aynı hedef artan gecikmeyle yeniden denenir. Hata durumunda onboarding'e
     * düşmek YANLIŞ: kurulumu bitirmiş kullanıcı, geçici bir DB hatası yüzünden
     * kendini kurulum ekranında buluyordu.
     */
    const scheduleInitRetry = (fullPath: string) => {
        if (retryTimer !== undefined) return

        const wait = Math.min(INIT_RETRY_BASE_MS * 2 ** retryCount, INIT_RETRY_MAX_MS)
        retryCount++

        logger.warn('app init retry scheduled', { context: 'router', data: { fullPath, wait } })

        retryTimer = window.setTimeout(() => {
            retryTimer = undefined
            void router.replace(fullPath)
        }, wait)
    }

    router.beforeEach(async (to) => {
        // Kurulum kalıcı olarak patladıysa her yol kurtarma ekranına çıkar.
        // Aşağıdaki kontrollerin hiçbiri (app init, kilit, onboarding) DB
        // olmadan çalışmıyor ve navigasyonu iptal etmek kullanıcıya kalıcı boş
        // ekran olarak görünüyordu.
        if (requiresRecovery.value) {
            return to.path === RECOVERY_ROUTE ? true : { path: RECOVERY_ROUTE }
        }

        // Tersi de geçerli: kurulum sağlamken kurtarma ekranında oyalanılmaz
        // (ör. kurtarma sırasında "tekrar dene" tuttuktan sonra).
        if (to.path === RECOVERY_ROUTE) {
            return '/'
        }

        const appStore = useAppStore()
        const securityStore = useSecurityStore()

        if (!appStore.isInitialized) {
            const initError = await initializeWithRetry(appStore)

            if (initError) {
                reportPersistenceFailure(initError)

                // Determinist hatalarda `reportPersistenceFailure` zaten
                // `requiresRecovery`'i açar; geçici sayılanlarda ise sabrımızın
                // sınırı bu sayaç.
                if (retryCount >= MAX_INIT_RETRIES) {
                    logger.fatal('app init retries exhausted; routing to recovery', {
                        context: 'router',
                        data: { retryCount },
                    })
                    markPersistenceFailureFatal()
                }

                if (requiresRecovery.value) {
                    return { path: RECOVERY_ROUTE }
                }

                scheduleInitRetry(to.fullPath)
                return false
            }

            clearPersistenceFailure()
            retryCount = 0
        }

        // Güvenlik durumunu yükle (idempotent) — soğuk açılışta kilit bayrağının
        // guard değerlendirmesinden ÖNCE set edilmesini garanti eder. Aksi halde
        // isLocked yalnızca App.vue onMounted'ında set edildiğinden ilk navigasyon
        // /lock'a yönlenmeden geçer.
        await securityStore.initialize()

        // Kilitliyse her şeyden önce /lock'a yönlendir
        if (securityStore.requiresUnlock && !LOCK_BYPASS_ROUTES.includes(to.path)) {
            return { path: '/lock', query: { redirect: to.fullPath } };
        }

        const isOnboardingRoute = ONBOARDING_ROUTES.includes(to.path);

        // Onboarding tamamlanmış kullanıcılar onboarding sayfalarına giremez
        if (appStore.onBoardingCompleted && isOnboardingRoute) {
            return '/tabs/home';
        }

        // Onboarding tamamlanmamış kullanıcılar onboarding dışına çıkamaz
        if (!appStore.onBoardingCompleted && !isOnboardingRoute) {
            return '/splash';
        }

        // Para birimi seçilmeden first-wallet'a gidilemez
        if (to.path === '/first-wallet' && !appStore.hasBaseCurrency) {
            return '/base-currency-selection';
        }

        // Base currency seçildiyse splash'e dönüş engellenir
        if (to.path === '/splash' && appStore.hasBaseCurrency && !appStore.onBoardingCompleted) {
            return '/first-wallet';
        }

        return true;
    })
}