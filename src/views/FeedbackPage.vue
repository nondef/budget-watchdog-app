<script setup lang="ts">
import { IonPage, IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonTextarea, IonSelect, IonSelectOption, IonIcon } from '@ionic/vue';
import { sendOutline, starOutline, star, thumbsUpOutline, bugOutline, helpOutline, bulbOutline, mailOutline } from 'ionicons/icons';
import { useI18n } from 'vue-i18n';
import { Capacitor } from '@capacitor/core';
import { appConfig } from '@/shared/config/app-config';
import { openExternalUrl } from '@/shared/utils/platform/open-external';
import { useToast } from "@/composables";
import { createFeedbackSchema, FEEDBACK_TYPES, MAX_FEEDBACK_LENGTH } from "@/forms/feedback.schema";
import { guardSubmit } from '@/composables/ui/guard-submit';
import ErrorChip from '@/components/ErrorChip.vue';
import CollapseTransition from '@/components/CollapseTransition.vue';
import { useForm } from "vee-validate";

const { t } = useI18n();
const toast = useToast()

const schema = createFeedbackSchema()

const { handleSubmit, resetForm, defineField, errors, isSubmitting } = useForm({
  validationSchema: schema,
  initialValues: {
    feedbackType: '',
    feedbackText: '',
    rating: 0,
  },
})

// Geri bildirimin gerçekten gideceği adres. Backend yok: sistem e-posta
// istemcisinde hazır bir taslak açılır, gönderme kararı kullanıcıda kalır.
// Eskiden hiçbir yere gitmeyip "gönderildi" toast'ı basılıyordu.
const SUPPORT_EMAIL = 'atkansenturk@gmail.com';

// Form değerleri
const [feedbackType, feedbackTypeProps] = defineField('feedbackType')
const [feedbackText, feedbackTextProps] = defineField('feedbackText')
const [rating] = defineField('rating')

// Geri bildirim tipleri
const feedbackTypeOptions = {
  bug: { labelKey: 'feedbackForm.typeBug', icon: bugOutline },
  feature: { labelKey: 'feedbackForm.typeFeature', icon: bulbOutline },
  suggestion: { labelKey: 'feedbackForm.typeSuggestion', icon: thumbsUpOutline },
  question: { labelKey: 'feedbackForm.typeQuestion', icon: helpOutline },
};
const feedbackTypes = FEEDBACK_TYPES.map(value => ({ value, ...feedbackTypeOptions[value] }));

// Yıldız derecelendirme işlevi
const setRating = (value: number) => {
  rating.value = value;
};

