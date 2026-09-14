import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Preferences } from '@capacitor/preferences'
import { logger } from '@/infrastructure/logging'

/**
 * Yedek dosyasının cihazla olan tüm teması: yazma, paylaşma, seçtirme, okuma.
 *
 * Yedeğin İÇERİĞİ `BackupService`'in işi; burası yalnızca o içeriğin platforma
 * nasıl indiğiyle ilgilenir. UI bilmez, i18n bilmez — kullanıcıya gösterilecek
 * metinler parametre olarak geçirilir.
 */

const LOG_CONTEXT = 'BackupFileStorage'

/**
 * Dosyanın nereye yazılacağı.
 *
 * - `documents`: cihazın public Documents klasörü. Kullanıcı dosyayı sonradan
 *   "Dosyalar" uygulamasından bulabilsin diye — yedekler için doğru yer.
 * - `share`: uygulamanın özel cache klasörü, ardından paylaşım sheet'i. Dosya
 *   cihazda kalmak için değil, dışarı çıkmak için üretiliyor.
 */
export type ExportDestination = 'documents' | 'share'

/** Yedeğin nereye yazıldığı — UI kullanıcıya konumu söyleyebilsin diye. */
export interface ExportLocation {
    uri: string
    /**
     * `documents`: public Documents · `app`: uygulamanın kendi klasörü
     * (Documents'a yazılamadı) · `share`: özel cache, paylaşılmak üzere.
     */
    scope: 'documents' | 'app' | 'share'
}

/**
 * Paylaşımın sonucu.
 *
 * `cancelled` ile `unavailable` ayrı: `share` hedefinde dosya yalnızca
 * geçici klasörde durduğu için çağıran, kullanıcıya "dosya nereye gitti"
 * sorusunun doğru cevabını vermeli — platform paylaşamıyor mu, yoksa
 * kullanıcı mı vazgeçti.
 */
export type ShareOutcome = 'shared' | 'cancelled' | 'unavailable'

/** Paylaşım sheet'inde görünecek metinler; çeviri çağıranın sorumluluğunda. */
export interface ShareTexts {
    title: string
    text: string
    dialogTitle: string
}

/** Dosya okunamadığında fırlatılır; kullanıcı metnini çağıran belirler. */
export class FileReadError extends Error {
    constructor(cause?: unknown) {
        super('Yedek dosyası okunamadı')
        this.name = 'FileReadError'
        this.cause = cause
    }
}

