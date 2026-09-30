<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  toastController,
  IonButton,
  IonProgressBar,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonBadge,
  IonSpinner
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
import { useAlert } from '@/composables/ui/useAlert'
import { useBackupReminder } from '@/composables/features/useBackupReminder'
import { useNotifier } from '@/composables/features/useNotifier'
import { isEncryptionAvailable, readEncryptionContext } from '@/shared/utils/crypto/backup-crypto'
import { logger } from '@/infrastructure/logging'

import SubPageHeader from '@/components/SubPageHeader.vue';
import SwapText from '@/components/SwapText.vue';
const { t, locale } = useI18n()
const { showAlert } = useAlert()
const {
  isExporting, isImporting, isWiping,
  exportToFile, importFromFile, confirmAndWipe, promptNewPassphrase,
  confirmPlainExport, presentExportResult,
} = useBackup()

const isBusy = computed(() => isExporting.value || isImporting.value || isWiping.value)

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
        const blocked = await showAlert({
          header: t('backup.encryption.unavailableTitle'),
          message: t('backup.encryption.nativeUnavailableMessage'),
          buttons: [{ text: t('backup.saved.done'), role: 'cancel' }],
        })
        await blocked.onDidDismiss()
        return
      }
    }

    if (encrypted && !encryptionAvailable) {
      const fallback = await showAlert({
        header: t('backup.encryption.unavailableTitle'),
        message: t('backup.encryption.unavailableMessage'),
        buttons: [
          { text: t('backup.wipe.cancel'), role: 'cancel' },
          { text: t('backup.encryption.plainConfirm'), role: 'confirm' },
        ],
      })

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
  const alert = await showAlert({
    header: t('backup.confirmOverwriteTitle'),
    message: t('backup.confirmOverwriteMsg'),
    buttons: [
      { text: t('backup.cancel'), role: 'cancel' },
      { text: t('backup.continue'), role: 'confirm' },
    ],
  })
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
      <main class="mx-auto w-full max-w-xl space-y-5 px-4 pb-12 pt-5">
        <ion-card class="backup-card backup-hero">
          <ion-card-header class="backup-card-header">
            <div class="flex items-start gap-4">
              <div class="backup-icon backup-icon--hero size-12 rounded-2xl">
                <ion-icon :icon="shieldCheckmarkOutline" class="text-2xl" aria-hidden="true" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <ion-card-title class="hero-title">{{ $t('backup.localBackup') }}</ion-card-title>
                  <ion-badge class="local-badge">{{ $t('backup.localBadge') }}</ion-badge>
                </div>
                <p class="mt-2 text-xs leading-relaxed text-content-secondary">{{ $t('backup.intro') }}</p>
              </div>
            </div>
          </ion-card-header>
          <ion-card-content class="backup-card-content">
            <ion-list class="status-list overflow-hidden rounded-2xl border border-line">
              <ion-item class="backup-item" lines="full">
                <ion-icon slot="start" :icon="shieldCheckmarkOutline" class="status-icon" aria-hidden="true" />
                <ion-label class="ion-text-wrap">
                  <h3>{{ $t('backup.offline') }}</h3>
                  <p>{{ $t('backup.offlineDesc') }}</p>
                </ion-label>
              </ion-item>
              <ion-item class="backup-item" lines="none">
                <ion-icon slot="start" :icon="timeOutline" class="text-content-secondary" aria-hidden="true" />
                <ion-label class="ion-text-wrap">
                  <p>{{ $t('backup.lastBackup') }}</p>
                  <h3 class="mt-1" aria-live="polite">{{ formattedLastExport }}</h3>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>

        <ion-card class="backup-card" :aria-busy="isExporting">
          <ion-card-header class="backup-card-header">
            <div class="flex items-start gap-3">
              <div class="backup-icon backup-icon--export size-10 rounded-xl">
                <ion-icon :icon="cloudDownloadOutline" class="text-xl" aria-hidden="true" />
              </div>
              <div class="min-w-0 flex-1">
                <ion-card-title>{{ $t('backup.createBackup') }}</ion-card-title>
                <ion-card-subtitle class="mt-1">{{ $t('backup.encryption.defaultHint') }}</ion-card-subtitle>
              </div>
            </div>
          </ion-card-header>
          <ion-card-content class="backup-card-content">
            <ion-button expand="block" class="backup-action primary-action" :disabled="isBusy" @click="handleExport()">
              <!-- İşlem başlayınca ikon ↔ spinner ve etiket yerinde yer değiştirir. -->
              <transition name="icon-swap" mode="out-in">
                <ion-spinner v-if="isExporting" slot="start" name="crescent" class="size-[18px]" aria-hidden="true" />
                <ion-icon v-else slot="start" :icon="shieldCheckmarkOutline" aria-hidden="true" />
              </transition>
              <swap-text :text="isExporting ? $t('backup.creating') : $t('backup.createBackup')" />
            </ion-button>
          </ion-card-content>
          <ion-list class="action-list border-t border-line">
            <ion-item class="backup-item plain-export-item" lines="none" button detail :disabled="isBusy" @click="handleExportPlain">
              <ion-icon slot="start" :icon="documentTextOutline" class="text-content-muted" aria-hidden="true" />
              <ion-label class="ion-text-wrap">{{ $t('backup.encryption.plainAction') }}</ion-label>
            </ion-item>
          </ion-list>
          <transition name="fade">
            <ion-progress-bar v-if="isExporting" type="indeterminate" class="backup-progress" :aria-label="$t('backup.creating')" />
          </transition>
        </ion-card>

        <ion-card class="backup-card" :aria-busy="isImporting">
          <ion-card-header class="backup-card-header">
            <div class="flex items-start gap-3">
              <div class="backup-icon backup-icon--restore size-10 rounded-xl">
                <ion-icon :icon="cloudUploadOutline" class="text-xl" aria-hidden="true" />
              </div>
              <div class="min-w-0 flex-1">
                <ion-card-title>{{ $t('backup.restore') }}</ion-card-title>
                <ion-card-subtitle class="mt-1">{{ $t('backup.overwriteDesc') }}</ion-card-subtitle>
              </div>
            </div>
          </ion-card-header>
          <ion-card-content class="backup-card-content space-y-4">
            <div class="backup-warning flex items-start gap-3 rounded-xl border p-3">
              <ion-icon :icon="warningOutline" class="mt-0.5 shrink-0 text-lg" aria-hidden="true" />
              <ion-note class="text-xs leading-relaxed">{{ $t('backup.warnOverwrite') }}</ion-note>
            </div>
            <ion-button expand="block" fill="outline" class="backup-action outline-action" :disabled="isBusy" @click="handleImport">
              <transition name="icon-swap" mode="out-in">
                <ion-spinner v-if="isImporting" slot="start" name="crescent" class="size-[18px]" aria-hidden="true" />
                <ion-icon v-else slot="start" :icon="cloudUploadOutline" aria-hidden="true" />
              </transition>
              <swap-text :text="isImporting ? $t('backup.importing') : $t('backup.selectFile')" />
            </ion-button>
          </ion-card-content>
          <transition name="fade">
            <ion-progress-bar v-if="isImporting" type="indeterminate" class="backup-progress" :aria-label="$t('backup.importing')" />
          </transition>
        </ion-card>

        <div class="flex items-start gap-3 px-1">
          <ion-icon :icon="documentTextOutline" class="mt-0.5 shrink-0 text-lg text-content-muted" aria-hidden="true" />
          <ion-note class="backup-note text-xs leading-relaxed">{{ $t('backup.jsonNote') }}</ion-note>
        </div>

        <section aria-labelledby="backup-danger-heading" class="pt-2">
          <h2 id="backup-danger-heading" class="danger-heading mb-2 px-1 text-[11px] font-bold uppercase tracking-wider">
            {{ $t('backup.dangerZone') }}
          </h2>
          <ion-card class="backup-card danger-card" :aria-busy="isWiping">
            <ion-card-header class="backup-card-header">
              <div class="flex items-start gap-3">
                <div class="backup-icon backup-icon--danger size-10 rounded-xl">
                  <ion-icon :icon="trashOutline" class="text-xl" aria-hidden="true" />
                </div>
                <div class="min-w-0 flex-1">
                  <ion-card-title>{{ $t('backup.resetApp') }}</ion-card-title>
                  <ion-card-subtitle class="mt-1">{{ $t('backup.dangerDesc') }}</ion-card-subtitle>
                </div>
              </div>
            </ion-card-header>
            <ion-card-content class="backup-card-content">
              <ion-button expand="block" fill="outline" class="backup-action danger-action" :disabled="isBusy" @click="handleReset">
                <transition name="icon-swap" mode="out-in">
                  <ion-spinner v-if="isWiping" slot="start" name="crescent" class="size-[18px]" aria-hidden="true" />
                  <ion-icon v-else slot="start" :icon="trashOutline" aria-hidden="true" />
                </transition>
                <swap-text :text="isWiping ? $t('backup.resetting') : $t('backup.resetApp')" />
              </ion-button>
            </ion-card-content>
            <transition name="fade">
              <ion-progress-bar v-if="isWiping" type="indeterminate" class="backup-progress danger-progress" :aria-label="$t('backup.resetting')" />
            </transition>
          </ion-card>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.backup-content {
  --background: var(--c-page);
  --backup-success: #15803d;
  --backup-info: #0369a1;
  --backup-warning: #92400e;
}

:global(.ion-palette-dark .backup-content) {
  --backup-success: #86efac;
  --backup-info: #7dd3fc;
  --backup-warning: #fcd34d;
}

ion-card.backup-card {
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--c-line);
  border-radius: 20px;
  background: var(--c-surface);
  color: var(--c-content);
  box-shadow: 0 5px 18px color-mix(in srgb, var(--c-content) 5%, transparent);
}

