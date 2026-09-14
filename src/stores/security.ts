import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { hashPin, verifyPinAgainst } from '@/infrastructure/services/pin-hasher';
import { authenticateBiometric, isBiometryAvailable as checkBiometryAvailable } from '@/infrastructure/services/biometric';
import { i18n } from '@/i18n';

const t = i18n.global.t;

const STORAGE_KEY = 'budget_watchdog_security_v1';

export interface SecuritySettings {
  biometricEnabled: boolean;
  pinHash: string | null;
  screenLock: boolean;
  autoLock: boolean;
  lockTimeoutMinutes: number;
  lastActiveAt: number;
  /** Ardışık hatalı PIN denemesi. Başarılı girişte sıfırlanır. */
  failedAttempts: number;
  /** Bu epoch ms'e kadar PIN girişi kabul edilmez (0 = kilit yok). */
  lockoutUntil: number;
}

const DEFAULTS: SecuritySettings = {
  biometricEnabled: false,
  pinHash: null,
  screenLock: false,
  autoLock: true,
  lockTimeoutMinutes: 5,
  lastActiveAt: Date.now(),
  failedAttempts: 0,
  lockoutUntil: 0,
};

/**
 * Kaçıncı hatadan sonra ne kadar beklenecek. Kademeli artış, kullanıcıyı
 * kalıcı olarak dışarıda bırakmadan kaba kuvveti pratikte imkânsız kılar.
 * Süreler Preferences'a yazılır — uygulamayı öldürüp açmak kilidi atlatmaz.
 */
const LOCKOUT_STEPS: { after: number; waitMs: number }[] = [
  { after: 5, waitMs: 30_000 },
  { after: 8, waitMs: 5 * 60_000 },
  { after: 11, waitMs: 30 * 60_000 },
];

