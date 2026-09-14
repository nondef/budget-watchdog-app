<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  toastController,
  IonToolbar,
  IonHeader,
  IonBackButton,
  IonTitle, IonButtons
} from '@ionic/vue'
import {
  shieldCheckmarkOutline,
  cloudDownloadOutline,
  trashOutline,
  chevronBackOutline,
  chevronForwardOutline,
  chevronDownOutline,
  lockClosedOutline,
  documentTextOutline,
} from 'ionicons/icons'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBackup } from '@/composables/features/useBackup'
import { useBackupReminder } from '@/composables/features/useBackupReminder'
import { useNotifier } from '@/composables/features/useNotifier'

const { t } = useI18n()
const {
  isExporting,
  isWiping,
  exportToFile,
  confirmAndWipe,
  confirmPlainExport,
  presentExportResult,
} = useBackup()

// Buradan üretilen dosya, Yedek ekranının şifresiz yedeğiyle BİRE BİR aynı
// `exportToJson` çıktısı — yani kullanıcının elinde geri yüklenebilir bir yedek
// oluyor. Damga yazılmazsa "N gündür yedek almadın" uyarısı, kullanıcı az önce
// tam bir kopya indirmiş olmasına rağmen sürüyordu.
const { markExported } = useBackupReminder()
const notifier = useNotifier()

const expandedSection = ref<'privacy' | 'terms' | null>(null)

const toggleSection = (section: 'privacy' | 'terms') => {
  expandedSection.value = expandedSection.value === section ? null : section
}

async function showToast(message: string, color: 'success' | 'danger' | 'warning' = 'success') {
  const toast = await toastController.create({
    message, duration: 2500, color, position: 'top',
  })
  await toast.present()
}

/**
 * "Verilerimi indir": tüm veriyi ŞİFRESİZ JSON olarak dışa aktarır.
 *
 * Şifresizlik bilinçli: taşınabilirliğin anlamı dosyayı başka bir yerde açıp
 * okuyabilmek, parolalı bir blob bunu karşılamaz. Şifreli kopya isteyen Yedek
 * ekranını kullanır. Ama düz metin tüm hesap, işlem ve bakiyeleri açığa çıkardığı
 * için açık rıza isteniyor — yedek ekranı bu kapıyı zaten koyuyordu, burası
 * sessizce üretiyordu.
 */
async function handleDownload() {
  if (!await confirmPlainExport('privacy.plainTitle')) return

  try {
    // 'share' hedefi: dosya public Documents yerine uygulamanın özel cache
    // klasörüne yazılır ve doğrudan paylaşım sheet'i açılır. Şifresiz finansal
    // geçmiş, kullanıcı onu bir yere gönderene kadar herkesin okuyabileceği bir
    // klasörde beklemesin diye.
    const location = await exportToFile(undefined, 'share')

    // Hatırlatıcı ve haftalık bildirim bu damgaya bakıyor. Yedek ekranıyla aynı
    // sıra: damga paylaşım sheet'i AÇILMADAN yazılır, çünkü sheet açıkken
    // uygulama arka plana düşüyor ve öne gelirken durum yeniden okunuyor.
    await markExported()

    // Yedek ekranıyla aynı gerekçe: kurulu yedek bildirimlerini bekletmeden
    // iptal et, yoksa az önce tam kopya indiren kullanıcıya "yedek al" düşer.
    void notifier.scheduleBackupReminder()
    void notifier.scheduleBackupSnoozeEndReminder()

    // Native'de paylaşım sheet'ini açar; web'de `location` null gelir (dosya
    // zaten indi) ve yalnızca bilgi mesajı gösterilir.
    await presentExportResult(location, {
      webMessage: t('privacy.downloaded'),
      webColor: 'warning',
    })
  } catch (err) {
    await showToast(err instanceof Error ? err.message : t('privacy.downloadFailed'), 'danger')
  }
}

