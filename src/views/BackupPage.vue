<script setup lang="ts">
import {
  IonPage, IonContent, IonIcon,
  alertController, toastController, IonToolbar, IonHeader, IonBackButton, IonTitle, IonButtons,
} from '@ionic/vue'
import {
  cloudDownloadOutline,
  cloudUploadOutline,
  documentTextOutline,
  shieldCheckmarkOutline,
  timeOutline,
  warningOutline,
  trashOutline,
  chevronBackOutline
} from 'ionicons/icons'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Capacitor } from '@capacitor/core'
import { useBackup } from '@/composables/features/useBackup'
import { useBackupReminder } from '@/composables/features/useBackupReminder'
import { useNotifier } from '@/composables/features/useNotifier'
import { isEncryptionAvailable, readEncryptionContext } from '@/shared/utils/crypto/backup-crypto'
import { logger } from '@/infrastructure/logging'

const { t, locale } = useI18n()
const {
  isExporting, isImporting, isWiping,
  exportToFile, importFromFile, confirmAndWipe, promptNewPassphrase,
  confirmPlainExport, presentExportResult,
} = useBackup()

// Damga artık Preferences'ta: `localStorage` WebView'in kendi deposu ve sistem
// yer açmak için temizleyebiliyor — kaybolduğunda kullanıcı yedek almış olsa
// bile "hiç yedeklenmedi" görünüyordu (bkz. backup-status.ts).
const { lastExportAt, refresh: refreshBackupStatus, markExported } = useBackupReminder()
const notifier = useNotifier()

onMounted(() => { void refreshBackupStatus() })

