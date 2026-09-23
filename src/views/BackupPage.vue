<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  alertController,
  toastController,
  IonButton,
  IonProgressBar
} from '@ionic/vue'
import {
  cloudDownloadOutline,
  cloudUploadOutline,
  documentTextOutline,
  shieldCheckmarkOutline,
  timeOutline,
  warningOutline,
  trashOutline
} from 'ionicons/icons'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Capacitor } from '@capacitor/core'
import { useBackup } from '@/composables/features/useBackup'
import { useBackupReminder } from '@/composables/features/useBackupReminder'
import { useNotifier } from '@/composables/features/useNotifier'
import { isEncryptionAvailable, readEncryptionContext } from '@/shared/utils/crypto/backup-crypto'
import { logger } from '@/infrastructure/logging'

import SubPageHeader from '@/components/SubPageHeader.vue';
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
    <sub-page-header :title="$t('backup.title')"/>

    <ion-content :fullscreen="true" class="backup-content" :scroll-y="true">
      <main class="mx-auto w-full max-w-xl space-y-6 px-4 pb-12 pt-5">
        <section class="backup-hero overflow-hidden rounded-[22px] p-5">
          <div class="flex items-start gap-4">
            <div class="hero-icon flex size-12 shrink-0 items-center justify-center rounded-2xl">
              <ion-icon :icon="shieldCheckmarkOutline" class="text-[22px]" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-3">
                <h2 class="text-lg font-extrabold text-content">{{ $t('backup.localBackup') }}</h2>
                <span class="local-badge">{{ $t('backup.localBadge') }}</span>
              </div>
              <p class="mt-1 text-[12px] leading-relaxed text-content-muted">{{ $t('backup.intro') }}</p>
            </div>
          </div>

          <div class="mt-5 flex items-center gap-3 border-t border-line pt-4">
            <span class="status-dot size-2.5 shrink-0 rounded-full" />
            <div class="min-w-0">
              <p class="text-[13px] font-bold text-content">{{ $t('backup.offline') }}</p>
              <p class="mt-0.5 text-[11px] text-content-muted">{{ $t('backup.offlineDesc') }}</p>
            </div>
          </div>
        </section>

        <section>
          <h2 class="section-label">{{ $t('backup.createBackup') }}</h2>
          <div class="backup-card overflow-hidden">
            <div class="p-4">
              <div class="flex items-center gap-3">
                <div class="card-icon">
                  <ion-icon :icon="cloudDownloadOutline" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-[14px] font-bold text-content">{{ $t('backup.createBackup') }}</p>
                  <p class="mt-0.5 text-[11px] leading-relaxed text-content-muted">
                    {{ $t('backup.encryption.defaultHint') }}
                  </p>
                </div>
              </div>

              <div class="last-backup mt-4 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
                <span class="flex shrink-0 items-center gap-2 text-[11px] font-semibold text-content-muted">
                  <ion-icon :icon="timeOutline" class="text-[15px]" />
                  {{ $t('backup.lastBackup') }}
                </span>
                <span class="truncate text-right text-[11px] font-bold text-content-secondary">
                  {{ formattedLastExport }}
                </span>
              </div>
            </div>

            <ion-progress-bar v-if="isExporting" type="indeterminate" class="backup-progress" />

            <div class="space-y-1 px-4 pb-4">
              <ion-button
                expand="block"
                class="primary-action"
                :disabled="isExporting || isImporting"
                @click="handleExport()"
              >
                <ion-icon slot="start" :icon="cloudDownloadOutline" />
                {{ isExporting ? $t('backup.creating') : $t('backup.createBackup') }}
              </ion-button>

              <ion-button
                expand="block"
                fill="clear"
                class="secondary-action"
                :disabled="isExporting || isImporting"
                @click="handleExportPlain"
              >
                {{ $t('backup.encryption.plainAction') }}
              </ion-button>
            </div>
          </div>
        </section>

        <section>
          <h2 class="section-label">{{ $t('backup.restore') }}</h2>
          <div class="backup-card overflow-hidden">
            <div class="flex items-start gap-3 p-4">
              <div class="card-icon">
                <ion-icon :icon="cloudUploadOutline" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[14px] font-bold text-content">{{ $t('backup.overwrite') }}</p>
                <p class="mt-1 text-[11px] leading-relaxed text-content-muted">{{ $t('backup.overwriteDesc') }}</p>
              </div>
            </div>

            <ion-progress-bar v-if="isImporting" type="indeterminate" class="backup-progress" />

            <div class="px-4 pb-4">
              <ion-button
                  expand="block"
                  fill="outline"
                  class="outline-action"
                  :disabled="isExporting || isImporting"
                  @click="handleImport"
              >
                <ion-icon slot="start" :icon="cloudUploadOutline" />
                {{ isImporting ? $t('backup.importing') : $t('backup.selectFile') }}
              </ion-button>
            </div>
          </div>
        </section>

        <section class="space-y-2">
          <div class="info-card info-card--warning flex items-start gap-3 rounded-2xl p-3.5">
            <ion-icon :icon="warningOutline" class="mt-0.5 shrink-0 text-[18px]" />
            <p class="text-[11px] font-medium leading-relaxed text-content-secondary">
              {{ $t('backup.warnOverwrite') }}
            </p>
          </div>
          <div class="info-card flex items-start gap-3 rounded-2xl p-3.5">
            <ion-icon :icon="documentTextOutline" class="mt-0.5 shrink-0 text-[18px] text-content-muted" />
            <p class="text-[11px] leading-relaxed text-content-tertiary">
              {{ $t('backup.jsonNote') }}
            </p>
          </div>
        </section>

        <section>
          <h2 class="section-label section-label--danger">{{ $t('backup.dangerZone') }}</h2>
          <div class="danger-card overflow-hidden rounded-[18px]">
            <div class="p-4">
              <div class="flex items-start gap-3">
                <div class="danger-icon flex size-10 shrink-0 items-center justify-center rounded-xl">
                  <ion-icon :icon="trashOutline" class="text-[18px]" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="text-[14px] font-bold text-content">{{ $t('backup.resetApp') }}</p>
                  <p class="mt-1 text-[11px] leading-relaxed text-content-muted">{{ $t('backup.dangerDesc') }}</p>
                </div>
              </div>
            </div>

            <ion-progress-bar v-if="isWiping" type="indeterminate" class="danger-progress" />

            <div class="px-4 pb-4">
              <ion-button
                  expand="block"
                  class="danger-action"
                  :disabled="isExporting || isImporting || isWiping"
                  @click="handleReset"
              >
                <ion-icon slot="start" :icon="trashOutline" />
                {{ isWiping ? $t('backup.resetting') : $t('backup.resetApp') }}
              </ion-button>
            </div>
          </div>
        </section>
      </main>
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