const buildMailto = (values: { feedbackType: string; feedbackText: string; rating: number }) => {
  const typeKey = feedbackTypes.find(type => type.value === values.feedbackType)!.labelKey;
  const subject = `[${appConfig.name}] ${t(typeKey)}`;
  const body = [
    values.feedbackText,
    '',
    '---',
    `${t('feedbackForm.ratingLabel')}: ${values.rating}/5`,
    `${appConfig.name} v${appConfig.version}`,
    Capacitor.getPlatform(),
  ].join('\n');

  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

// Geri bildirimi gönderme
const submitFeedback = guardSubmit(isSubmitting, handleSubmit((values) => {
  openExternalUrl(buildMailto(values));

  toast.info(t('feedbackForm.mailOpened'))
  resetForm();
}));
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-buttons slot="start">
          <ion-back-button text="" default-href="/tabs/settings"></ion-back-button>
        </ion-buttons>
        <ion-title class="font-medium text-xl">{{ $t('pageTitles.feedback') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="feedback-content">
      <div class="feedback-shell">
      <div class="intro-card feedback-intro mb-4">
        <span class="intro-card__icon"><ion-icon :icon="mailOutline" /></span>
        <div>
        <h3 class="text-base text-content-tertiary font-semibold mb-2">{{ $t('feedbackForm.formTitle') }}</h3>
        <p class="text-sm text-content-muted">{{ $t('feedbackForm.formSubtitle') }}</p>
        </div>
      </div>

      <div class="feedback-form space-y-3 mb-6">
        <ion-select
          v-model="feedbackType"
          mode="md"
          fill="solid"
          :label="$t('feedbackForm.typeLabel')"
          label-placement="floating"
          :placeholder="$t('feedbackForm.typePlaceholder')"
          interface="popover"
          class="feedback-field"
          :error-text="errors.feedbackType"
          :class="{ 'ion-touched ion-invalid': errors.feedbackType }"
          @ion-blur="feedbackTypeProps.onBlur"
          @ion-change="feedbackTypeProps.onChange"
        >
          <ion-select-option v-for="type in feedbackTypes" :key="type.value" :value="type.value" class="flex items-center">
            <ion-icon :icon="type.icon" slot="start"></ion-icon>
            {{ $t(type.labelKey) }}
          </ion-select-option>
        </ion-select>

        <section class="rating-card px-4 py-3">
          <p class="text-[12px] font-semibold text-content-secondary mb-1">{{ $t('feedbackForm.ratingLabel') }}</p>
          <div class="flex justify-between gap-2 py-2">
            <button
              v-for="i in 5"
              :key="i"
              type="button"
              :aria-label="`${$t('fields.rating')}: ${i}/5`"
              :aria-pressed="i === rating"
              @click="setRating(i)"
              class="rating-button"
              :class="{ 'rating-button--active': i <= rating }"
            >
              <ion-icon :icon="i <= rating ? star : starOutline" aria-hidden="true"></ion-icon>
            </button>
          </div>
          <collapse-transition>
            <div v-if="errors.rating" role="alert">
              <ErrorChip :message="errors.rating" />
            </div>
          </collapse-transition>
        </section>

        <ion-textarea
          v-model="feedbackText"
          mode="md"
          fill="solid"
          :label="$t('feedbackForm.messageLabel')"
          label-placement="floating"
          :rows="4"
          :auto-grow="false"
          :placeholder="$t('feedbackForm.messagePlaceholder')"
          :maxlength="MAX_FEEDBACK_LENGTH"
          :counter="true"
          class="feedback-field feedback-message"
          :error-text="errors.feedbackText"
          :class="{ 'ion-touched ion-invalid': errors.feedbackText }"
          @ion-input="feedbackTextProps.onInput"
          @ion-blur="feedbackTextProps.onBlur"
          @ion-change="feedbackTextProps.onChange"
        ></ion-textarea>

        <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
          <ion-button fill="clear" class="clear-button" @click="resetForm()" :disabled="isSubmitting">{{ $t('feedbackForm.clearForm') }}</ion-button>
          <ion-button class="app-button" @click="submitFeedback" :disabled="isSubmitting">
            <ion-icon slot="start" :icon="sendOutline"></ion-icon>
            {{ $t('feedbackForm.send') }}
          </ion-button>
        </div>
      </div>

      <div class="feedback-note p-4 rounded-xl">
        <h4 class="text-sm font-bold text-content mb-1">{{ $t('feedbackForm.otherChannels') }}</h4>
        <p class="text-xs text-content-muted mb-3">{{ $t('feedbackForm.otherChannelsDesc') }}</p>
        <div class="space-y-2 text-sm">
          <p class="flex items-center text-content-tertiary">
            <ion-icon :icon="mailOutline" class="mr-2"></ion-icon>
            atkansenturk@gmail.com
          </p>
        </div>
      </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.feedback-content {
  --background: var(--c-page);
}

.feedback-shell {
  width: 100%;
  max-width: 36rem;
  margin-inline: auto;
  padding: 20px 16px 40px;
}

.feedback-form, .feedback-note {
  border: 1px solid var(--c-line);
  background: var(--c-surface);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.feedback-intro {
  box-shadow: 0 8px 24px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.feedback-intro h3 {
  margin-bottom: 3px;
  color: var(--c-content);
  font-weight: 800;
}

.feedback-form {
  padding: 14px;
  border-radius: 1.25rem;
}

.feedback-form ion-select.feedback-field,
.feedback-form ion-textarea.feedback-field {
  --background: var(--c-surface-sunken);
  --color: var(--c-content);
  --placeholder-color: var(--c-content-muted);
  --placeholder-opacity: 1;
  --highlight-color-focused: var(--c-primary);
  --highlight-color-valid: var(--c-primary);
  --highlight-color-invalid: var(--c-error);
  --border-radius: 1rem;
  --padding-start: 16px;
  --padding-end: 16px;
  --feedback-field-outline: var(--c-line-strong);
  color: var(--c-content);
}

/* Dolgulu alanların genel stili kenarlığı kaldırıyor; alan sınırını sayaç
   ve hata metnini kutuya almadan gerçek giriş sarmalayıcısında belirginleştir. */
.feedback-form ion-select.feedback-field::part(wrapper),
.feedback-form ion-textarea.feedback-field :deep(.textarea-wrapper) {
  outline: 1px solid var(--feedback-field-outline);
  outline-offset: -1px;
}

.feedback-form .feedback-field:focus-within,
.feedback-form .feedback-field.select-expanded {
  --feedback-field-outline: var(--c-primary);
}

.feedback-form .feedback-field.ion-touched.ion-invalid {
  --feedback-field-outline: var(--c-error);
}

.feedback-form ion-select.feedback-field::part(icon) {
  color: var(--c-content-secondary);
  opacity: 1;
}

.feedback-message :deep(textarea) {
  resize: none;
  line-height: 1.6;
}

.rating-card {
  border: 1px solid var(--c-line);
  border-radius: 1rem;
  background: var(--c-surface-sunken);
}

.rating-button {
  --rating-accent: #8a651d;
  display: grid;
  place-items: center;
  width: 42px;
  min-width: 0;
  height: 42px;
  border: 1px solid var(--c-line);
  border-radius: 13px;
  background: var(--c-surface);
  color: var(--c-content-muted);
  font-size: 23px;
  transition: 150ms ease;
}

.rating-button--active {
  border-color: color-mix(in srgb, var(--rating-accent) 55%, var(--c-line));
  background: color-mix(in srgb, var(--rating-accent) 12%, var(--c-surface));
  color: var(--rating-accent);
}

.rating-button:focus-visible {
  outline: 2px solid var(--c-primary);
  outline-offset: 2px;
}

:global(.ion-palette-dark .feedback-form .rating-button) {
  --rating-accent: #fcd34d;
}

.clear-button {
  --color: var(--c-content-secondary);
  margin-inline-start: -10px;
  font-size: 12px;
  font-weight: 700;
  text-transform: none;
}

.feedback-note {
  border-radius: 1rem;
}
</style> 