ion-card.backup-hero {
  background: linear-gradient(145deg, var(--c-surface), var(--c-surface-sunken));
}

.backup-card-header {
  padding: 20px 16px 16px;
}

.backup-card-content {
  padding: 0 16px 16px;
}

.backup-card ion-card-title {
  color: var(--c-content);
  font-size: 15px;
  font-weight: 750;
  line-height: 1.4;
}

.backup-card .hero-title {
  font-size: 18px;
  font-weight: 800;
}

.backup-card ion-card-subtitle {
  color: var(--c-content-secondary);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.6;
}

.backup-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--backup-accent) 24%, var(--c-line));
  background: color-mix(in srgb, var(--backup-accent) 12%, var(--c-surface));
  color: var(--backup-accent);
}

.backup-icon--hero {
  --backup-accent: var(--c-primary);
  background: var(--c-primary);
  color: var(--c-on-primary);
}

.backup-icon--export {
  --backup-accent: var(--backup-success);
}

.backup-icon--restore {
  --backup-accent: var(--backup-info);
}

.backup-icon--danger {
  --backup-accent: var(--c-error);
}

.local-badge {
  --background: var(--c-surface);
  --color: var(--c-content-secondary);
  padding: 4px 7px;
  border: 1px solid var(--c-line);
  border-radius: 8px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.status-list,
.action-list {
  margin: 0;
  padding: 0;
  background: transparent;
}

.status-list {
  background: var(--c-surface);
}

.backup-item {
  --background: transparent;
  --background-activated: var(--c-surface-sunken);
  --background-hover: var(--c-surface-sunken);
  --background-focused: var(--c-surface-sunken);
  --color: var(--c-content);
  --border-color: var(--c-line);
  --padding-start: 12px;
  --inner-padding-end: 12px;
  --min-height: 62px;
  --detail-icon-color: var(--c-content-muted);
}

.backup-item ion-icon[slot='start'] {
  margin-inline-end: 12px;
  font-size: 20px;
}

.backup-item ion-label h3 {
  color: var(--c-content);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
}

.backup-item ion-label p {
  color: var(--c-content-muted);
  font-size: 11px;
  line-height: 1.5;
}

.status-icon {
  color: var(--backup-success);
}

.plain-export-item {
  --padding-start: 16px;
  --min-height: 52px;
  font-size: 12px;
  font-weight: 600;
}

.backup-warning {
  border-color: color-mix(in srgb, var(--backup-warning) 35%, var(--c-line));
  background: color-mix(in srgb, var(--backup-warning) 8%, var(--c-surface));
  color: var(--backup-warning);
}

.backup-warning ion-note {
  color: var(--c-content-secondary);
}

.backup-note {
  color: var(--c-content-muted);
}

ion-button.backup-action {
  min-height: 46px;
  height: auto;
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  text-transform: none;
  white-space: normal;
  --padding-top: 12px;
  --padding-bottom: 12px;
  --border-radius: 12px;
  --box-shadow: none;
}

ion-button.primary-action {
  --background: var(--c-primary);
  --background-hover: var(--c-primary-strong);
  --background-activated: var(--c-primary-strong);
  --color: var(--c-on-primary);
}

ion-button.outline-action {
  --background: transparent;
  --background-hover: var(--c-surface-sunken);
  --background-activated: var(--c-surface-sunken);
  --border-color: var(--c-line-strong);
  --border-width: 1px;
  --color: var(--c-content);
}

ion-card.danger-card {
  border-color: color-mix(in srgb, var(--c-error) 35%, var(--c-line));
}

.danger-heading {
  color: var(--c-error);
}

ion-button.danger-action {
  --background: transparent;
  --background-hover: color-mix(in srgb, var(--c-error) 8%, var(--c-surface));
  --background-activated: color-mix(in srgb, var(--c-error) 14%, var(--c-surface));
  --border-color: var(--c-error);
  --border-width: 1px;
  --color: var(--c-error);
}

.backup-progress {
  height: 3px;
  --background: var(--c-surface-sunken);
  --progress-background: var(--c-primary);
}

.danger-progress {
  --progress-background: var(--c-error);
}
</style>