.backup-hero {
  background: linear-gradient(145deg, var(--c-surface) 0%, var(--c-surface-sunken) 100%);
  border: 1px solid var(--c-line);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--c-content) 8%, transparent);
}

.hero-icon,
.card-icon {
  background: var(--c-primary);
  color: var(--c-on-primary);
}

.local-badge {
  flex-shrink: 0;
  padding: 5px 8px;
  border: 1px solid var(--c-line-strong);
  border-radius: 999px;
  background: var(--c-surface);
  color: var(--c-content-secondary);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.status-dot {
  background: #22c55e;
  box-shadow: 0 0 0 4px color-mix(in srgb, #22c55e 18%, transparent);
}

.section-label {
  margin: 0 4px 9px;
  color: var(--c-content-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.section-label--danger {
  color: var(--c-error);
}

.backup-card,
.info-card {
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  box-shadow: 0 5px 18px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.backup-card {
  border-radius: 18px;
}

.card-icon {
  display: flex;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 13px;
}

.card-icon ion-icon {
  font-size: 18px;
}

.last-backup {
  background: var(--c-surface-sunken);
  border: 1px solid var(--c-line);
}

.backup-progress,
.danger-progress {
  height: 3px;
  --background: var(--c-surface-sunken);
  --progress-background: var(--c-primary);
}

ion-button.primary-action,
ion-button.outline-action,
ion-button.danger-action {
  min-height: 46px;
  margin: 0;
  font-size: 13px;
  font-weight: 750;
  text-transform: none;
  --border-radius: 13px;
  --box-shadow: none;
}

ion-button.primary-action {
  --background: var(--c-primary);
  --background-activated: var(--c-primary-strong);
  --color: var(--c-on-primary);
}

ion-button.secondary-action {
  min-height: 38px;
  margin: 3px 0 0;
  font-size: 11px;
  font-weight: 650;
  text-transform: none;
  --color: var(--c-content-muted);
  --ripple-color: var(--c-content-muted);
}

ion-button.outline-action {
  --background: transparent;
  --background-activated: var(--c-surface-sunken);
  --border-color: var(--c-line-strong);
  --border-width: 1px;
  --color: var(--c-content);
}

.info-card--warning {
  background: color-mix(in srgb, #f59e0b 9%, var(--c-surface));
  border-color: color-mix(in srgb, #f59e0b 32%, var(--c-line));
  color: #d97706;
}

/* Tehlikeli bolge — sabit koyu kirmizi (#8c1d18) yerine temanin kendi hata
   rengiyle tint: light'ta sicak krem kartla, dark'ta koyu kartla uyumlu
   kalir ve tek noktadan (--c-error) yonetilir. */
.danger-card {
  background: color-mix(in srgb, var(--c-error) 8%, var(--c-surface));
  border: 1px solid color-mix(in srgb, var(--c-error) 30%, var(--c-line));
}

.danger-icon {
  background: color-mix(in srgb, var(--c-error) 14%, var(--c-surface));
  color: var(--c-error);
}

.danger-progress {
  --progress-background: var(--c-error);
}

/* Dolu hata butonu — basili/hover tonu icerik rengiyle karistirilir:
   light'ta koyulasir, dark'ta acilir (uygulamanin CTA dili). */
ion-button.danger-action {
  --background: var(--c-error);
  --background-hover: color-mix(in srgb, var(--c-content) 12%, var(--c-error));
  --background-activated: color-mix(in srgb, var(--c-content) 20%, var(--c-error));
  --border-width: 0;
  --color: var(--c-on-error);
}
</style>
