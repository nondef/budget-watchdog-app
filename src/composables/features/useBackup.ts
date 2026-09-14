import { ref } from 'vue'
import { alertController, toastController } from '@ionic/vue'
import {
  backupService,
  PassphraseRequiredError,
  type ImportMode,
  type ImportResult,
} from '@/infrastructure/services/backup.service'
import {
  buildBackupFileName,
  clearDeviceStorage,
  FileReadError,
  pickBackupFile,
  readFileAsText,
  saveBackupFile,
  shareBackupFile,
  type ExportDestination,
  type ExportLocation,
  type ShareOutcome,
} from '@/infrastructure/services/backup-file-storage'
import { DecryptionFailedError, EncryptionUnavailableError } from '@/shared/utils/crypto/backup-crypto'
import { i18n } from '@/i18n'

// Bu composable Vue setup dışından da (alert/toast handler'ları) çalışıyor;
// useI18n() yerine global örnek kullanılıyor.
const t = i18n.global.t

// Yedeğin içeriği `backup.service`, dosyanın cihaza inişi `backup-file-storage`
// sorumluluğunda (ikisi de infrastructure/services altında). Aşağıdaki tipler
// burada yeniden dışa verilir ki BackupPage/PrivacyPage tek yerden import etsin.
export type { ExportDestination, ExportLocation, ShareOutcome }

/**
 * BackupPage UI'sının tüketeceği composable.
 *
 * Yalnızca akışı yönetir: reaktif durum, kullanıcı diyalogları ve bunların
 * hangi sırayla servislere bağlandığı. Dosya sistemi, paylaşım ve dosya seçimi
 * `backup-file-storage`'a; yedeğin üretilmesi/okunması `backupService`'e ait.
 */

/**
 * Yedek parolası için alt sınır. Kısa parola, çevrimdışı saldırıda PBKDF2'nin
 * 600k turunu bile anlamsız kılar.
 */
const MIN_PASSPHRASE_LENGTH = 8

