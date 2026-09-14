<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  IonToolbar,
  IonHeader,
  IonBackButton,
  IonTitle,
  IonButtons,
  IonList,
  IonItem,
  IonLabel,
  IonRadio,
  IonRadioGroup,
  IonNote,
} from '@ionic/vue';
import { chevronBackOutline, informationCircleOutline } from 'ionicons/icons';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '@/stores/app';
import { logger } from '@/infrastructure/logging';
import { Language, type LanguageCode } from '@/domain/value-objects/language';
import { SUPPORTED_LOCALES } from '@/i18n';

const { t } = useI18n();
const appStore = useAppStore();

const flags: Record<string, string> = { tr: '🇹🇷', en: '🇬🇧', de: '🇩🇪' };

const languages = computed(() =>
  SUPPORTED_LOCALES.map((code) => ({
    code,
    name: t(`language.names.${code}`),
    nativeName: Language.from(code).nativeName,
    flag: flags[code] ?? '🏳️',
  }))
);

/** Radio grubu doğrudan store'a yazmasın; seçim changeLanguage ile kalıcılaşır. */
const selectedLanguage = computed<string>({
  get: () => appStore.language ?? 'tr',
  set: (code) => {
    if (code === (appStore.language ?? 'tr')) return;

    // Yazma başarısızsa seçim eski değere geri döner; sessiz kalmasın diye
    // hatayı burada yakalıyoruz (aksi halde unhandled rejection oluyordu).
    appStore
        .changeLanguage(Language.from(code as LanguageCode))
        .catch(err => logger.error('Dil değiştirilemedi', { context: 'language', error: err, data: { code } }));
  },
});
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" :icon="chevronBackOutline"/>
        </ion-buttons>

        <ion-title class="text-xl font-semibold">
          {{ $t('language.title') }}
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="lang-content" :scroll-y="true">
      <div class="px-4 pb-10">

        <!-- Açıklama -->
        <div class="mt-5 px-1">
          <h2 class="lang-heading">{{ $t('language.heading') }}</h2>
          <ion-note class="lang-subtitle">{{ $t('language.subtitle') }}</ion-note>
        </div>

        <!-- Liste -->
        <div class="lang-card mt-4">
          <ion-radio-group v-model="selectedLanguage">
            <ion-list :inset="false" lines="full">
              <ion-item
                  v-for="(lang, idx) in languages"
                  :key="lang.code"
                  class="plain-item"
                  :lines="idx === languages.length - 1 ? 'none' : 'full'"
                  :button="false"
              >
                <!-- Bayrak radio'nun etiketi içinde: satırın tamamı dokunulabilir. -->
                <ion-radio
                    :value="lang.code"
                    justify="space-between"
                    label-placement="start"
                    class="lang-radio"
                >
                  <span class="lang-row">
                    <span class="lang-flag">{{ lang.flag }}</span>
                    <ion-label>
                      <h3 class="lang-title">{{ lang.nativeName }}</h3>
                      <p class="lang-sub">{{ lang.name }}</p>
                    </ion-label>
                  </span>
                </ion-radio>
              </ion-item>
            </ion-list>
          </ion-radio-group>
        </div>

        <!-- Bilgi -->
        <div class="lang-note">
          <ion-icon :icon="informationCircleOutline" class="size-[16px] shrink-0 mt-0.5" />
          <ion-note class="lang-note__text">{{ $t('language.note') }}</ion-note>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.lang-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}

.lang-heading {
  font-size: 18px;
  font-weight: 700;
  color: var(--c-content);
}

.lang-subtitle {
  display: block;
  font-size: 12px;
  line-height: 1.35;
  color: var(--c-content-muted);
  margin-top: 4px;
}

/* Kart: ion-list'i saran yüzey — köşeler kartta, satırlar şeffaf. */
.lang-card {
  background: var(--c-surface);
  border-radius: 1rem;
  overflow: hidden;
}

.lang-card ion-list {
  background: transparent;
  padding: 0;
  margin: 0;
}

.lang-card ion-item.plain-item {
  --background: transparent;
  --background-activated: var(--c-surface-sunken);
  --background-focused: var(--c-surface-sunken);
  --background-hover: transparent;
  --border-color: var(--c-line);
  --padding-start: 14px;
  --inner-padding-end: 14px;
  --min-height: 62px;
}

/* Radio satırın tamamını kaplasın: etiket başta, işaret sonda. */
.lang-radio {
  width: 100%;
}

.lang-radio::part(label) {
  margin-inline-end: 8px;
}

.lang-row {
  display: flex;
  align-items: center;
  min-width: 0;
}

.lang-flag {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-inline-end: 12px;
  flex-shrink: 0;
  background: var(--c-surface-sunken);
  font-size: 20px;
  line-height: 1;
}

.lang-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--c-content);
}

.lang-sub {
  font-size: 12px;
  color: var(--c-content-muted);
  margin-top: 2px;
  white-space: normal;
}

.lang-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 1rem;
  background: var(--c-surface);
  color: var(--c-content-muted);
}

.lang-note__text {
  font-size: 12px;
  line-height: 1.45;
  color: var(--c-content-tertiary);
}
</style>
