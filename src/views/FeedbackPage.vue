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
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button text="" default-href="/settings"></ion-back-button>
        </ion-buttons>
        <ion-title class="font-medium text-xl">{{ $t('pageTitles.feedback') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="p-2 mb-4">
        <h3 class="text-base text-content-tertiary font-semibold mb-2">{{ $t('feedbackForm.formTitle') }}</h3>
        <p class="text-sm text-content-muted">{{ $t('feedbackForm.formSubtitle') }}</p>
      </div>

      <div class="space-y-3 mb-6">
        <ion-select
          v-model="feedbackType"
          fill="solid"
          :label="$t('feedbackForm.typeLabel')"
          label-placement="floating"
          :placeholder="$t('feedbackForm.typePlaceholder')"
          interface="popover"
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

        <section class="bg-surface rounded-2xl px-4 py-3">
          <p class="text-[11px] text-content-muted mb-1">{{ $t('feedbackForm.ratingLabel') }}</p>
          <div class="flex space-x-2 py-1">
            <button
              v-for="i in 5"
              :key="i"
              type="button"
              :aria-label="`${$t('fields.rating')}: ${i}/5`"
              :aria-pressed="i === rating"
              @click="setRating(i)"
              class="text-2xl focus:outline-none"
            >
              <ion-icon :icon="i <= rating ? star : starOutline" :class="i <= rating ? 'text-yellow-500' : 'text-content-faint'"></ion-icon>
            </button>
          </div>
          <div v-if="errors.rating" role="alert">
            <ErrorChip :message="errors.rating" />
          </div>
        </section>

        <ion-textarea
          v-model="feedbackText"
          fill="solid"
          :label="$t('feedbackForm.messageLabel')"
          label-placement="floating"
          :rows="4"
          :auto-grow="false"
          :placeholder="$t('feedbackForm.messagePlaceholder')"
          :maxlength="MAX_FEEDBACK_LENGTH"
          :counter="true"
          :error-text="errors.feedbackText"
          :class="{ 'ion-touched ion-invalid': errors.feedbackText }"
          @ion-input="feedbackTextProps.onInput"
          @ion-blur="feedbackTextProps.onBlur"
          @ion-change="feedbackTextProps.onChange"
        ></ion-textarea>

        <div class="flex items-center justify-between px-1 pt-1">
          <button type="button" @click="resetForm()" :disabled="isSubmitting" class="text-content-muted text-sm">{{ $t('feedbackForm.clearForm') }}</button>
          <ion-button @click="submitFeedback" :disabled="isSubmitting">
            <ion-icon slot="start" :icon="sendOutline"></ion-icon>
            {{ $t('feedbackForm.send') }}
          </ion-button>
        </div>
      </div>

      <div class="bg-blue-50 p-4 rounded-xl">
        <h4 class="text-sm font-medium text-blue-700 mb-1">{{ $t('feedbackForm.otherChannels') }}</h4>
        <p class="text-xs text-blue-600 mb-3">{{ $t('feedbackForm.otherChannelsDesc') }}</p>
        <div class="space-y-2 text-sm">
          <p class="flex items-center text-content-tertiary">
            <ion-icon :icon="mailOutline" class="mr-2"></ion-icon>
            atkansenturk@gmail.com
          </p>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
ion-content {
  --padding-start: 1rem;
  --padding-end: 1rem;
}
</style> 