export function buildBackupFileName(encrypted = false): string {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
        now.getHours(),
    )}${pad(now.getMinutes())}`
    // Şifreli/şifresiz ayrımı dosya adından görünsün: kullanıcı hangisini
    // paylaştığını dosyayı açmadan bilmeli.
    const suffix = encrypted ? '-encrypted' : ''
    return `budget-watchdog-backup-${stamp}${suffix}.json`
}

/**
 * Yedeği platforma uygun şekilde kaydeder.
 *
 * Native'de cihaza yazar ve konumu döner; web'de tarayıcı indirmesini tetikler
 * ve `null` döner (dosya kullanıcının indirilenler klasöründe, konumunu
 * uygulama bilemez).
 */
export async function saveBackupFile(
    json: string,
    fileName: string,
    destination: ExportDestination = 'documents'
): Promise<ExportLocation | null> {
    if (Capacitor.isNativePlatform()) {
        return writeNativeFile(json, fileName, destination)
    }

    downloadInBrowser(json, fileName)
    return null
}

/**
 * Dosyayı cihaza yazar. Paylaşım sheet'ini AÇMAZ — o çağıranın ayrı kararı.
 *
 * Documents (public) önce denenir çünkü "Dosyalar" uygulamasından görünen tek
 * yer orası. Android 11+ scoped storage altında bu yazım reddedilebiliyor;
 * o durumda uygulamanın kendi harici klasörüne düşüyoruz — yedeğin hiç
 * oluşmaması, görünmeyen bir yerde oluşmasından çok daha kötü.
 */
async function writeNativeFile(
    json: string,
    fileName: string,
    destination: ExportDestination
): Promise<ExportLocation> {
    const write = (directory: Directory) =>
        Filesystem.writeFile({
            path: fileName,
            data: json,
            directory,
            encoding: Encoding.UTF8,
            recursive: true,
        })

    // Paylaşılmak üzere üretilen dosya public klasöre HİÇ yazılmaz: şifresiz
    // finansal geçmişin, kullanıcı onu bir yere gönderene kadar herkesin
    // okuyabileceği bir klasörde beklemesi gereksiz bir maruziyet. Cache
    // uygulamaya özel ve sistem tarafından temizlenebilir — geçici bir
    // paylaşım artefaktı için doğru yer.
    if (destination === 'share') {
        const result = await write(Directory.Cache)
        logger.info('Paylaşım için geçici dosya yazıldı', {
            context: LOG_CONTEXT,
            data: { uri: result.uri },
        })
        return { uri: result.uri, scope: 'share' }
    }

    try {
        const result = await write(Directory.Documents)
        logger.info('Yedek Documents klasörüne yazıldı', {
            context: LOG_CONTEXT,
            data: { uri: result.uri },
        })
        return { uri: result.uri, scope: 'documents' }
    } catch (error) {
        logger.warn('Documents klasörüne yazılamadı, uygulama klasörüne düşülüyor', {
            context: LOG_CONTEXT,
            error,
        })

        const result = await write(Directory.External)
        logger.info('Yedek uygulama klasörüne yazıldı', {
            context: LOG_CONTEXT,
            data: { uri: result.uri },
        })
        return { uri: result.uri, scope: 'app' }
    }
}

/** Web fallback: Blob + anchor download. */
function downloadInBrowser(json: string, fileName: string): void {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Kaydedilmiş yedeği paylaşım sheet'iyle dışarı verir (Drive, e-posta, ...).
 * Export'tan ayrı: dosya zaten cihazda, paylaşmak isteğe bağlı.
 */
export async function shareBackupFile(uri: string, texts: ShareTexts): Promise<ShareOutcome> {
    let available = false
    try {
        const canShare = await Share.canShare()
        available = !!canShare.value
    } catch (err) {
        logger.warn('Share desteği sorgulanamadı', { context: LOG_CONTEXT, error: err })
        return 'unavailable'
    }

    if (!available) return 'unavailable'

    try {
        await Share.share({
            title: texts.title,
            text: texts.text,
            url: uri,
            dialogTitle: texts.dialogTitle,
        })
        // Android sheet'i kapatıldığında hata fırlatır; buraya düşmek kullanıcının
        // bir hedef seçtiği anlamına gelir. Hedefin işi bitirip bitirmediğini
        // platform bildirmiyor.
        return 'shared'
    } catch (err) {
        logger.warn('Share iptal edildi', { context: LOG_CONTEXT, error: err })
        return 'cancelled'
    }
}

/**
 * Kullanıcıya dosya seçtirir. İptal edilirse `null`.
 *
 * Her platformda `<input type="file">` — Capacitor WebView'i de bunu native
 * dosya seçicisine yönlendirir.
 */
export function pickBackupFile(): Promise<File | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'application/json,.json'
        input.style.display = 'none'

        let resolved = false
        const safeResolve = (value: File | null) => {
            if (resolved) return
            resolved = true
            if (input.parentNode) {
                document.body.removeChild(input)
            }
            resolve(value)
        }

        input.onchange = () => {
            const file = input.files?.[0] ?? null
            safeResolve(file)
        }

        // Kullanıcı iptal ederse onchange tetiklenmez; focus event ile cleanup
        const onFocus = () => {
            setTimeout(() => safeResolve(null), 1500)
        }
        window.addEventListener('focus', onFocus, { once: true })

        document.body.appendChild(input)
        input.click()
    })
}

export function readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(new FileReadError(reader.error))
        reader.readAsText(file)
    })
}

/**
 * Veritabanı DIŞINDAKİ kalıcı depoları temizler: Capacitor Preferences
 * (PIN, güvenlik ayarları, onboarding bayrakları) ve localStorage.
 *
 * Tek tek yutulur: biri patlarsa diğeri yine de temizlenmeli — yarım kalan
 * bir sıfırlama, hiç başlamamış olandan daha kötü.
 */
export async function clearDeviceStorage(): Promise<void> {
    try {
        await Preferences.clear()
    } catch (err) {
        logger.warn('Preferences.clear başarısız', { context: LOG_CONTEXT, error: err })
    }

    try {
        localStorage.clear()
    } catch (err) {
        logger.warn('localStorage.clear başarısız', { context: LOG_CONTEXT, error: err })
    }
}
