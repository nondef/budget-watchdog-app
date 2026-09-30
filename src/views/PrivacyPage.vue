<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonBadge,
  IonSpinner,
  IonAccordion,
  IonAccordionGroup,
  toastController
} from '@ionic/vue'
import {
  shieldCheckmarkOutline,
  cloudDownloadOutline,
  trashOutline,
  lockClosedOutline,
  documentTextOutline
} from 'ionicons/icons'
import { useI18n } from 'vue-i18n'
import { useBackup } from '@/composables/features/useBackup'
import { useBackupReminder } from '@/composables/features/useBackupReminder'
import { useNotifier } from '@/composables/features/useNotifier'

import SubPageHeader from '@/components/SubPageHeader.vue';
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
    <sub-page-header :title="$t('privacy.title')"/>

    <ion-content :fullscreen="true" class="priv-content" :scroll-y="true">
      <main class="mx-auto w-full max-w-xl space-y-6 px-4 pb-12 pt-5">
        <section class="app-hero privacy-hero flex items-start gap-4 p-5">
          <div class="hero-icon flex size-12 shrink-0 items-center justify-center rounded-2xl">
            <ion-icon :icon="shieldCheckmarkOutline" class="text-[22px]" aria-hidden="true" />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-[18px] font-extrabold text-content">{{ $t('privacy.localOnly') }}</h2>
              <ion-badge class="privacy-badge">{{ $t('privacy.localBadge') }}</ion-badge>
            </div>
            <p class="mt-1 text-[12px] leading-relaxed text-content-muted">
              {{ $t('privacy.localDesc') }}
            </p>
          </div>
        </section>

        <section aria-labelledby="privacy-data-heading">
          <h2 id="privacy-data-heading" class="section-label">{{ $t('privacy.dataManagement') }}</h2>
          <ion-note class="section-description">{{ $t('privacy.dataManagementDesc') }}</ion-note>
          <ion-list class="app-card privacy-card privacy-list overflow-hidden">
            <ion-item
                class="privacy-item"
                lines="full"
                button
                :detail="!isExporting"
                :disabled="isExporting || isWiping"
                :aria-busy="isExporting"
                @click="handleDownload"
            >
              <div slot="start" class="privacy-icon privacy-icon--download">
                <ion-icon :icon="cloudDownloadOutline" aria-hidden="true" />
              </div>
              <ion-label class="ion-text-wrap">
                <h3>{{ $t('privacy.downloadData') }}</h3>
                <p>{{ $t('privacy.downloadDataDesc') }}</p>
              </ion-label>
              <transition name="icon-swap">
                <ion-spinner v-if="isExporting" slot="end" name="crescent" aria-hidden="true" />
              </transition>
            </ion-item>
            <ion-item
                class="privacy-item privacy-item--danger"
                lines="none"
                button
                :detail="!isWiping"
                :disabled="isExporting || isWiping"
                :aria-busy="isWiping"
                @click="handleDelete"
            >
              <div slot="start" class="privacy-icon privacy-icon--danger">
                <ion-icon :icon="trashOutline" aria-hidden="true" />
              </div>
              <ion-label class="ion-text-wrap">
                <h3>{{ $t('privacy.deleteData') }}</h3>
                <p>{{ $t('privacy.deleteDataDesc') }}</p>
              </ion-label>
              <transition name="icon-swap">
                <ion-spinner v-if="isWiping" slot="end" name="crescent" aria-hidden="true" />
              </transition>
            </ion-item>
          </ion-list>
        </section>

        <section aria-labelledby="privacy-legal-heading">
          <h2 id="privacy-legal-heading" class="section-label">{{ $t('privacy.legal') }}</h2>
          <ion-accordion-group class="app-card privacy-card overflow-hidden">
            <ion-accordion value="privacy" class="privacy-accordion">
              <ion-item slot="header" class="privacy-item" lines="none">
                <div slot="start" class="privacy-icon privacy-icon--policy">
                  <ion-icon :icon="lockClosedOutline" aria-hidden="true" />
                </div>
                <ion-label class="ion-text-wrap"><h3>{{ $t('privacy.privacyPolicy') }}</h3></ion-label>
              </ion-item>
              <div slot="content" class="legal-content">
                <p v-for="key in ['noCollect', 'noServer', 'noThirdParty', 'rights']" :key="key">
                  <strong>{{ $t(`privacy.policy.${key}Title`) }}</strong>
                  {{ $t(`privacy.policy.${key}Body`) }}
                </p>
                <ul class="list-disc ps-5 space-y-1">
                  <li>{{ $t('privacy.policy.rightsDownload') }}</li>
                  <li>{{ $t('privacy.policy.rightsDelete') }}</li>
                </ul>
                <ion-note class="legal-disclaimer">{{ $t('privacy.disclaimer') }}</ion-note>
              </div>
            </ion-accordion>
            <ion-accordion value="terms" class="privacy-accordion">
              <ion-item slot="header" class="privacy-item" lines="none">
                <div slot="start" class="privacy-icon privacy-icon--terms">
                  <ion-icon :icon="documentTextOutline" aria-hidden="true" />
                </div>
                <ion-label class="ion-text-wrap"><h3>{{ $t('privacy.terms') }}</h3></ion-label>
              </ion-item>
              <div slot="content" class="legal-content">
                <p v-for="key in ['purpose', 'disclaimer', 'dataResp', 'content']" :key="key">
                  <strong>{{ $t(`privacy.termsContent.${key}Title`) }}</strong>
                  {{ $t(`privacy.termsContent.${key}Body`) }}
                </p>
                <ion-note class="legal-disclaimer">{{ $t('privacy.disclaimer') }}</ion-note>
              </div>
            </ion-accordion>
          </ion-accordion-group>
        </section>

        <ion-note class="block text-center text-[11px] text-content-muted">
          {{ $t('privacy.lastUpdated') }}
        </ion-note>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.priv-content {
  --background: var(--c-page);
}

