<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { useSecurityStore } from '@/stores/security';
import PinKeypad from '@/components/PinKeypad.vue';

const router = useRouter();
const route = useRoute();
const security = useSecurityStore();
const { t } = useI18n();

const PIN_LENGTH = 4;

const pin = ref('');
const shake = ref(false);
const verifying = ref(false);

// Kilit sayacı store'da kalıcı tutuluyor; burada yalnızca geri sayımı gösteriyoruz.
const lockoutSeconds = ref(0);
let lockoutTimer: number | undefined;

const isLockedOut = computed(() => lockoutSeconds.value > 0);

/**
 * "Yanlış PIN" uyarısı SON DENEMEYE ait, kalıcı duruma değil.
 *
 * Önce `settings.failedAttempts > 0` koşuluna bağlıydı; o sayaç kademeli
 * kilit süresi için bilinçli olarak kalıcı olduğundan, kilit dolup ekran
 * temizlendikten sonra bile uyarı ekranda asılı kalıyordu.
 */
const showWrongPin = ref(false);

const syncLockout = () => {
  const remaining = Math.ceil(security.lockoutRemainingMs() / 1000);

  // Kilit bu tick'te sona erdiyse temiz bir başlangıç ver.
  if (lockoutSeconds.value > 0 && remaining === 0) {
    showWrongPin.value = false;
  }

  lockoutSeconds.value = remaining;
};

const errorMessage = computed(() => {
  if (isLockedOut.value) {
    return t('security.lockScreen.lockedOut', { seconds: lockoutSeconds.value });
  }
  return showWrongPin.value ? t('security.lockScreen.wrongPin') : '';
});

// Kullanıcı yeniden yazmaya başlayınca uyarı yolundan çekilsin.
watch(pin, (value) => {
  if (value.length > 0) showWrongPin.value = false;
});

const goAfterUnlock = () => {
  const redirect = (route.query.redirect as string) || '/tabs/home';
  router.replace(redirect);
};

const verify = async () => {
  if (isLockedOut.value) return;

  verifying.value = true;

  const ok = await security.verifyPin(pin.value);

  if (ok) {
    security.unlock();
    void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    goAfterUnlock();
    return;
  }

  showWrongPin.value = true;
  syncLockout();
  shake.value = true;
  void Haptics.notification({ type: NotificationType.Error }).catch(() => {});

  setTimeout(() => {
    pin.value = '';
    shake.value = false;
    verifying.value = false;
  }, 400);
};

const tryBiometric = async () => {
  const ok = await security.tryBiometricUnlock();
  if (ok) goAfterUnlock();
};

onMounted(() => {
  if (!security.requiresUnlock) {
    goAfterUnlock();
    return;
  }

  syncLockout();
  lockoutTimer = window.setInterval(syncLockout, 1000);
  void tryBiometric();
});

onBeforeUnmount(() => {
  if (lockoutTimer) clearInterval(lockoutTimer);
});
</script>

<template>
  <ion-page>
    <ion-content :scroll-y="false" class="lock-content">
      <pin-keypad
          v-model="pin"
          :title="$t('security.lockScreen.title')"
          :subtitle="$t('security.lockScreen.subtitle')"
          :error="errorMessage"
          :length="PIN_LENGTH"
          :disabled="verifying || isLockedOut"
          :shake="shake"
          :biometric="security.settings.biometricEnabled"
          @complete="verify"
          @biometric="tryBiometric"
      />
    </ion-content>
  </ion-page>
</template>

<style scoped>
.lock-content {
  --background: var(--c-page);
}
</style>
