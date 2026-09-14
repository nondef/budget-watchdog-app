import { computed, ref } from 'vue'
import {
    BACKUP_SNOOZE_DAYS,
    BACKUP_STALE_AFTER_DAYS,
    daysSinceExport,
    isBackupStale,
    isSnoozed,
    readStatus,
    recordExport,
    recordSnooze,
} from '@/infrastructure/services/backup-status'
import { logger } from '@/infrastructure/logging'

/**
 * "Yedeğin bayatladı" durumu — Yedekleme ekranı ile global şerit aynı gerçeği
 * görsün diye modül seviyesinde paylaşılır.
 *
 * Neden var: cihaz yedeği bilinçli olarak kapalı (`allowBackup=false` +
 * `data_extraction_rules` her domaini dışlıyor) ve bulut senkronu yok. Yani
 * telefon kaybı, sıfırlama ya da uygulamayı silmek TÜM finansal geçmişin kalıcı
 * kaybı demek — Android'in normalde yaptığı otomatik geri yüklemeye güvenen
 * kullanıcı bunu ancak iş işten geçtikten sonra öğrenir. Tek telafi elle alınan
 * yedek olduğuna göre, onu hatırlatmak uygulamanın işi.
 */
const lastExportAt = ref<string | null>(null)
const loaded = ref(false)

/**
 * Kullanıcının ertelemesi — hatırlatmanın tekrar görünebileceği en erken an.
 *
 * Eskiden bu yalnızca oturum içi bir bayraktı: çarpıya basmak uygulama kapanana
 * kadar susturuyor, sonraki açılışta uyarı geri geliyordu — yani kapatma butonu
 * pratikte hiçbir işe yaramıyordu. Artık damga Preferences'ta duruyor ve
 * `BACKUP_SNOOZE_DAYS` boyunca geçerli. Süresiz susturmak istemiyoruz: cihaz
 * kaybında tek telafi elle alınan yedek.
 */
const snoozedUntil = ref<string | null>(null)

/**
 * "Şimdi"nin reaktif hali.
 *
 * Süreç mobilde günlerce arka planda kalabiliyor. `Date.now()`'ı doğrudan
 * computed içinde okumak sonucu reaktif olmayan bir değere bağlardı: uygulama
 * öne geldiğinde damga değişmediği için hiçbir bağımlılık tetiklenmez ve şerit
 * eski gün sayısında donardı. `refresh()` her çağrıldığında (açılış + her
 * resume) bu damga ilerler.
 */
const evaluatedAt = ref(Date.now())

let inflight: Promise<void> | null = null

/**
 * Yazma sayacı — okuma ile yazmanın yarışını çözer.
 *
 * `refresh()` bir bridge çağrısı bekliyorken araya `markExported()` girerse
 * (yedek alındı) okuma, kendinden ESKİ değerle geri dönüp taze damgayı eziyor
 * ve uyarı yedek alınmasına rağmen yeniden görünüyordu. Okuma başlarken sayacı
 * not eder, bitince değişmişse sonucu atar: arada yapılan yazma her zaman
 * kazanır, çünkü o zaten diskteki gerçeğin ta kendisi.
 */
let writeGeneration = 0

export function useBackupReminder() {
    const applyStatus = (status: { lastExportAt: string | null; snoozedUntil: string | null }) => {
        lastExportAt.value = status.lastExportAt
        snoozedUntil.value = status.snoozedUntil
    }

    /** Durumu okur. Idempotent ve eşzamanlı çağrılarda tek okuma yapar. */
    const refresh = async (): Promise<void> => {
        inflight ??= (async () => {
            const startedAt = writeGeneration
            try {
                const status = await readStatus()

                // Okuma sürerken yazma olduysa disk zaten daha güncel.
                if (writeGeneration === startedAt) applyStatus(status)
            } finally {
                evaluatedAt.value = Date.now()
                loaded.value = true
                inflight = null
            }
        })()

        return inflight
    }

    /** Başarılı dışa aktarmadan sonra çağrılır; hatırlatma anında kaybolur. */
    const markExported = async (): Promise<void> => {
        writeGeneration++
        lastExportAt.value = await recordExport()
        snoozedUntil.value = null
        evaluatedAt.value = Date.now()
        loaded.value = true
    }

    /**
     * Kullanıcı hatırlatmayı kapattı: `BACKUP_SNOOZE_DAYS` boyunca susulur.
     *
     * Kart önce yerel olarak gizlenir, yazma arkadan tamamlanır — kalıcılık
     * beklenirken çarpı tepkisiz kalmasın.
     */
    const dismiss = async (): Promise<void> => {
        writeGeneration++
        const optimisticUntil = new Date(
            Date.now() + BACKUP_SNOOZE_DAYS * 24 * 60 * 60 * 1000
        ).toISOString()
        snoozedUntil.value = optimisticUntil
        evaluatedAt.value = Date.now()

        try {
            snoozedUntil.value = await recordSnooze()
            // Yazma sırasında geçen süre kadar ileri: `evaluatedAt` yazmadan
            // önceye kalırsa taze erteleme "gelecekte çok uzak" görünür.
            evaluatedAt.value = Date.now()
        } catch (error) {
            // Yazma patlarsa kart bu oturumda yine de kapalı kalır; erteleme
            // yalnızca kalıcılığını kaybeder. Kapatma tepkisiz görünmesin diye
            // hata yukarı fırlatılmıyor.
            logger.warn('Yedek hatırlatıcısı ertelemesi yazılamadı', { context: 'backupReminder', error })
        }
    }

    const daysSince = computed(() => daysSinceExport(lastExportAt.value, evaluatedAt.value))
    const hasEverExported = computed(() => lastExportAt.value !== null)

    /**
     * Yedek gerçekten bayat mı — kapatma tercihinden bağımsız ham durum.
     *
     * `shouldWarn`ın parçası; tek başına bir yüzeye bağlanmıyor. Kapatmadan
     * bağımsız bir "iz" rozeti denendi ve kaldırıldı: kullanıcı kapattığı
     * uyarının kalıntısını taşımaya devam ediyordu.
     *
     * Damga okunmadan false: aksi hâlde her açılışta bir an için yanlış uyarı
     * yanardı.
     */
    const isStale = computed(() =>
        loaded.value && isBackupStale(lastExportAt.value, evaluatedAt.value)
    )

    /** Kullanıcının ertelemesi hâlâ sürüyor mu. */
    const snoozeActive = computed(() => isSnoozed(snoozedUntil.value, evaluatedAt.value))

    /**
     * Hatırlatma gösterilmeli mi — Ana Sayfa kartı, sekme noktası ve Ayarlar
     * listesindeki satır rozetinin ORTAK koşulu. Çarpı üçünü birden erteler.
     *
     * `hasData` çağırandan gelir: verisi olmayan yeni kurulumda "yedek al"
     * demek anlamsız gürültü olurdu.
     */
    const shouldWarn = (hasData: boolean) =>
        isStale.value && hasData && !snoozeActive.value

    return {
        lastExportAt,
        loaded,
        daysSince,
        hasEverExported,
        staleAfterDays: BACKUP_STALE_AFTER_DAYS,
        snoozeDays: BACKUP_SNOOZE_DAYS,
        snoozeActive,
        refresh,
        markExported,
        dismiss,
        shouldWarn,
    }
}
