<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  alertController,
  IonItem,
  IonLabel,
  IonToggle
} from '@ionic/vue';
import {
  lockClosedOutline,
  fingerPrintOutline,
  eyeOutline,
  timeOutline,
  keyOutline
} from 'ionicons/icons';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { useSecurityStore } from '@/stores/security';
import { useToast } from '@/composables/ui/useToast';
import SubPageHeader from '@/components/SubPageHeader.vue';

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
  <ion-page class="design-page">
    <sub-page-header :title="$t('security.title')"/>

    <ion-content :fullscreen="true" class="sec-content" :scroll-y="true">
      <main class="mx-auto w-full max-w-xl space-y-6 px-4 pb-12 pt-5">
        <section class="security-hero flex items-start gap-4 rounded-[22px] p-5">
          <div class="hero-icon flex size-12 shrink-0 items-center justify-center rounded-2xl">
            <ion-icon :icon="lockClosedOutline" class="text-[22px]" />
          </div>
          <div class="min-w-0">
            <h2 class="text-[18px] font-extrabold text-content">{{ $t('security.appLock') }}</h2>
            <p class="mt-1 text-[12px] leading-relaxed text-content-muted">
              {{ $t('security.appLockDesc') }}
            </p>
          </div>
        </section>

        <!-- Uygulama Kilidi -->
        <section>
          <h2 class="section-label">{{ $t('security.accessControl') }}</h2>
          <div class="security-card overflow-hidden rounded-[18px]">
            <!-- Ekran kilidi -->
            <div class="security-row flex items-center gap-3 border-b border-line px-4 py-3">
              <div class="security-icon security-icon--primary">
                <ion-icon :icon="eyeOutline" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-bold text-content">{{ $t('security.screenLock') }}</p>
                <p class="text-[11px] text-content-muted mt-0.5">{{ $t('security.screenLockDesc') }}</p>
              </div>
              <ion-toggle
                  :checked="s.screenLock"
                  :aria-label="$t('security.screenLock')"
                  @ion-change="toggleScreenLock"
              />
            </div>

            <!-- PIN değiştir -->
            <ion-item
                class="security-item"
                lines="full"
                button
                detail
                :disabled="!s.screenLock"
                @click="navigateToPinSetup"
            >
              <div slot="start" class="security-icon security-icon--warning">
                <ion-icon :icon="keyOutline" />
              </div>
              <ion-label class="ion-text-wrap">
                <h3>{{ $t('security.pin') }}</h3>
                <p>
                  {{ security.hasPin ? $t('security.pinUpdate') : $t('security.pinSet') }}
                </p>
              </ion-label>
            </ion-item>

            <!-- Biyometrik (yalnızca cihaz destekliyorsa) -->
            <div
                v-if="biometryAvailable"
                class="security-row flex items-center gap-3 px-4 py-3 transition"
                :class="{ 'opacity-40 pointer-events-none': !s.screenLock || !security.hasPin }"
            >
              <div class="security-icon security-icon--violet">
                <ion-icon :icon="fingerPrintOutline" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-bold text-content">{{ biometricLabel }}</p>
                <p class="text-[11px] text-content-muted mt-0.5">{{ $t('security.biometricDesc') }}</p>
              </div>
              <ion-toggle
                  :checked="s.biometricEnabled"
                  :aria-label="biometricLabel"
                  @ion-change="toggleBiometric"
              />
            </div>
          </div>
        </section>

        <!-- Otomatik Kilit -->
        <section :class="{ 'opacity-40 pointer-events-none': !s.screenLock }">
          <h2 class="section-label">{{ $t('security.autoLock') }}</h2>
          <div class="security-card overflow-hidden rounded-[18px]">
            <div class="security-row flex items-center gap-3 px-4 py-3" :class="{ 'border-b border-line': s.autoLock }">
              <div class="security-icon security-icon--info">
                <ion-icon :icon="timeOutline" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-[14px] font-bold text-content">{{ $t('security.autoLock') }}</p>
                <p class="text-[11px] text-content-muted mt-0.5">{{ $t('security.autoLockDesc') }}</p>
              </div>
              <ion-toggle
                  :checked="s.autoLock"
                  :aria-label="$t('security.autoLock')"
                  @ion-change="toggleAutoLock"
              />
            </div>

            <div v-if="s.autoLock" class="px-4 py-3">
              <p class="text-[11px] text-content-muted mb-2">{{ $t('security.lockTimeout') }}</p>
              <div class="timeout-grid grid grid-cols-4 gap-1.5 rounded-xl p-1">
                <button
                    v-for="opt in timeoutOptions"
                    :key="opt"
                    type="button"
                    class="timeout-option rounded-lg py-2 text-[11px] font-bold transition"
                    :class="s.lockTimeoutMinutes === opt
                        ? 'timeout-option--active'
                        : 'text-content-tertiary'"
                    @click="setTimeout(opt)"
                >
                  {{ $t('security.minutes', { count: opt }) }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Bilgi -->
        <div class="security-note flex items-start gap-3 rounded-2xl p-3.5">
          <ion-icon :icon="lockClosedOutline" class="mt-0.5 shrink-0 text-[17px] text-content-muted" />
          <div class="flex-1">
            <p class="text-[11px] text-content-secondary leading-snug">
              {{ $t('security.infoNote') }}
            </p>
            <button
                type="button"
                class="mt-1 text-[11px] font-bold text-content underline decoration-content-faint underline-offset-2"
                @click="router.push('/settings/backup')"
            >
              {{ $t('security.resetApp') }}
            </button>
          </div>
        </div>
      </main>
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

.security-hero {
  background: linear-gradient(145deg, var(--c-surface) 0%, var(--c-surface-sunken) 100%);
  border: 1px solid var(--c-line);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--c-content) 8%, transparent);
}

