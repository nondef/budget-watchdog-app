<script setup lang="ts">
/**
 * Kalıcı durum kurulumu kalıcı olarak patladığında gösterilen tek ekran.
 *
 * Eskiden bu durumun karşılığı KALICI BOŞ EKRANDI: guard her navigasyonu iptal
 * ediyor, arka planda kurulum sonsuza dek yeniden deneniyordu. Kullanıcı ne
 * olduğunu göremiyor, verisini dışarı çıkaramıyor — Yedekleme ekranı da aynı
 * guard'ın arkasında — ve tek çıkışı uygulamayı silmek oluyordu; cihaz yedeği
 * kapalı olduğu için (allowBackup=false) bu, tüm finansal geçmişin kalıcı
 * kaybı demekti.
 *
 * Bu yüzden ekran hiçbir store'a ve DB'ye BAĞLI DEĞİL: yalnızca hata durumunu
 * okur ve platform işlemlerini `database/recovery.ts` üzerinden çağırır.
 */
import { computed, ref } from 'vue';
import { IonPage, IonContent, IonIcon, alertController } from '@ionic/vue';
import { useI18n } from 'vue-i18n';
import {
  alertCircleOutline,
  documentTextOutline,
  downloadOutline,
  refreshOutline,
  trashOutline,
} from 'ionicons/icons';
import { persistenceFailure } from '@/infrastructure/database/persistence-status';
import {
  buildDiagnosticsReport,
  exportRecoveryBackup,
  resetDatabase,
} from '@/infrastructure/database/recovery';
import { buildBackupFileName, saveBackupFile } from '@/infrastructure/services/backup-file-storage';
import { useBackup } from '@/composables/features/useBackup';
import { useToast } from '@/composables/ui/useToast';
import { logger } from '@/infrastructure/logging';

const { t } = useI18n();
const toast = useToast();

// Parola diyalogları ve "nereye kaydedildi" sunumu Yedekleme ekranıyla AYNI
// olmalı: kullanıcı burada öğrendiği akışı orada da görecek.
const { promptNewPassphrase, confirmPlainExport, presentExportResult } = useBackup();

const failure = computed(() => persistenceFailure.value);

/**
 * Dışa aktarma yalnızca "veri okunabilir AMA şema tanıdık" durumunda anlamlı.
 *
 *  - `encryption-key-lost` → okunacak veri yok; buton koyup her seferinde hata
 *    vermek kullanıcıya boşuna umut olurdu.
 *  - `schema-too-new`      → veri okunabilir ama bu build şemayı TANIMIYOR.
 *    Üretilecek yedek, bu sürümün bildiği yedek formatıyla damgalanır ve
 *    yeni sürümün kolonlarını taşıyamaz; kullanıcı onu geri yüklediğinde
 *    veri sessizce eksilir. Tek doğru yol uygulamayı güncellemek.
 */
const canExportData = computed(
  () => failure.value?.kind !== 'encryption-key-lost'
      && failure.value?.kind !== 'schema-too-new',
);

/**
 * `schema-too-new`'de veri SAĞLAM ve tek eksik uygulamanın kendisi.
 * Sıfırlama butonunu göstermek, kullanıcıya sağlam verisini silmenin en kolay
 * yolunu sunmak olurdu — bu ekranın var oluş amacının tam tersi.
 */
const canResetDatabase = computed(() => failure.value?.kind !== 'schema-too-new');

const explanation = computed(() =>
  t(`recovery.kind.${failure.value?.kind ?? 'unknown'}`),
);

const isExportingData = ref(false);
const isExportingDiagnostics = ref(false);
const isResetting = ref(false);
const busy = computed(
  () => isExportingData.value || isExportingDiagnostics.value || isResetting.value,
);

/** Tam yeniden başlatma: açılış akışının tamamı baştan koşsun. */
function retry() {
  window.location.replace('/');
}

