import { Preferences } from '@capacitor/preferences'
import { logger } from '@/infrastructure/logging'

const CTX = 'backupStatus'

const STORAGE_KEY = 'budget_watchdog_backup_status_v1'

/**
 * Yedek damgasının eski yeri.
 *
 * `localStorage` WebView'in kendi deposu; iOS'ta sistem yer açmak için temizler,
 * Android'de "önbelleği temizle" ile gidebilir. Damganın kaybolması "hiç yedek
 * alınmamış" gibi görünür — hatırlatıcıyı gereksiz yere tetikler ve daha kötüsü,
 * kullanıcı yedek aldığını sanıp damgayı kaybettiğinde uyarı hiç çıkmazdı.
 * Preferences native tarafta (Android SharedPreferences) durur.
 */
const LEGACY_LOCALSTORAGE_KEY = 'bw:lastExportAt'

/**
 * Yedek kaç gün sonra "bayat" sayılır.
 *
 * Cihaz yedeği kapalı (allowBackup=false) ve bulut senkronu yok: kullanıcının
 * verisi yalnızca bu cihazda. İki hafta, telefon kaybında kabul edilebilir en
 * fazla veri kaybı olarak seçildi.
 */
export const BACKUP_STALE_AFTER_DAYS = 14

/**
 * Kullanıcı hatırlatmayı kapattığında kaç gün susulur.
 *
 * Kapatma eskiden yalnızca o oturum için geçerliydi: kullanıcı çarpıya bastıktan
 * sonra uygulamayı kapatıp açınca uyarı geri geliyordu, yani kapatma butonu
 * pratikte hiçbir şey yapmıyordu. Kalıcı bir "bir daha gösterme" ise uyarıyı
 * işlevsiz kılardı — telefon kaybında tüm finansal geçmiş gidiyor.
 *
 * Üç gün, iki uçtan da uzak: aynı gün içinde tekrar tekrar çıkmaz ama bayatlık
 * eşiğinin (14 gün) yanında kaybolacak kadar da uzun değil.
 */
export const BACKUP_SNOOZE_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

interface StoredStatus {
    lastExportAt: string | null
    /** Hatırlatmanın tekrar görünebileceği en erken an (ISO); yoksa `null`. */
    snoozedUntil: string | null
}

const EMPTY_STATUS: StoredStatus = { lastExportAt: null, snoozedUntil: null }

function readLegacyTimestamp(): string | null {
    try {
        return localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)
    } catch {
        return null
    }
}

function clearLegacyTimestamp(): void {
    try {
        localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY)
    } catch { /* yoksay */ }
}

async function write(status: StoredStatus): Promise<void> {
    await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(status) })
}

/**
 * Kalıcı yedek durumu: son yedek damgası + erteleme sonu.
 *
 * İlk okumada eski `localStorage` damgası varsa devralınır: aksi hâlde mevcut
 * kullanıcılar güncellemeden sonra "hiç yedek almamış" görünüp gereksiz uyarı
 * alırdı. Eski kayıtlarda `snoozedUntil` alanı yok; eksik alan `null` sayılır.
 */
export async function readStatus(): Promise<StoredStatus> {
    try {
        const { value } = await Preferences.get({ key: STORAGE_KEY })

        if (value) {
            const parsed = JSON.parse(value) as Partial<StoredStatus>
            return {
                lastExportAt: typeof parsed.lastExportAt === 'string' ? parsed.lastExportAt : null,
                snoozedUntil: typeof parsed.snoozedUntil === 'string' ? parsed.snoozedUntil : null,
            }
        }
    } catch (error) {
        logger.warn('Yedek durumu okunamadı', { context: CTX, error })
        return EMPTY_STATUS
    }

    const legacy = readLegacyTimestamp()

    if (!legacy) {
        return EMPTY_STATUS
    }

    try {
        await write({ lastExportAt: legacy, snoozedUntil: null })
        clearLegacyTimestamp()
        logger.info('Yedek damgası Preferences\'a taşındı', { context: CTX })
    } catch (error) {
        // Taşıma başarısızsa eski damga yerinde kalsın; sonraki açılış yeniden dener.
        logger.warn('Yedek damgası taşınamadı', { context: CTX, error })
    }

    return { lastExportAt: legacy, snoozedUntil: null }
}

/** Son yedek zamanı (ISO) ya da hiç alınmadıysa `null`. */
export async function readLastExportAt(): Promise<string | null> {
    return (await readStatus()).lastExportAt
}

/**
 * Başarılı bir dışa aktarmayı kaydeder ve yazılan damgayı döndürür.
 *
 * Ertelemeyi de siler: yedek alındıktan sonra saklanacak bir "sus" durumu
 * kalmaz, ve bir sonraki bayatlamada uyarı ilk günden görünmelidir.
 */
export async function recordExport(at: Date = new Date()): Promise<string> {
    const iso = at.toISOString()

    await write({ lastExportAt: iso, snoozedUntil: null })
    clearLegacyTimestamp()

    return iso
}

/**
 * Hatırlatmayı `BACKUP_SNOOZE_DAYS` kadar erteler; yeni erteleme sonunu döndürür.
 *
 * Damga korunur — erteleme yedeğin yaşını sıfırlamaz, yalnızca uyarıyı susturur.
 */
export async function recordSnooze(at: Date = new Date()): Promise<string> {
    const until = new Date(at.getTime() + BACKUP_SNOOZE_DAYS * DAY_MS).toISOString()

    const current = await readStatus()
    await write({ lastExportAt: current.lastExportAt, snoozedUntil: until })

    return until
}

/**
 * Erteleme hâlâ sürüyor mu.
 *
 * Üst sınır, cihaz saati geriye alındığında ertelemenin süresiz sürmesini
 * engeller: pencereden çok uzak bir "son" yok sayılır. Sınıra bir gün tolerans
 * var çünkü `now` erteleme yazılmadan HEMEN ÖNCE okunmuş olabiliyor; toleranssız
 * karşılaştırmada milisaniyelik bir fark bile taze ertelemeyi geçersiz sayıp
 * uyarıyı anında geri getiriyordu.
 */
export function isSnoozed(
    snoozedUntil: string | null,
    now: number = Date.now(),
): boolean {
    if (!snoozedUntil) return false

    const until = new Date(snoozedUntil).getTime()

    if (!Number.isFinite(until)) return false

    return until > now && until <= now + (BACKUP_SNOOZE_DAYS + 1) * DAY_MS
}

/**
 * Son yedeğin üzerinden geçen tam gün sayısı; hiç yedek yoksa `null`.
 *
 * `now` dışarıdan verilebilir: mobilde süreç günlerce arka planda kalabiliyor
 * ve `Date.now()`'ı içeride okumak, sonucu reaktif olmayan bir değere bağlardı
 * — uygulama öne geldiğinde şerit hâlâ eski gün sayısını gösterirdi.
 */
export function daysSinceExport(
    lastExportAt: string | null,
    now: number = Date.now(),
): number | null {
    if (!lastExportAt) return null

    const then = new Date(lastExportAt).getTime()

    if (!Number.isFinite(then)) return null

    // Gelecek tarihli damga (cihaz saati geriye alınmış) 0 sayılır; negatif bir
    // "gün" hem metinde hem eşik karşılaştırmasında saçmalardı.
    return Math.max(0, Math.floor((now - then) / DAY_MS))
}

/** Yedek yok ya da eşiği aştı mı. */
export function isBackupStale(
    lastExportAt: string | null,
    now: number = Date.now(),
): boolean {
    const days = daysSinceExport(lastExportAt, now)

    return days === null || days >= BACKUP_STALE_AFTER_DAYS
}
