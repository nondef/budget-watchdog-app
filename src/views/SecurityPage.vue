<script setup lang="ts">
import {
  IonPage, IonContent, IonIcon,
  alertController, IonToolbar, IonHeader, IonBackButton, IonTitle, IonButtons,
} from '@ionic/vue';
import {
  lockClosedOutline, fingerPrintOutline, eyeOutline, timeOutline,
  chevronForwardOutline, keyOutline, chevronBackOutline,
} from 'ionicons/icons';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { useSecurityStore } from '@/stores/security';
import { useToast } from '@/composables/ui/useToast';

const router = useRouter();
const security = useSecurityStore();
const toast = useToast();
const { t } = useI18n();

const s = computed(() => security.settings);

const biometricLabel = computed(() => {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return 'Face ID / Touch ID';
  return t('security.biometric');
});

const haptic = () => Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});

const biometryAvailable = ref(false);

onMounted(async () => {
  await security.initialize();
  biometryAvailable.value = await security.isBiometryAvailable();
});

const navigateToPinSetup = () => router.push('/settings/security/pin');

const toggleScreenLock = async () => {
  const enabled = !s.value.screenLock
  haptic();

  if (enabled && !security.hasPin) {
    router.push('/settings/security/pin');
    return;
  }

  if (!enabled && security.hasPin) {
    const alert = await alertController.create({
      header: t('security.disableScreenLockTitle'),
      message: t('security.disableScreenLockMsg'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('security.disable'),
          role: 'destructive',
          handler: async () => {
            await security.removePin();
            toast.success(t('security.screenLockDisabled'));
          },
        },
      ],
    });
    await alert.present();
    return;
  }

  await security.setScreenLock(enabled);
};

const toggleBiometric = async () => {
  const enabled = !s.value.biometricEnabled
  haptic();

  if (enabled && !security.hasPin) {
    toast.warning(t('security.setPinFirst'));
    return;
  }

  try {
    await security.setBiometric(enabled);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : t('security.biometricError'));
  }
};

const toggleAutoLock = async () => {
  haptic();
  await security.setAutoLock(!s.value.autoLock);
};

const timeoutOptions = [1, 5, 10, 30]