async function exportData() {
  if (busy.value) return;

  const passphrase = await promptNewPassphrase();

  // İptal → şifresiz üretmeyi açıkça sor; sessizce düz metin yazmak
  // Yedekleme ekranının kuralını burada delerdi.
  if (passphrase === null && !(await confirmPlainExport())) return;

  isExportingData.value = true;
  try {
    const json = await exportRecoveryBackup(passphrase ?? undefined);
    const location = await saveBackupFile(json, buildBackupFileName(!!passphrase), 'documents');

    await presentExportResult(location, { webMessage: t('recovery.export.success') });
  } catch (error) {
    logger.error('Kurtarma yedeği alınamadı', { context: 'RecoveryPage', error });
    await toast.error(t('recovery.export.failed'));
  } finally {
    isExportingData.value = false;
  }
}

async function exportDiagnostics() {
  if (busy.value) return;

  isExportingDiagnostics.value = true;
  try {
    const report = buildDiagnosticsReport(failure.value);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
    // Paylaşım hedefi: dosya cihazda kalmak için değil, desteğe gitmek için
    // üretiliyor.
    const location = await saveBackupFile(report, `budget-watchdog-diagnostics-${stamp}.txt`, 'share');

    await presentExportResult(location, { webMessage: t('recovery.diagnostics.saved') });
  } catch (error) {
    logger.error('Tanılama dosyası üretilemedi', { context: 'RecoveryPage', error });
    await toast.error(t('recovery.diagnostics.failed'));
  } finally {
    isExportingDiagnostics.value = false;
  }
}

/** İki adımlı onay — Yedekleme ekranındaki sıfırlama ile aynı ağırlıkta. */
async function confirmReset(): Promise<boolean> {
  const intent = await alertController.create({
    header: t('recovery.reset.confirmTitle'),
    message: t('recovery.reset.confirmMessage'),
    backdropDismiss: false,
    buttons: [
      { text: t('backup.wipe.cancel'), role: 'cancel' },
      { text: t('backup.wipe.continue'), role: 'confirm' },
    ],
  });
  await intent.present();
  if ((await intent.onDidDismiss()).role !== 'confirm') return false;

  const word = t('backup.wipe.confirmWord');
  const confirm = await alertController.create({
    header: t('recovery.reset.confirmTitle'),
    message: t('backup.wipe.confirmMessage', { word }),
    backdropDismiss: false,
    inputs: [
      {
        name: 'confirmText',
        type: 'text',
        placeholder: word,
        attributes: { autocapitalize: 'characters', autocorrect: 'off' },
      },
    ],
    buttons: [
      { text: t('backup.wipe.cancel'), role: 'cancel' },
      { text: t('backup.wipe.action'), role: 'destructive' },
    ],
  });
  await confirm.present();

  const { role, data } = await confirm.onDidDismiss<{ values: { confirmText?: string } }>();
  if (role !== 'destructive') return false;

  if ((data?.values?.confirmText ?? '').trim().toUpperCase() !== word.toUpperCase()) {
    await toast.warning(t('backup.wipe.mismatch'));
    return false;
  }

  return true;
}

async function reset() {
  if (busy.value || !(await confirmReset())) return;

  isResetting.value = true;
  try {
    const outcome = await resetDatabase();

    // `manual-required`: dosya uygulama içinden silinemedi (açılamayan bir
    // veritabanını plugin de silemiyor). Kullanıcıyı "oldu" sanıp yeniden
    // başlatmaya göndermek yerine tek işe yarayan yolu anlat.
    if (outcome === 'manual-required') {
      const info = await alertController.create({
        header: t('recovery.reset.manualTitle'),
        message: t('recovery.reset.manualMessage'),
        buttons: [{ text: t('common.done'), role: 'cancel' }],
      });
      await info.present();
      return;
    }

    await toast.success(t('recovery.reset.done'));
    setTimeout(() => window.location.replace('/'), 800);
  } catch (error) {
    logger.error('Sıfırlama başarısız', { context: 'RecoveryPage', error });
    await toast.error(t('recovery.reset.failed'));
  } finally {
    isResetting.value = false;
  }
}
</script>