async function handleDelete() {
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
          {{ $t('privacy.title') }}
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="priv-content" :scroll-y="true">
      <div class="px-4">

        <!-- Garanti kartı -->
        <section class="mt-5 bg-surface rounded-2xl px-4 py-4">
          <div class="flex items-start gap-3">
            <div class="size-11 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
              <ion-icon :icon="shieldCheckmarkOutline" class="size-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-[14px] font-semibold text-content">{{ $t('privacy.localOnly') }}</p>
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-500">
                  {{ $t('privacy.localBadge') }}
                </span>
              </div>
              <p class="text-[11px] text-content-muted mt-1 leading-snug">
                {{ $t('privacy.localDesc') }}
              </p>
            </div>
          </div>
        </section>
      </div>

      <div class="mt-5 px-4 pb-10 space-y-5">

        <!-- Veri yönetimi -->
        <section>
          <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-1 px-1">
            {{ $t('privacy.dataManagement') }}
          </p>
          <p class="text-[12px] text-content-muted mb-2 px-1 leading-snug">
            {{ $t('privacy.dataManagementDesc') }}
          </p>

          <div class="bg-surface rounded-2xl px-2">
            <button
                type="button"
                class="w-full flex items-center gap-3 px-2 py-3 rounded-xl active:bg-surface-sunken transition disabled:opacity-40"
                :disabled="isExporting || isWiping"
                @click="handleDownload"
            >
              <div class="size-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
                <ion-icon :icon="cloudDownloadOutline" class="size-[16px] text-indigo-600 dark:text-indigo-400" />
              </div>
              <div class="flex-1 text-left min-w-0">
                <p class="text-[14px] font-medium text-content">{{ $t('privacy.downloadData') }}</p>
                <p class="text-[11px] text-content-muted mt-0.5">{{ $t('privacy.downloadDataDesc') }}</p>
              </div>
              <ion-icon :icon="chevronForwardOutline" class="size-4 text-slate-400 dark:text-slate-600 shrink-0" />
            </button>

            <button
                type="button"
                class="w-full flex items-center gap-3 px-2 py-3 rounded-xl active:bg-rose-50 transition border-t border-line disabled:opacity-40"
                :disabled="isExporting || isWiping"
                @click="handleDelete"
            >
              <div class="size-9 rounded-xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center shrink-0">
                <ion-icon :icon="trashOutline" class="size-[16px] text-rose-600 dark:text-rose-400" />
              </div>
              <div class="flex-1 text-left min-w-0">
                <p class="text-[14px] font-medium text-rose-600">{{ $t('privacy.deleteData') }}</p>
                <p class="text-[11px] text-rose-500 mt-0.5">{{ $t('privacy.deleteDataDesc') }}</p>
              </div>
              <ion-icon :icon="chevronForwardOutline" class="size-4 text-rose-400 shrink-0" />
            </button>
          </div>
        </section>

        <!-- Yasal -->
        <section>
          <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-2 px-1">
            {{ $t('privacy.legal') }}
          </p>
          <div class="bg-surface rounded-2xl">
            <!-- Gizlilik Politikası -->
            <div :class="{ 'border-b border-line': expandedSection !== 'privacy' }">
              <button
                  type="button"
                  class="w-full flex items-center gap-3 px-4 py-3 active:bg-surface-sunken transition"
                  @click="toggleSection('privacy')"
              >
                <div class="size-9 rounded-xl bg-surface-sunken flex items-center justify-center shrink-0">
                  <ion-icon :icon="lockClosedOutline" class="size-[16px] text-content-secondary" />
                </div>
                <p class="flex-1 text-left text-[14px] font-medium text-content">
                  {{ $t('privacy.privacyPolicy') }}
                </p>
                <ion-icon
                    :icon="expandedSection === 'privacy' ? chevronDownOutline : chevronForwardOutline"
                    class="size-4 text-slate-400 shrink-0"
                />
              </button>
              <div v-if="expandedSection === 'privacy'" class="px-4 pb-4 text-[12px] text-content-tertiary leading-relaxed space-y-2 border-t border-line pt-3">
                <p>
                  <strong class="text-content">{{ $t('privacy.policy.noCollectTitle') }}</strong> {{ $t('privacy.policy.noCollectBody') }}
                </p>
                <p>
                  <strong class="text-content">{{ $t('privacy.policy.noServerTitle') }}</strong> {{ $t('privacy.policy.noServerBody') }}
                </p>
                <p>
                  <strong class="text-content">{{ $t('privacy.policy.noThirdPartyTitle') }}</strong> {{ $t('privacy.policy.noThirdPartyBody') }}
                </p>
                <p>
                  <strong class="text-content">{{ $t('privacy.policy.rightsTitle') }}</strong> {{ $t('privacy.policy.rightsBody') }}
                </p>
                <ul class="list-disc list-inside ml-2 space-y-0.5 text-[11px]">
                  <li>{{ $t('privacy.policy.rightsDownload') }}</li>
                  <li>{{ $t('privacy.policy.rightsDelete') }}</li>
                </ul>
                <p class="text-[10px] text-slate-400 italic pt-1">
                  {{ $t('privacy.disclaimer') }}
                </p>
              </div>
            </div>

            <!-- Kullanım Koşulları -->
            <div>
              <button
                  type="button"
                  class="w-full flex items-center gap-3 px-4 py-3 active:bg-surface-sunken transition"
                  @click="toggleSection('terms')"
              >
                <div class="size-9 rounded-xl bg-surface-sunken flex items-center justify-center shrink-0">
                  <ion-icon :icon="documentTextOutline" class="size-[16px] text-content-secondary" />
                </div>
                <p class="flex-1 text-left text-[14px] font-medium text-content">
                  {{ $t('privacy.terms') }}
                </p>
                <ion-icon
                    :icon="expandedSection === 'terms' ? chevronDownOutline : chevronForwardOutline"
                    class="size-4 text-slate-400 shrink-0"
                />
              </button>
              <div v-if="expandedSection === 'terms'" class="px-4 pb-4 text-[12px] text-content-tertiary leading-relaxed space-y-2 border-t border-line pt-3">
                <p>
                  <strong class="text-content">{{ $t('privacy.termsContent.purposeTitle') }}</strong> {{ $t('privacy.termsContent.purposeBody') }}
                </p>
                <p>
                  <strong class="text-content">{{ $t('privacy.termsContent.disclaimerTitle') }}</strong> {{ $t('privacy.termsContent.disclaimerBody') }}
                </p>
                <p>
                  <strong class="text-content">{{ $t('privacy.termsContent.dataRespTitle') }}</strong> {{ $t('privacy.termsContent.dataRespBody') }}
                </p>
                <p>
                  <strong class="text-content">{{ $t('privacy.termsContent.contentTitle') }}</strong> {{ $t('privacy.termsContent.contentBody') }}
                </p>
                <p class="text-[10px] text-slate-400 italic pt-1">
                  {{ $t('privacy.disclaimer') }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <p class="text-center text-[11px] text-slate-400">
          {{ $t('privacy.lastUpdated') }}
        </p>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.priv-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}
</style>
