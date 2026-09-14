import { DatabaseFactory } from '@/infrastructure/database/database-factory'
import { backupService } from '@/infrastructure/services/backup.service'
import { clearDeviceStorage } from '@/infrastructure/services/backup-file-storage'
import { logger } from '@/infrastructure/logging'
import type { PersistenceFailure } from './persistence-status'

const CTX = 'recovery'

/**
 * Açılış patladığında kullanılabilecek platform işlemleri.
 *
 * Ekranın (RecoveryPage.vue) yalnızca akışı yönetmesi için native ayrıntılar
 * burada toplanıyor — projedeki diğer "sayfa akışı / servis platformu" ayrımıyla
 * aynı (bkz. useBackup ↔ backup-file-storage).
 */

/**
 * `deleted`         → dosya gerçekten silindi, yeniden başlatmak temiz kurulum verir.
 * `manual-required` → uygulama içinden silinemedi; kullanıcı sistem ayarlarından
 *                     uygulama verisini temizlemeli.
 */
export type ResetOutcome = 'deleted' | 'manual-required'

/**
 * Açılış akışı kapalı bırakmış olsa da veritabanını açıp yedeği üretir.
 *
 * `tolerateMissingTables` AÇIK: patlayan bir migration'dan sonra şema son
 * başarılı sürümde durur ve yeni tablolar henüz yoktur. Eksik bir yedek,
 * kullanıcının verisini hiç çıkaramamasından iyidir; atlanan tablolar
 * yedeğin `meta.skippedTables` alanına yazılır.
 *
 * Şifreleme anahtarı kaybolduysa bu çağrı da patlar — orada okunabilecek veri
 * zaten yok; çağıran hatayı kullanıcıya olduğu gibi göstermeli.
 */
export async function exportRecoveryBackup(passphrase?: string): Promise<string> {
    const db = await DatabaseFactory.openForRecovery()

    try {
        return await backupService.exportToJson(true, passphrase, {
            db,
            tolerateMissingTables: true,
        })
    } finally {
        // Kurtarma bağlantısı singleton'a yazılmıyor; kapatmak çağıranın işi.
        await db.close().catch(error => {
            logger.debug('Kurtarma bağlantısı kapatılamadı', { context: CTX, error })
        })
    }
}

/**
 * Veritabanını silip cihaz depolarını temizler — son çare.
 *
 * Yalnızca AÇILABİLEN bir veritabanı silinir. Açılamayan dosyaya (anahtarı
 * kayıp olan) dokunulmaz: plugin'in silme yolu dosyayı önce açmayı deniyor ve
 * tam orada patlıyor, "şifresiz aç" diye zorlamak ise kullanıcının verisiyle
 * kumar oynamak olurdu. Böyle bir durumda `manual-required` dönülür ve ekran
 * kullanıcıya sistem ayarlarından veri temizlemeyi anlatır.
 *
 * Sonuç ASLA doğrulanmadan `deleted` sayılmaz: "silindi" deyip silmemek,
 * kullanıcıyı çalışmayan bir çözümle baş başa bırakan en kötü sonuç.
 */
export async function resetDatabase(): Promise<ResetOutcome> {
    let adapter: Awaited<ReturnType<typeof DatabaseFactory.openForRecovery>>

    try {
        adapter = await DatabaseFactory.openForRecovery()
    } catch (error) {
        logger.warn('Kurtarma: veritabanı açılamadı, dosya silinemiyor', { context: CTX, error })
        return 'manual-required'
    }

    try {
        await adapter.deleteDatabaseFile()
    } catch (error) {
        logger.error('Kurtarma: veritabanı dosyası silinemedi', { context: CTX, error })
        return 'manual-required'
    }

    // PIN, güvenlik ayarları ve onboarding bayrakları DB dışında duruyor;
    // biri silinip diğeri kalırsa temiz kurulum kilitli açılırdı.
    await clearDeviceStorage()

    return 'deleted'
}

/**
 * Destek/hata bildirimi için tek metin: hata özeti + kalıcı log dökümü.
 *
 * Yedekten farklı olarak finansal veri İÇERMEZ — kullanıcı bunu çekinmeden
 * paylaşabilmeli.
 */
export function buildDiagnosticsReport(failure: PersistenceFailure | null): string {
    const lines = [
        '# Budget Watchdog — kurtarma tanılaması',
        `generatedAt: ${new Date().toISOString()}`,
        `platform: ${navigator.userAgent}`,
        '',
        '## Açılış hatası',
        failure
            ? [
                `kind: ${failure.kind}`,
                `at: ${failure.at}`,
                failure.migration
                    ? `migration: ${failure.migration.version} (${failure.migration.name})`
                    : 'migration: -',
                failure.schema
                    ? `schema: onDisk=${failure.schema.onDisk} supported=${failure.schema.supported}`
                    : 'schema: -',
                `detail: ${failure.detail}`,
            ].join('\n')
            : 'Kayıtlı açılış hatası yok.',
        '',
        '## Loglar',
        logger.export() || 'Log kaydı yok.',
    ]

    return lines.join('\n')
}