<template>
  <ion-page>
    <ion-content :fullscreen="true" :scroll-y="true">
      <div class="px-4 pt-10 pb-10">
        <div class="flex flex-col items-center text-center">
          <div class="size-14 rounded-2xl bg-amber-50 flex items-center justify-center">
            <ion-icon :icon="alertCircleOutline" class="size-7 text-amber-600" />
          </div>
          <h1 class="mt-4 text-[20px] font-bold text-content">{{ $t('recovery.headline') }}</h1>
          <p class="mt-2 text-[13px] text-content-secondary leading-snug">{{ explanation }}</p>
        </div>

        <!-- Teknik detay: destek için tek değerli bilgi, gizlenmiyor. -->
        <div v-if="failure" class="mt-5 bg-surface rounded-2xl px-4 py-3 space-y-2">
          <div v-if="failure.migration" class="flex items-start justify-between gap-3">
            <span class="text-[12px] text-content-muted shrink-0">
              {{ $t('recovery.migrationLabel') }}
            </span>
            <span class="text-[12px] font-medium text-content-secondary text-right break-all">
              {{ failure.migration.version }} · {{ failure.migration.name }}
            </span>
          </div>
          <div v-if="failure.schema" class="flex items-start justify-between gap-3">
            <span class="text-[12px] text-content-muted shrink-0">
              {{ $t('recovery.schemaLabel') }}
            </span>
            <span class="text-[12px] font-medium text-content-secondary text-right break-all">
              {{ failure.schema.onDisk }} → {{ failure.schema.supported }}
            </span>
          </div>
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
              {{ $t('recovery.detailLabel') }}
            </p>
            <p class="mt-1 text-[11px] text-content-secondary leading-snug break-all font-mono">
              {{ failure.detail }}
            </p>
          </div>
        </div>

        <div class="mt-6 space-y-3">
          <button
              type="button"
              class="w-full h-11 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold flex items-center justify-center gap-2 active:bg-indigo-700 disabled:bg-slate-300 transition"
              :disabled="busy"
              @click="retry"
          >
            <ion-icon :icon="refreshOutline" class="size-[16px]" />
            {{ $t('recovery.actions.retry') }}
          </button>

          <div v-if="canExportData">
            <button
                type="button"
                class="w-full h-11 rounded-xl bg-surface text-content text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition"
                :disabled="busy"
                @click="exportData"
            >
              <ion-icon :icon="downloadOutline" class="size-[16px]" />
              {{ isExportingData ? $t('backup.creating') : $t('recovery.actions.export') }}
            </button>
            <p class="mt-1.5 px-1 text-[11px] text-content-muted leading-snug">
              {{ $t('recovery.actions.exportHint') }}
            </p>
          </div>

          <div>
            <button
                type="button"
                class="w-full h-11 rounded-xl bg-surface text-content text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition"
                :disabled="busy"
                @click="exportDiagnostics"
            >
              <ion-icon :icon="documentTextOutline" class="size-[16px]" />
              {{ $t('recovery.actions.diagnostics') }}
            </button>
            <p class="mt-1.5 px-1 text-[11px] text-content-muted leading-snug">
              {{ $t('recovery.actions.diagnosticsHint') }}
            </p>
          </div>

          <div v-if="canResetDatabase" class="pt-2">
            <button
                type="button"
                class="w-full h-11 rounded-xl border border-red-200 text-red-600 text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition"
                :disabled="busy"
                @click="reset"
            >
              <ion-icon :icon="trashOutline" class="size-[16px]" />
              {{ $t('recovery.actions.reset') }}
            </button>
            <p class="mt-1.5 px-1 text-[11px] text-content-muted leading-snug">
              {{ $t('recovery.actions.resetHint') }}
            </p>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>