const formattedLastExport = computed(() => {
  if (!lastExportAt.value) return t('backup.neverBackedUp')
  const date = new Date(lastExportAt.value)
  return date.toLocaleString(locale.value, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
})

async function showToast(message: string, color: 'success' | 'danger' | 'warning' = 'success') {
  const toast = await toastController.create({
    message, duration: 2500, color, position: 'top',
  })
  await toast.present()
}

/**
 * Yedek ŞİFRELİ üretilir (varsayılan) ve Documents klasörüne yazılır: dosya
 * parolayla korunduğu için herkese açık bir klasörde durabilir, kullanıcı da
 * onu sonradan "Dosyalar"dan bulur.
 *
 * `encrypted = false` yalnızca kullanıcı aşağıdaki ayrı ve uyarılı seçeneği
 * seçtiğinde gelir; o dosya Documents'a HİÇ yazılmaz — özel klasöre alınıp
 * doğrudan paylaşılır (bkz. ExportDestination).
 */
async function handleExport(encrypted = true) {
  try {
    let passphrase: string | undefined
    const encryptionAvailable = isEncryptionAvailable()

    // Native'de Web Crypto yoksa fail-closed: finansal veriyi düz metin olarak
    // cihaz depolamasına hiçbir akıştan yazma (ayrı "şifresiz" butonu
    // dahil). Web geliştirme ortamında mevcut, uyarılı fallback korunur.
    if (!encryptionAvailable) {
      const ctx = readEncryptionContext()
      logger.warn('Şifreli yedek üretilemiyor', { context: 'BackupPage', data: { ...ctx } })

      if (Capacitor.isNativePlatform()) {
        const blocked = await alertController.create({
          header: t('backup.encryption.unavailableTitle'),
          message: t('backup.encryption.nativeUnavailableMessage'),
          buttons: [{ text: t('backup.saved.done'), role: 'cancel' }],
        })
        await blocked.present()
        await blocked.onDidDismiss()
        return
      }
    }

    if (encrypted && !encryptionAvailable) {
      const fallback = await alertController.create({
        header: t('backup.encryption.unavailableTitle'),
        message: t('backup.encryption.unavailableMessage'),
        buttons: [
          { text: t('backup.wipe.cancel'), role: 'cancel' },
          { text: t('backup.encryption.plainConfirm'), role: 'confirm' },
        ],
      })
      await fallback.present()

      const { role } = await fallback.onDidDismiss()
      if (role !== 'confirm') return

      encrypted = false
    }

    if (encrypted) {
      const entered = await promptNewPassphrase()
      // İptal → hiçbir şey üretme. Sessizce şifresize düşmek, kullanıcının
      // beklediğinden zayıf bir dosya yaratırdı.
      if (entered === null) return
      passphrase = entered
    }

    // Hedefi şifreleme belirler: şifreli dosya korunuyor, Documents'ta durabilir
    // ve kullanıcı sonra "Dosyalar"dan bulur. Şifresiz dosya ise herkesin
    // okuyabileceği bir klasörde beklememeli — özel klasöre yazılıp doğrudan
    // paylaşılır, yani cihazdan çıkmak üzere üretilir.
    const location = await exportToFile(passphrase, encrypted ? 'documents' : 'share')

    // Hatırlatıcı şeridi ve haftalık bildirim bu damgaya bakıyor; yazılmazsa
    // kullanıcı yedek almış olmasına rağmen uyarılmaya devam ederdi.
    await markExported()

    // Kurulu bildirimleri HEMEN iptal et. `resyncSchedules` bunu zaten yapıyor
    // ama ancak bir sonraki öne gelişte koşuyor; o zamana kadar yedeğini az önce
    // alan kullanıcıya "yedek al" bildirimi düşerdi. İkincisi, kullanıcı daha
    // önce hatırlatmayı ertelemişse kurulmuş olan "erteleme bitti" bildirimi:
    // yedek alındıktan sonra haber verilecek bir şey kalmıyor.
    void notifier.scheduleBackupReminder()
    void notifier.scheduleBackupSnoozeEndReminder()

    // Web'de dosya doğrudan indirilir; native'de cihaza yazıldı, paylaşmak
    // artık ayrı ve isteğe bağlı bir adım (eskiden sheet kendiliğinden açılıyordu).
    // Sunum `useBackup`ta ortak: gizlilik ekranı bu adımı atlayıp kullanıcıyı
    // dosyanın nerede olduğunu bilmeden bırakıyordu.
    await presentExportResult(location, {
      webMessage: encrypted
          ? t('backup.encryption.createdEncrypted')
          : t('backup.encryption.createdPlain'),
      webColor: encrypted ? 'success' : 'warning',
      // Şifresiz yedek geçici klasörde: paylaşılmazsa elde yedek KALMAZ.
      // Gizlilik ekranındaki veri indirmeden farklı olarak burada kullanıcı
      // bir yedek bekliyor, o yüzden mesaj daha sert.
      notSharedMessage: t('backup.share.backupNotKept'),
    })
  } catch (err) {
    await showToast(err instanceof Error ? err.message : t('backup.backupFailed'), 'danger')
  }
}

/** Şifresiz yedek — ayrı onay ister, çünkü dosya korumasız paylaşılabilir. */
async function handleExportPlain() {
  if (!await confirmPlainExport()) return

  await handleExport(false)
}

async function handleImport() {
  const alert = await alertController.create({
    header: t('backup.confirmOverwriteTitle'),
    message: t('backup.confirmOverwriteMsg'),
    buttons: [
      { text: t('backup.cancel'), role: 'cancel' },
      { text: t('backup.continue'), role: 'confirm' },
    ],
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  if (role !== 'confirm') return

  try {
    const result = await importFromFile('replace')
    if (!result) return

    await showToast(
        t('backup.importSuccessRestarting', { rows: result.importedRows, tables: result.importedTables }),
        'success',
    )

    // Import tüm tabloları yeniden yazdı; Pinia store'ları hâlâ ESKİ veriyi
    // tutuyor. Yeniden başlatmazsak ekran bayat kalır ve daha kötüsü, sonraki
    // bir yazım eski entity üzerinden hesaplanıp geri yüklenen veriyi bozar.
    // (wipeAllData ile aynı gerekçe — bkz. useBackup.confirmAndWipe.)
    setTimeout(() => {
      window.location.replace('/')
    }, 1200)
  } catch (err) {
    await showToast(err instanceof Error ? err.message : t('backup.importFailed'), 'danger')
  }
}

async function handleReset() {
  await confirmAndWipe()
}
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" :icon="chevronBackOutline"/>
        </ion-buttons>

        <ion-title class="text-xl font-semibold">
          {{ $t('backup.title') }}
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="backup-content" :scroll-y="true">
      <div class="px-4">
        <!-- Açıklama -->
        <div class="mt-5 px-1">
          <h2 class="text-[18px] font-bold text-content">{{ $t('backup.localBackup') }}</h2>
          <p class="text-[12px] text-content-muted mt-1 leading-snug">
            {{ $t('backup.intro') }}
          </p>
        </div>

        <!-- Durum kartı -->
        <div class="mt-4 bg-surface rounded-2xl px-4 py-3 flex items-center gap-3">
          <div class="size-10 rounded-2xl bg-emerald-50 flex items-center justify-center shrink-0">
            <ion-icon :icon="shieldCheckmarkOutline" class="size-5 text-emerald-600" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[13px] font-semibold text-content">{{ $t('backup.offline') }}</p>
            <p class="text-[11px] text-content-muted mt-0.5">{{ $t('backup.offlineDesc') }}</p>
          </div>
          <span class="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
            {{ $t('backup.localBadge') }}
          </span>
        </div>
      </div>

      <!-- Bölümler -->
      <div class="mt-5 px-4 pb-10 space-y-5">

        <!-- Yedek oluştur -->
        <section>
          <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-2 px-1">
            {{ $t('backup.createBackup') }}
          </p>
          <div class="bg-surface rounded-2xl px-4 py-4">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <ion-icon :icon="timeOutline" class="size-[14px] text-slate-400" />
                <span class="text-[12px] text-content-muted">{{ $t('backup.lastBackup') }}</span>
              </div>
              <span class="text-[12px] font-medium text-content-secondary">{{ formattedLastExport }}</span>
            </div>

            <div v-if="isExporting" class="h-1 bg-surface-sunken rounded-full overflow-hidden mb-3">
              <div class="h-full bg-indigo-500 rounded-full animate-pulse" style="width: 60%" />
            </div>

            <button
                type="button"
                class="w-full h-11 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold flex items-center justify-center gap-2 active:bg-indigo-700 disabled:bg-slate-300 transition"
                :disabled="isExporting || isImporting"
                @click="handleExport()"
            >
              <ion-icon :icon="cloudDownloadOutline" class="size-[16px]" />
              {{ isExporting ? $t('backup.creating') : $t('backup.createBackup') }}
            </button>

            <p class="text-[11px] text-content-muted mt-2 leading-snug">
              {{ $t('backup.encryption.defaultHint') }}
            </p>

            <button
                type="button"
                class="w-full mt-2 text-[12px] text-content-muted underline underline-offset-2 disabled:opacity-50"
                :disabled="isExporting || isImporting"
                @click="handleExportPlain"
            >
              {{ $t('backup.encryption.plainAction') }}
            </button>
          </div>
        </section>

        <!-- Geri Yükle -->
        <section>
          <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-2 px-1">
            {{ $t('backup.restore') }}
          </p>
          <div class="bg-surface rounded-2xl px-4 py-3 mb-3">
            <p class="text-[14px] font-medium text-content">{{ $t('backup.overwrite') }}</p>
            <p class="text-[11px] text-content-muted mt-0.5">{{ $t('backup.overwriteDesc') }}</p>
          </div>

          <div v-if="isImporting" class="h-1 bg-surface-sunken rounded-full overflow-hidden mb-3">
            <div class="h-full bg-indigo-500 rounded-full animate-pulse" style="width: 60%" />
          </div>

          <button
              type="button"
              class="w-full h-11 rounded-xl border-2 text-[13px] font-semibold flex items-center justify-center gap-2 transition disabled:opacity-40 border-rose-200 text-rose-600 active:bg-rose-50"
              :disabled="isExporting || isImporting"
              @click="handleImport"
          >
            <ion-icon :icon="cloudUploadOutline" class="size-[16px]" />
            {{ isImporting ? $t('backup.importing') : $t('backup.selectFile') }}
          </button>
        </section>

        <!-- Bilgi notları -->
        <div class="space-y-2">
          <div class="bg-surface rounded-2xl px-3 py-3 flex items-start gap-2">
            <ion-icon :icon="warningOutline" class="size-[16px] text-amber-600 mt-0.5 shrink-0" />
            <p class="text-[11px] text-content-secondary leading-snug">
              {{ $t('backup.warnOverwrite') }}
            </p>
          </div>
          <div class="bg-surface rounded-2xl px-3 py-3 flex items-start gap-2">
            <ion-icon :icon="documentTextOutline" class="size-[16px] text-slate-400 mt-0.5 shrink-0" />
            <p class="text-[11px] text-content-tertiary leading-snug">
              {{ $t('backup.jsonNote') }}
            </p>
          </div>
        </div>

        <!-- Tehlikeli Bölge -->
        <section>
          <p class="text-[11px] font-semibold uppercase tracking-wider text-rose-600 mb-2 px-1">
            {{ $t('backup.dangerZone') }}
          </p>
          <p class="text-[12px] text-content-muted mb-3 px-1 leading-snug">
            {{ $t('backup.dangerDesc') }}
          </p>

          <div v-if="isWiping" class="h-1 bg-surface-sunken rounded-full overflow-hidden mb-3">
            <div class="h-full bg-rose-500 rounded-full animate-pulse" style="width: 60%" />
          </div>

          <button
              type="button"
              class="w-full h-12 rounded-2xl bg-rose-600 text-white text-[14px] font-semibold flex items-center justify-center gap-2 active:bg-rose-700 disabled:bg-slate-300 transition"
              :disabled="isExporting || isImporting || isWiping"
              @click="handleReset"
          >
            <ion-icon :icon="trashOutline" class="size-[16px]" />
            {{ isWiping ? $t('backup.resetting') : $t('backup.resetApp') }}
          </button>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.backup-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}
</style>