.hero-icon {
  background: var(--c-primary);
  color: var(--c-on-primary);
}

.privacy-badge {
  --background: var(--c-surface-sunken);
  --color: var(--c-content-secondary);
  border: 1px solid var(--c-line);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 10px;
}

.section-description {
  display: block;
  margin: 0 4px 12px;
  color: var(--c-content-muted);
  font-size: 12px;
  line-height: 1.5;
}

.privacy-list {
  margin: 0;
  padding: 0;
}

.privacy-item {
  --background: transparent;
  --background-activated: var(--c-surface-sunken);
  --background-hover: var(--c-surface-sunken);
  --background-focused: var(--c-surface-sunken);
  --border-color: var(--c-line);
  --min-height: 64px;
  --padding-start: 14px;
  --inner-padding-end: 12px;
  --detail-icon-color: var(--c-content-muted);
}

.privacy-item h3 {
  color: var(--c-content);
  font-size: 14px;
  font-weight: 700;
}

.privacy-item p {
  margin-top: 3px;
  color: var(--c-content-muted);
  font-size: 11px;
  line-height: 1.5;
}

.privacy-item--danger {
  --background-activated: color-mix(in srgb, var(--c-error) 10%, var(--c-surface));
  --detail-icon-color: var(--c-error);
}

.privacy-item--danger h3,
.privacy-item--danger ion-spinner {
  color: var(--c-error);
}

.privacy-icon {
  display: flex;
  width: 38px;
  height: 38px;
  margin-inline-end: 12px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--privacy-icon-accent) 23%, var(--c-line));
  border-radius: 13px;
  background: color-mix(in srgb, var(--privacy-icon-accent) 11%, var(--c-surface-sunken));
  color: var(--privacy-icon-accent);
}

.privacy-icon ion-icon {
  font-size: 18px;
}

.privacy-icon--download {
  --privacy-icon-accent: #4338ca;
}

.privacy-icon--danger {
  --privacy-icon-accent: var(--c-error);
}

.privacy-icon--policy {
  --privacy-icon-accent: #0f766e;
}

.privacy-icon--terms {
  --privacy-icon-accent: #0369a1;
}

:global(.ion-palette-dark .privacy-icon--download) {
  --privacy-icon-accent: #a5b4fc;
}

:global(.ion-palette-dark .privacy-icon--policy) {
  --privacy-icon-accent: #5eead4;
}

:global(.ion-palette-dark .privacy-icon--terms) {
  --privacy-icon-accent: #7dd3fc;
}

.privacy-accordion {
  background: var(--c-surface);
}

.privacy-accordion + .privacy-accordion {
  border-top: 1px solid var(--c-line);
}

.privacy-accordion :deep(.ion-accordion-toggle-icon) {
  color: var(--c-content-muted);
  font-size: 18px;
}

.legal-content {
  padding: 16px;
  border-top: 1px solid var(--c-line);
  color: var(--c-content-secondary);
  font-size: 12px;
  line-height: 1.7;
}

.legal-content > * + * {
  margin-top: 10px;
}

.legal-content strong {
  color: var(--c-content);
}

.legal-disclaimer {
  display: block;
  color: var(--c-content-muted);
  font-size: 11px;
  font-style: italic;
}
</style>