const setTimeout = async (value: number) => {
  await security.setLockTimeout(value);
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
          {{ $t('security.title') }}
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="sec-content" :scroll-y="true">
      <div class="px-4">
        <!-- Açıklama -->
        <div class="mt-5 px-1">
          <h2 class="text-[18px] font-bold text-content">{{ $t('security.appLock') }}</h2>
          <p class="text-[12px] text-content-muted mt-1 leading-snug">
            {{ $t('security.appLockDesc') }}
          </p>
        </div>
      </div>

      <div class="mt-5 px-4 pb-10 space-y-5">

        <!-- Uygulama Kilidi -->
        <section>
          <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-2 px-1">
            {{ $t('security.accessControl') }}
          </p>
          <div class="bg-surface rounded-2xl">
            <!-- Ekran kilidi -->
            <div class="px-4 py-3 flex items-center gap-3 border-b border-line">
              <div class="size-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <ion-icon :icon="eyeOutline" class="size-[16px] text-indigo-600" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-medium text-content">{{ $t('security.screenLock') }}</p>
                <p class="text-[11px] text-content-muted mt-0.5">{{ $t('security.screenLockDesc') }}</p>
              </div>
              <button
                  type="button"
                  class="relative w-11 h-6 rounded-full transition shrink-0"
                  :class="s.screenLock ? 'bg-indigo-600' : 'bg-surface-strong'"
                  @click="toggleScreenLock"
              >
                <span
                    class="absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all"
                    :class="s.screenLock ? 'left-[22px]' : 'left-0.5'"
                />
              </button>
            </div>

            <!-- PIN değiştir -->
            <button
                type="button"
                class="w-full px-4 py-3 flex items-center gap-3 border-b border-line active:bg-surface-sunken transition disabled:opacity-40"
                :disabled="!s.screenLock"
                @click="navigateToPinSetup"
            >
              <div class="size-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <ion-icon :icon="keyOutline" class="size-[16px] text-amber-600" />
              </div>
              <div class="flex-1 text-left min-w-0">
                <p class="text-[14px] font-medium text-content">{{ $t('security.pin') }}</p>
                <p class="text-[11px] text-content-muted mt-0.5">
                  {{ security.hasPin ? $t('security.pinUpdate') : $t('security.pinSet') }}
                </p>
              </div>
              <ion-icon :icon="chevronForwardOutline" class="size-4 text-slate-400 shrink-0" />
            </button>

            <!-- Biyometrik (yalnızca cihaz destekliyorsa) -->
            <div
                v-if="biometryAvailable"
                class="px-4 py-3 flex items-center gap-3 transition"
                :class="{ 'opacity-40 pointer-events-none': !s.screenLock || !security.hasPin }"
            >
              <div class="size-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                <ion-icon :icon="fingerPrintOutline" class="size-[16px] text-violet-600" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-medium text-content">{{ biometricLabel }}</p>
                <p class="text-[11px] text-content-muted mt-0.5">{{ $t('security.biometricDesc') }}</p>
              </div>
              <button
                  type="button"
                  class="relative w-11 h-6 rounded-full transition shrink-0"
                  :class="s.biometricEnabled ? 'bg-indigo-600' : 'bg-surface-strong'"
                  @click="toggleBiometric"
              >
                <span
                    class="absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all"
                    :class="s.biometricEnabled ? 'left-[22px]' : 'left-0.5'"
                />
              </button>
            </div>
          </div>
        </section>

        <!-- Otomatik Kilit -->
        <section :class="{ 'opacity-40 pointer-events-none': !s.screenLock }">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-2 px-1">
            {{ $t('security.autoLock') }}
          </p>
          <div class="bg-surface rounded-2xl">
            <div class="px-4 py-3 flex items-center gap-3" :class="{ 'border-b border-line': s.autoLock }">
              <div class="size-9 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                <ion-icon :icon="timeOutline" class="size-[16px] text-sky-600" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-medium text-content">{{ $t('security.autoLock') }}</p>
                <p class="text-[11px] text-content-muted mt-0.5">{{ $t('security.autoLockDesc') }}</p>
              </div>
              <button
                  type="button"
                  class="relative w-11 h-6 rounded-full transition shrink-0"
                  :class="s.autoLock ? 'bg-indigo-600' : 'bg-surface-strong'"
                  @click="toggleAutoLock"
              >
                <span
                    class="absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all"
                    :class="s.autoLock ? 'left-[22px]' : 'left-0.5'"
                />
              </button>
            </div>

            <div v-if="s.autoLock" class="px-4 py-3">
              <p class="text-[11px] text-content-muted mb-2">{{ $t('security.lockTimeout') }}</p>
              <div class="grid grid-cols-4 gap-1.5">
                <button
                    v-for="opt in timeoutOptions"
                    :key="opt"
                    type="button"
                    class="py-2 rounded-xl text-[11px] font-semibold transition"
                    :class="s.lockTimeoutMinutes === opt
                        ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                        : 'bg-surface-sunken text-content-tertiary active:bg-surface-strong'"
                    @click="setTimeout(opt)"
                >
                  {{ $t('security.minutes', { count: opt }) }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Bilgi -->
        <div class="bg-surface rounded-2xl px-3 py-3 flex items-start gap-2">
          <ion-icon :icon="lockClosedOutline" class="size-[16px] text-indigo-500 mt-0.5 shrink-0" />
          <div class="flex-1">
            <p class="text-[11px] text-content-secondary leading-snug">
              {{ $t('security.infoNote') }}
            </p>
            <button
                type="button"
                class="text-[11px] font-semibold text-indigo-600 mt-1 active:text-indigo-800"
                @click="router.push('/settings/backup')"
            >
              {{ $t('security.resetApp') }}
            </button>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.sec-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}
</style>