export function useBackup() {
  const isExporting = ref(false)
  const isImporting = ref(false)
  const isWiping = ref(false)
  const lastError = ref<string | null>(null)
  const lastResult = ref<ImportResult | null>(null)

  /** Paylaşım sheet'i metinleri; servis i18n bilmediği için buradan geçilir. */
  const shareBackup = (uri: string): Promise<ShareOutcome> =>
    shareBackupFile(uri, {
      title: t('backup.share.title'),
      text: t('backup.share.text'),
      dialogTitle: t('backup.share.dialogTitle'),
    })

  /**
   * Yedeği üretip cihaza yazar ve nereye yazıldığını döndürür.
   * Paylaşım burada tetiklenmiyor — çağıran isterse `shareBackup(location.uri)`
   * çağırır. Web'de dosya doğrudan indiği için `null` döner.
   *
   * `passphrase` verilmezse ŞİFRESİZ yedek üretir. Varsayılanı çağıran taraf
   * belirler; BackupPage şifreliyi varsayılan yapar ve şifresizi ayrı, açıkça
   * uyarılmış bir seçenek olarak sunar.
   */
  async function exportToFile(
    passphrase?: string,
    destination: ExportDestination = 'documents'
  ): Promise<ExportLocation | null> {
    if (isExporting.value) return null
    isExporting.value = true
    lastError.value = null
    try {
      const json = await backupService.exportToJson(true, passphrase)
      const fileName = buildBackupFileName(!!passphrase)

      return await saveBackupFile(json, fileName, destination)
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : t('backup.exportFailed')
      throw err
    } finally {
      isExporting.value = false
    }
  }

  /**
   * Şifresiz dışa aktarma için açık rıza ister.
   *
   * Uygulamanın kendi veritabanı SQLCipher ile şifreli tutuluyor; düz metin bir
   * kopya üretmek bilinçli bir istisna ve kullanıcı riski bilerek kabul etmeli.
   * Yedek ekranı bu kapıyı zaten koyuyordu, gizlilik ekranı ise aynı dosyayı
   * hiçbir uyarı olmadan üretiyordu — kural tek yerde dursun diye buraya alındı.
   *
   * @param titleKey Başlık çeviri anahtarı. Yedek ekranı "Şifresiz Yedek"
   *   der; gizlilik ekranındaki veri indirme bir yedek değil, kendi başlığını
   *   geçer.
   * @return Devam edilmeli mi.
   */
  async function confirmPlainExport(titleKey = 'backup.encryption.plainTitle'): Promise<boolean> {
    const alert = await alertController.create({
      header: t(titleKey),
      message: t('backup.encryption.plainWarning'),
      buttons: [
        { text: t('backup.wipe.cancel'), role: 'cancel' },
        { text: t('backup.encryption.plainConfirm'), role: 'confirm' },
      ],
    })
    await alert.present()

    const { role } = await alert.onDidDismiss()
    return role === 'confirm'
  }

  /**
   * Dışa aktarma sonrasını kullanıcıya bildirir: dosya nereye yazıldı ve
   * isterse paylaşabilir.
   *
   * `exportToFile` paylaşım sheet'ini bilinçli olarak açmıyor, konumu da
   * yalnızca dönüş değerinde veriyor. Bu dönüşü kullanmayan çağıran, native'de
   * kullanıcıyı dosyanın nerede olduğunu bilmeden bırakıyor — Documents'a
   * yazılamayıp uygulama klasörüne düşüldüğünde dosya pratikte erişilemez hale
   * geliyordu. Sunumu tek yere almak iki ekranın ayrışmasını engelliyor.
   *
   * @param location `exportToFile` dönüşü; `null` ise web'de dosya zaten indi.
   */
  async function presentExportResult(
    location: ExportLocation | null,
    options: {
      /** Web'de dosya zaten indi; gösterilecek bilgi mesajı. */
      webMessage: string
      webColor?: 'success' | 'warning'
      /**
       * `share` hedefinde kullanıcı paylaşmaktan vazgeçtiyse gösterilecek
       * mesaj. Dosya geçici klasörde kaldığı için elde bir şey kalmaz —
       * varsayılan metin bunu söyler, yedek akışı daha sert bir uyarı geçer.
       */
      notSharedMessage?: string
    }
  ): Promise<void> {
    if (!location) {
      await showBackupToast(options.webMessage, options.webColor ?? 'success')
      return
    }

    // Paylaşılmak üzere üretilen dosya kullanıcının erişebileceği bir yerde
    // değil; "kaydedildi, paylaşmak ister misin?" diye sormak yanıltıcı olur.
    // Doğrudan sheet açılır.
    if (location.scope === 'share') {
      const outcome = await shareBackup(location.uri)
      if (outcome === 'shared') return

      await showBackupToast(
        outcome === 'unavailable'
          ? t('backup.share.unavailable')
          : options.notSharedMessage ?? t('backup.share.notKept'),
        'warning'
      )
      return
    }

    const saved = await alertController.create({
      header: t('backup.saved.title'),
      message: location.scope === 'documents'
        ? t('backup.saved.inDocuments')
        : t('backup.saved.inAppFolder'),
      buttons: [
        { text: t('backup.saved.done'), role: 'cancel' },
        { text: t('backup.saved.share'), role: 'confirm' },
      ],
    })
    await saved.present()

    const { role } = await saved.onDidDismiss()
    if (role === 'confirm') await shareBackup(location.uri)
  }

  /**
   * Mevcut bir yedeğin parolasını sorar. İptal → null.
   * `mode` yalnızca başlık/mesajı değiştirir (ilk deneme mi, yanlış parola mı).
   */
  async function promptPassphrase(mode: 'import' | 'retry' = 'import'): Promise<string | null> {
    const alert = await alertController.create({
      header: t('backup.encryption.enterTitle'),
      message: mode === 'retry'
        ? t('backup.encryption.wrongPassphrase')
        : t('backup.encryption.enterMessage'),
      inputs: [
        {
          name: 'passphrase',
          type: 'password',
          placeholder: t('backup.encryption.passphrasePlaceholder'),
        },
      ],
      buttons: [
        { text: t('backup.wipe.cancel'), role: 'cancel' },
        { text: t('backup.encryption.unlock'), role: 'confirm' },
      ],
    })
    await alert.present()

    const { role, data } = await alert.onDidDismiss<{ values: { passphrase?: string } }>()
    if (role !== 'confirm') return null

    const value = data?.values?.passphrase ?? ''
    return value.length ? value : null
  }

  /**
   * Yeni yedek için parola sorar (iki kez, doğrulamalı).
   *
   * Parola unutulursa yedek KURTARILAMAZ — bu, cihaz kaybında kullanıcının
   * tek geri dönüş yolu olduğu için diyalog bunu açıkça söylüyor.
   * İptal → null.
   */
  async function promptNewPassphrase(): Promise<string | null> {
    const alert = await alertController.create({
      header: t('backup.encryption.setTitle'),
      message: t('backup.encryption.setMessage'),
      inputs: [
        { name: 'passphrase', type: 'password', placeholder: t('backup.encryption.passphrasePlaceholder') },
        { name: 'confirm', type: 'password', placeholder: t('backup.encryption.confirmPlaceholder') },
      ],
      buttons: [
        { text: t('backup.wipe.cancel'), role: 'cancel' },
        { text: t('backup.encryption.encryptAction'), role: 'confirm' },
      ],
    })
    await alert.present()

    const { role, data } = await alert.onDidDismiss<{
      values: { passphrase?: string; confirm?: string }
    }>()
    if (role !== 'confirm') return null

    const passphrase = data?.values?.passphrase ?? ''
    const confirm = data?.values?.confirm ?? ''

    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      await showBackupToast(t('backup.encryption.tooShort', { min: MIN_PASSPHRASE_LENGTH }), 'warning')
      return promptNewPassphrase()
    }

    if (passphrase !== confirm) {
      await showBackupToast(t('backup.encryption.mismatch'), 'warning')
      return promptNewPassphrase()
    }

    return passphrase
  }

  async function showBackupToast(message: string, color: string) {
    const toast = await toastController.create({
      message, duration: 2800, color, position: 'bottom',
    })
    await toast.present()
  }

  /**
   * Dosya seçtirir, gerekiyorsa parola sorar ve içe aktarır.
   *
   * Parola akışı burada: dosya şifreliyse kullanıcıya sorulur, yanlış parolada
   * dosya seçimine geri dönmeden tekrar sorulur. İptal → `null` (hata değil).
   */
  async function importFromFile(mode: ImportMode = 'replace'): Promise<ImportResult | null> {
    if (isImporting.value) return null
    lastError.value = null
    lastResult.value = null

    const file = await pickBackupFile()
    if (!file) return null

    isImporting.value = true
    try {
      const json = await readFileAsText(file)

      let passphrase: string | undefined

      if (backupService.isEncrypted(json)) {
        const entered = await promptPassphrase('import')
        if (entered === null) return null
        passphrase = entered
      }

      for (;;) {
        try {
          const result = await backupService.import(json, mode, passphrase)
          lastResult.value = result
          return result
        } catch (err) {
          if (err instanceof DecryptionFailedError) {
            const retry = await promptPassphrase('retry')
            if (retry === null) return null
            passphrase = retry
            continue
          }
          throw err
        }
      }
    } catch (err) {
      if (err instanceof PassphraseRequiredError) {
        lastError.value = t('backup.encryption.passphraseRequired')
      } else if (err instanceof EncryptionUnavailableError) {
        lastError.value = t('backup.encryption.unavailable')
      } else if (err instanceof FileReadError) {
        lastError.value = t('backup.fileReadFailed')
      } else {
        lastError.value = err instanceof Error ? err.message : t('backup.importFailedGeneric')
      }
      throw err
    } finally {
      isImporting.value = false
    }
  }

  /**
   * Tüm uygulama verisini siler:
   *  - SQLite tabloları (DELETE FROM, FK güvenli sırada)
   *  - Capacitor Preferences (PIN, security ayarları, app onboarding bayrakları)
   *  - localStorage (lastExportAt, eski auth kalıntıları)
   *
   * Çağıran taraf bu işlemden sonra uygulamayı yeniden başlatmalı (location.reload),
   * çünkü Pinia store'ları bellekte hala eski veriyi tutuyor olur.
   */
  async function wipeAllData(): Promise<void> {
    if (isWiping.value) return
    isWiping.value = true
    lastError.value = null
    try {
      await backupService.wipeAll()
      await clearDeviceStorage()
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : t('backup.wipe.failed')
      throw err
    } finally {
      isWiping.value = false
    }
  }

  /**
   * İki adımlı onay akışı + wipeAllData + reload. BackupPage ve PrivacyPage
   * aynı silme deneyimini paylaşsın diye buraya taşındı.
   *
   * Dönüş:
   *  - 'cancelled'  → kullanıcı iptal etti
   *  - 'mismatch'   → onay metni eşleşmedi
   *  - 'done'       → veriler silindi, reload tetiklendi
   *  - 'failed'     → wipe sırasında hata (lastError dolu)
   */
  async function confirmAndWipe(): Promise<'cancelled' | 'mismatch' | 'done' | 'failed'> {
    const intent = await alertController.create({
      header: t('backup.wipe.title'),
      message: t('backup.wipe.message'),
      buttons: [
        { text: t('backup.wipe.cancel'), role: 'cancel' },
        { text: t('backup.wipe.continue'), role: 'confirm' },
      ],
    })
    await intent.present()
    const { role: intentRole } = await intent.onDidDismiss()
    if (intentRole !== 'confirm') return 'cancelled'

    // Onay kelimesi de çeviriden gelir; sabit 'SIFIRLA' EN/DE kullanıcısını
    // anlamadığı bir kelimeyi yazmak zorunda bırakıyordu.
    const confirmWord = t('backup.wipe.confirmWord')

    const confirm = await alertController.create({
      header: t('backup.wipe.confirmTitle'),
      message: t('backup.wipe.confirmMessage', { word: confirmWord }),
      inputs: [
        {
          name: 'confirmText',
          type: 'text',
          placeholder: confirmWord,
          attributes: { autocapitalize: 'characters', autocorrect: 'off' },
        },
      ],
      buttons: [
        { text: t('backup.wipe.cancel'), role: 'cancel' },
        { text: t('backup.wipe.action'), role: 'destructive' },
      ],
    })
    await confirm.present()
    const { role: confirmRole, data } = await confirm.onDidDismiss<{
      values: { confirmText?: string }
    }>()
    if (confirmRole !== 'destructive') return 'cancelled'

    const typed = (data?.values?.confirmText ?? '').trim().toUpperCase()
    if (typed !== confirmWord.toUpperCase()) {
      const toast = await toastController.create({
        message: t('backup.wipe.mismatch'),
        duration: 2500,
        color: 'warning',
        position: 'bottom',
      })
      await toast.present()
      return 'mismatch'
    }

    try {
      await wipeAllData()
      const toast = await toastController.create({
        message: t('backup.wipe.success'),
        duration: 1500,
        color: 'success',
        position: 'bottom',
      })
      await toast.present()
      setTimeout(() => {
        window.location.replace('/')
      }, 800)
      return 'done'
    } catch (err) {
      const toast = await toastController.create({
        message: err instanceof Error ? err.message : t('backup.wipe.failed'),
        duration: 2500,
        color: 'danger',
        position: 'bottom',
      })
      await toast.present()
      return 'failed'
    }
  }

  return {
    isExporting,
    isImporting,
    isWiping,
    lastError,
    lastResult,
    exportToFile,
    shareBackup,
    confirmPlainExport,
    presentExportResult,
    importFromFile,
    promptPassphrase,
    promptNewPassphrase,
    wipeAllData,
    confirmAndWipe,
  }
}
