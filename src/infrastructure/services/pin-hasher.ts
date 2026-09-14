import { Preferences } from '@capacitor/preferences';
import { pbkdf2Sha256Hex, randomHex, sha256Hex, timingSafeEqualHex } from '@/shared/utils/crypto/crypto';

// Salt kalıcılığı (Preferences) + PIN hash politikası. Saf kripto primitifleri
// için bkz. @/shared/utils/crypto.

const SALT_KEY = 'budget_watchdog_security_salt_v1';

/**
 * Yüksek tur sayısı, 4 haneli PIN'in küçük arama uzayını (10.000) telafi eder.
 * Cihazda tek doğrulama ~150-300 ms sürer; çevrimdışı kaba kuvvet ise saatler
 * mertebesine çıkar. Not: bu, kısa PIN'i güvenli YAPMAZ, yalnızca saldırı
 * maliyetini yükseltir — asıl koruma kilit ekranındaki deneme sınırıdır.
 */
const PBKDF2_ITERATIONS = 200_000;

/** `pbkdf2$sha256$<tur>$<hex>` — algoritma değişince eski hash'ler tanınsın. */
const PREFIX = 'pbkdf2$sha256';

async function getSalt(): Promise<string> {
  const { value } = await Preferences.get({ key: SALT_KEY });
  if (value) return value;
  const salt = randomHex(16);
  await Preferences.set({ key: SALT_KEY, value: salt });
  return salt;
}

export async function hashPin(pin: string): Promise<string> {
  const salt = await getSalt();
  const digest = await pbkdf2Sha256Hex(`${salt}:${pin}`, salt, PBKDF2_ITERATIONS);
  return `${PREFIX}$${PBKDF2_ITERATIONS}$${digest}`;
}

export interface PinVerification {
  valid: boolean;
  /** Eski/zayıf parametrelerle doğrulandı — çağıran taraf yeniden hash'lemeli. */
  needsUpgrade: boolean;
}

export async function verifyPinAgainst(pin: string, stored: string): Promise<PinVerification> {
  const salt = await getSalt();

  if (stored.startsWith(`${PREFIX}$`)) {
    const [, , iterationsRaw, digest] = stored.split('$');
    const iterations = Number(iterationsRaw);

    if (!Number.isInteger(iterations) || iterations <= 0 || !digest) {
      return { valid: false, needsUpgrade: false };
    }

    const candidate = await pbkdf2Sha256Hex(`${salt}:${pin}`, salt, iterations);

    return {
      valid: timingSafeEqualHex(candidate, digest),
      // Tur sayısını ileride arttırırsak eski kayıtlar sessizce yükseltilir.
      needsUpgrade: iterations < PBKDF2_ITERATIONS,
    };
  }

  // Eski format: salt'lı tek tur SHA-256, düz hex.
  const legacy = await sha256Hex(new TextEncoder().encode(`${salt}:${pin}`));

  return { valid: timingSafeEqualHex(legacy, stored), needsUpgrade: true };
}
