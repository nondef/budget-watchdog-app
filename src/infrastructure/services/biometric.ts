import { Capacitor } from '@capacitor/core';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { i18n } from '@/i18n';

// Biyometrik plugin'i (parmak izi / yüz) izole eden ince sarmalayıcı.
// Plugin yalnızca native platformda anlamlıdır; web/SSR'de no-op döner.
// Vue dışı kod olduğundan i18n global instance üzerinden çevrilir.

export async function isBiometryAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const info = await BiometricAuth.checkBiometry();
    return info.isAvailable;
  } catch {
    return false;
  }
}

// Başarılı doğrulamada resolve eder; iptal/başarısızlıkta hata fırlatır.
export async function authenticateBiometric(reason: string): Promise<void> {
  const t = i18n.global.t;
  await BiometricAuth.authenticate({
    reason,
    cancelTitle: t('security.biometricPrompt.cancel'),
    allowDeviceCredential: false,
    androidTitle: t('security.biometricPrompt.androidTitle'),
    androidSubtitle: t('security.biometricPrompt.androidSubtitle'),
  });
}