.hero-icon,
.security-icon--primary {
  background: var(--c-primary);
  color: var(--c-on-primary);
}

.section-label {
  margin: 0 4px 9px;
  color: var(--c-content-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.security-card,
.security-note {
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  box-shadow: 0 5px 18px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.security-icon {
  display: flex;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 13px;
}

.security-icon ion-icon {
  font-size: 18px;
}

.security-icon--warning {
  background: color-mix(in srgb, #f59e0b 13%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, #f59e0b 25%, var(--c-line));
  color: #b45309;
}

.security-icon--violet {
  background: color-mix(in srgb, #7c3aed 11%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, #7c3aed 23%, var(--c-line));
  color: #7c3aed;
}

.security-icon--info {
  background: color-mix(in srgb, #0284c7 11%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, #0284c7 23%, var(--c-line));
  color: #0369a1;
}

.security-item {
  --background: transparent;
  --background-activated: var(--c-surface-sunken);
  --background-hover: transparent;
  --border-color: var(--c-line);
  --min-height: 64px;
  --padding-start: 14px;
  --inner-padding-end: 12px;
  --detail-icon-color: var(--c-content-muted);
}

.security-item h3 {
  color: var(--c-content);
  font-size: 14px;
  font-weight: 700;
}

.security-item p {
  margin-top: 3px;
  color: var(--c-content-muted);
  font-size: 11px;
}

.timeout-grid {
  background: var(--c-surface-sunken);
}

.timeout-option {
  color: var(--c-content-muted);
}

.timeout-option:active {
  background: var(--c-surface-strong);
}

.timeout-option--active {
  background: var(--c-primary);
  color: var(--c-on-primary);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--c-content) 16%, transparent);
}

:global(.ion-palette-dark) .security-icon--warning {
  color: #fcd34d;
}

:global(.ion-palette-dark) .security-icon--violet {
  color: #c4b5fd;
}

:global(.ion-palette-dark) .security-icon--info {
  color: #7dd3fc;
}
</style>
