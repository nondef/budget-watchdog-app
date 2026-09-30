<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  IonList,
  IonItem,
  IonLabel,
  IonRadio,
  IonRadioGroup,
  IonNote,
  onIonViewWillEnter
} from '@ionic/vue';
import { informationCircleOutline } from 'ionicons/icons';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '@/stores/app';
import { logger } from '@/infrastructure/logging';
import { Language, type LanguageCode } from '@/domain/value-objects/language';
import { SUPPORTED_LOCALES } from '@/i18n';
import SubPageHeader from '@/components/SubPageHeader.vue';

const { t, locale } = useI18n();
const appStore = useAppStore();

// Desteklenmeyen cihaz dillerini uygulamanın varsayılan diliyle değiştirme.
const readDeviceLanguage = () => typeof navigator === 'undefined' ? '' : navigator.language || '';
const deviceLanguage = ref(readDeviceLanguage());
const refreshDeviceLanguage = () => { deviceLanguage.value = readDeviceLanguage(); };

onIonViewWillEnter(refreshDeviceLanguage);
onMounted(() => window.addEventListener('languagechange', refreshDeviceLanguage));
onUnmounted(() => window.removeEventListener('languagechange', refreshDeviceLanguage));

const deviceLanguageName = computed(() => {
  if (!deviceLanguage.value) return t('language.deviceLanguageUnknown');
  try {
    return new Intl.DisplayNames([locale.value], { type: 'language' }).of(deviceLanguage.value)
        || deviceLanguage.value;
  } catch {
    return deviceLanguage.value;
  }
});

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
    <sub-page-header :title="$t('language.title')"/>

    <ion-content class="lang-content" :scroll-y="true">
      <div class="mx-auto w-full max-w-xl px-4 pb-12 pt-5">

        <!-- Açıklama -->
        <div class="intro-card">
          <span class="intro-card__icon lang-intro__icon"><ion-icon :icon="informationCircleOutline" /></span>
          <div>
            <h2 class="lang-heading">{{ $t('language.heading') }}</h2>
            <ion-note class="lang-subtitle">{{ $t('language.subtitle') }}</ion-note>
            <p class="lang-device-language">
              {{ $t('language.deviceLanguage', { language: deviceLanguageName }) }}
            </p>
            <ion-note class="lang-subtitle">{{ $t('language.selectedHint') }}</ion-note>
          </div>
        </div>

        <!-- Liste -->
        <div class="option-card mt-3">
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
                    class="option-radio"
                >
                  <span class="option-row">
                    <span class="lang-flag" :class="{ 'lang-flag--active': selectedLanguage === lang.code }">{{ lang.flag }}</span>
                    <ion-label>
                      <h3 class="option-title">{{ lang.nativeName }}</h3>
                      <p class="option-sub">{{ lang.name }}</p>
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

.lang-device-language {
  margin-top: 10px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--c-content-secondary);
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
  border: 1px solid var(--c-line);
  font-size: 20px;
  line-height: 1;
}

.lang-flag--active {
  border-color: var(--c-primary);
}

.lang-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 1rem;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  color: var(--c-content-muted);
}

.lang-intro__icon {
  font-size: 21px;
}

.lang-note__text {
  font-size: 12px;
  line-height: 1.45;
  color: var(--c-content-tertiary);
}
</style>