export const useSecurityStore = defineStore('security', () => {
  const settings = ref<SecuritySettings>({ ...DEFAULTS });
  const initialized = ref(false);
  const isLocked = ref(false);

  const hasPin = computed(() => !!settings.value.pinHash);
  const requiresUnlock = computed(
    () => settings.value.screenLock && hasPin.value && isLocked.value
  );

  const persist = async () => {
    await Preferences.set({
      key: STORAGE_KEY,
      value: JSON.stringify(settings.value),
    });
  };

  const initialize = async () => {
    if (initialized.value) return;
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    if (value) {
      try {
        settings.value = { ...DEFAULTS, ...JSON.parse(value) };
      } catch {
        settings.value = { ...DEFAULTS };
      }
    }
    // Uygulama yeni açılıyor — ekran kilidi açıksa kilitli başla
    if (settings.value.screenLock && settings.value.pinHash) {
      isLocked.value = true;
    }
    initialized.value = true;
  };

  const setPin = async (pin: string) => {
    // Kilit ekranı tuş takımı tam 4 hanede doğruluyor; daha uzun PIN'e izin
    // vermek kullanıcıyı kalıcı olarak dışarıda bırakır.
    if (!/^\d{4}$/.test(pin)) {
      throw new Error(t('security.pinFormat'));
    }
    settings.value.pinHash = await hashPin(pin);
    settings.value.screenLock = true;
    settings.value.failedAttempts = 0;
    settings.value.lockoutUntil = 0;
    await persist();
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    if (!settings.value.pinHash) return false;

    // Kilitliyken doğrulama HİÇ çalıştırılmaz — aksi halde bekleme süresi
    // yalnızca kozmetik olur, saldırgan denemeye devam edebilirdi.
    if (Date.now() < settings.value.lockoutUntil) return false;

    const { valid, needsUpgrade } = await verifyPinAgainst(pin, settings.value.pinHash);

    if (!valid) {
      settings.value.failedAttempts += 1;

      const step = [...LOCKOUT_STEPS]
        .reverse()
        .find(s => settings.value.failedAttempts >= s.after);

      if (step) {
        settings.value.lockoutUntil = Date.now() + step.waitMs;
      }

      await persist();

      return false;
    }

    // Eski/zayıf parametrelerle doğrulandıysa şeffafça güncelle.
    if (needsUpgrade) {
      settings.value.pinHash = await hashPin(pin);
    }

    settings.value.failedAttempts = 0;
    settings.value.lockoutUntil = 0;
    await persist();

    return true;
  };

  /**
   * Kalan kilit süresi (ms). 0 → giriş serbest.
   *
   * Bilinçli olarak `computed` DEĞİL: tek reaktif bağımlılığı
   * `settings.lockoutUntil` ve o değer geri sayım boyunca sabit kalıyor.
   * `Date.now()` reaktif olmadığı için computed sonucu önbelleğe alınıyor ve
   * bir daha hesaplanmıyordu — ekranda süre görünüyor ama geri saymıyordu.
   * Düz fonksiyon her çağrıda yeniden hesaplar.
   */
  const lockoutRemainingMs = () => Math.max(0, settings.value.lockoutUntil - Date.now());

  const removePin = async () => {
    settings.value.pinHash = null;
    settings.value.screenLock = false;
    settings.value.biometricEnabled = false;
    settings.value.failedAttempts = 0;
    settings.value.lockoutUntil = 0;
    await persist();
  };

  const setScreenLock = async (enabled: boolean) => {
    settings.value.screenLock = enabled;
    if (!enabled) {
      settings.value.biometricEnabled = false;
    }
    await persist();
  };

  const setAutoLock = async (enabled: boolean) => {
    settings.value.autoLock = enabled;
    await persist();
  };

  const setLockTimeout = async (minutes: number) => {
    settings.value.lockTimeoutMinutes = minutes;
    await persist();
  };

  const setBiometric = async (enabled: boolean) => {
    if (enabled) {
      if (!settings.value.pinHash) {
        throw new Error(t('security.biometricNeedPin'));
      }
      if (!(await checkBiometryAvailable())) {
        throw new Error(t('security.biometricUnavailable'));
      }
      // Açarken bir kez doğrula — kullanıcının gerçekten kaydı olduğunu teyit et
      try {
        await authenticateBiometric(t('security.biometricPrompt.enableReason'));
      } catch {
        throw new Error(t('security.biometricFailed'));
      }
    }
    settings.value.biometricEnabled = enabled;
    await persist();
  };

  const markActive = async () => {
    settings.value.lastActiveAt = Date.now();
    await persist();
  };

  const lock = () => {
    if (settings.value.screenLock && settings.value.pinHash) {
      isLocked.value = true;
    }
  };

  const unlock = () => {
    isLocked.value = false;
    settings.value.lastActiveAt = Date.now();
    // bilinçli olarak persist'i fire-and-forget
    void persist();
  };

  const shouldAutoLock = (): boolean => {
    if (!settings.value.screenLock || !settings.value.pinHash) return false;
    if (!settings.value.autoLock) return false;
    const elapsedMs = Date.now() - settings.value.lastActiveAt;
    return elapsedMs >= settings.value.lockTimeoutMinutes * 60_000;
  };

  // Cihaz biyometrik destekliyor mu? (toggle'ı buna göre göster)
  const isBiometryAvailable = () => checkBiometryAvailable();

  // Biyometrikle kilidi aç — başarılıysa unlock + true, iptal/hata → false
  const tryBiometricUnlock = async (): Promise<boolean> => {
    if (!settings.value.biometricEnabled) return false;
    if (!Capacitor.isNativePlatform()) return false;
    try {
      await authenticateBiometric(t('security.biometricPrompt.unlockReason'));
      unlock();
      return true;
    } catch {
      return false;
    }
  };

  return {
    settings,
    initialized,
    isLocked,
    hasPin,
    requiresUnlock,
    lockoutRemainingMs,
    initialize,
    setPin,
    verifyPin,
    removePin,
    setScreenLock,
    setAutoLock,
    setLockTimeout,
    setBiometric,
    markActive,
    lock,
    unlock,
    shouldAutoLock,
    isBiometryAvailable,
    tryBiometricUnlock,
  };
});
