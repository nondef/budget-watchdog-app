<script setup lang="ts">
import { IonPage, IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonItem, IonLabel, IonIcon, IonAccordion, IonAccordionGroup, IonButton, IonSearchbar } from '@ionic/vue';
import { helpOutline, mailOutline } from 'ionicons/icons';
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { openExternalUrl } from '@/shared/utils/platform/open-external';

const { tm } = useI18n();
const searchQuery = ref('');

type Faq = { question: string; answer: string };
const faqs = computed(() => tm('help.faqs') as Faq[]);

const filteredFaqs = computed(() => {
  if (!searchQuery.value) {
    return faqs.value;
  }

  const query = searchQuery.value.toLowerCase();
  return faqs.value.filter(faq =>
    faq.question.toLowerCase().includes(query) ||
    faq.answer.toLowerCase().includes(query)
  );
});

const openExternalLink = openExternalUrl;
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button text="" default-href="/tabs/settings"></ion-back-button>
        </ion-buttons>
        <ion-title class="font-medium text-xl">{{ $t('pageTitles.help') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="p-2 mb-4">
        <h3 class="text-base text-content-tertiary font-semibold mb-2">{{ $t('help.heading') }}</h3>
        <p class="text-sm text-content-muted">{{ $t('help.subtitle') }}</p>
      </div>

      <!-- Destek Kanalı — yalnızca gerçekten çalışan tek kanal.
           Canlı destek ve iletişim formu kartları kaldırıldı: arkalarındaki
           handler'lar boştu, tıklayınca hiçbir şey olmuyordu. -->
      <div class="mb-6">
        <div class="bg-surface rounded-xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
          <div class="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-2">
            <ion-icon :icon="mailOutline" class="text-xl text-green-600"></ion-icon>
          </div>
          <h4 class="text-sm font-medium text-content mb-1">{{ $t('help.emailSupport') }}</h4>
          <p class="text-xs text-content-muted mb-3">{{ $t('help.emailSupportDesc') }}</p>
          <ion-button
            size="small"
            fill="outline"
            @click="openExternalLink('mailto:atkansenturk@gmail.com')"
          >
            atkansenturk@gmail.com
          </ion-button>
        </div>
      </div>

      <!-- Telefon hattı ve butcetakip.app/docs + /video-tutorials bağlantıları
           kaldırıldı: numara placeholder'dı, adresler başka bir domaine
           işaret ediyordu ve yayında ölü link olurlardı. Gerçek kaynaklar
           hazır olunca buraya geri eklenebilir. -->

      <!-- Sıkça Sorulan Sorular -->
      <div class="p-2 mb-4">
        <h3 class="text-base text-content-tertiary font-semibold mb-2">{{ $t('help.faqTitle') }}</h3>
        <ion-searchbar
          :placeholder="$t('forms.searchQuestion')"
          v-model="searchQuery"
          class="mb-4 p-0"
        ></ion-searchbar>
      </div>

      <ion-accordion-group>
        <ion-accordion v-for="(faq, index) in filteredFaqs" :key="index" :value="index.toString()">
          <ion-item slot="header" lines="none" class="py-2">
            <ion-icon :icon="helpOutline" slot="start" class="text-content-secondary"></ion-icon>
            <ion-label>
              <h2 class="font-medium text-content">{{ faq.question }}</h2>
            </ion-label>
          </ion-item>
          <div class="px-4 py-3 bg-surface-sunken text-sm" slot="content">
            {{ faq.answer }}
          </div>
        </ion-accordion>
      </ion-accordion-group>

      <div v-if="filteredFaqs.length === 0" class="text-center py-8">
        <ion-icon :icon="helpOutline" class="text-5xl text-gray-300 mb-2"></ion-icon>
        <p class="text-content-secondary">{{ $t('help.noResults') }}</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
ion-content {
  --padding-start: 1rem;
  --padding-end: 1rem;
}

:deep(ion-item) {
  --padding-start: 16px;
  --inner-padding-end: 16px;
}

:deep(ion-list) {
  background: white;
}

:deep(ion-searchbar) {
  --background: white;
  --box-shadow: none;
  --border-radius: 8px;
}

:deep(ion-accordion-group) {
  background: white;
  border-radius: 0.75rem;
  overflow: hidden;
}

:deep(ion-accordion) {
  border-radius: 0 !important;
}
</style> 