<script setup lang="ts">
import {
  IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
} from '@ionic/vue';
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { useSecurityStore } from '@/stores/security';
import { useToast } from '@/composables/ui/useToast';
import PinKeypad from '@/components/PinKeypad.vue';

const router = useRouter();
const security = useSecurityStore();
const toast = useToast();
const { t } = useI18n();

const PIN_LENGTH = 4;

type Step = 'verify-current' | 'enter-new' | 'confirm-new';

const step = ref<Step>('enter-new');
const pin = ref('');
const newPin = ref('');
const errorMessage = ref('');
const shake = ref(false);
const busy = ref(false);

onMounted(() => {
  step.value = security.hasPin ? 'verify-current' : 'enter-new';
});

// Kullanıcı yeniden yazmaya başlayınca uyarı yolundan çekilsin (LockScreen ile aynı).
watch(pin, (value) => {
  if (value.length > 0) errorMessage.value = '';
});

const title = computed(() => {
  switch (step.value) {
    case 'verify-current': return t('security.pinSetup.currentTitle');
    case 'confirm-new': return t('security.pinSetup.confirmTitle');
    default: return t('security.pinSetup.newTitle');
  }
});

const subtitle = computed(() => {
  switch (step.value) {
    case 'verify-current': return t('security.pinSetup.currentSubtitle');
    case 'confirm-new': return t('security.pinSetup.confirmSubtitle');
    default: return t('security.pinSetup.newSubtitle');
  }
});

/** Hatayı göster, sars, ardından girişi temizleyip tekrar aç. */
const fail = (message: string) => {
  errorMessage.value = message;
  shake.value = true;
  busy.value = true;
  void Haptics.notification({ type: NotificationType.Error }).catch(() => {});

  setTimeout(() => {
    shake.value = false;
    pin.value = '';
    busy.value = false;
  }, 400);
};

/** Adımı ilerlet: girişi temizle, hatayı sıfırla. */
const advance = (next: Step) => {
  errorMessage.value = '';
  step.value = next;
  pin.value = '';
};

const handleComplete = async () => {
  if (busy.value) return;
  busy.value = true;

  try {
    if (step.value === 'verify-current') {
      const ok = await security.verifyPin(pin.value);
      if (!ok) return fail(t('security.pinSetup.wrongPin'));
      advance('enter-new');
      return;
    }

    if (step.value === 'enter-new') {
      newPin.value = pin.value;
      advance('confirm-new');
      return;
    }

    if (pin.value !== newPin.value) return fail(t('security.pinSetup.mismatch'));

    await security.setPin(newPin.value);
    void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    toast.success(t('security.pinSetup.updated'));
    router.back();
  } catch (e) {
    fail(e instanceof Error ? e.message : t('security.pinSetup.saveFailed'));
  } finally {
    // fail() kendi zamanlayıcısıyla bırakıyor; başarı yolunda burada serbest kalır.
    if (!shake.value) busy.value = false;
  }
};
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button text="" default-href="/settings/security" />
        </ion-buttons>
        <ion-title class="font-medium text-xl">{{ $t('pageTitles.pinSetup') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :scroll-y="false" class="pin-setup-content">
      <pin-keypad
          v-model="pin"
          :title="title"
          :subtitle="subtitle"
          :error="errorMessage"
          :length="PIN_LENGTH"
          :disabled="busy"
          :shake="shake"
          @complete="handleComplete"
      />
    </ion-content>
  </ion-page>
</template>

<style scoped>
.pin-setup-content {
  --background: var(--c-page);
}
</style>
