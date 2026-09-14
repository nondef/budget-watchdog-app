import { pbkdf2Sha256Hex, secureRandomHex } from './crypto';
import { logger } from '@/infrastructure/logging';

/**
 * Yedek dosyası şifreleme — parola tabanlı AES-256-GCM.
 *
 * Neden gerekli: yedek üretildiği anda cihazın koruma alanından ÇIKAR.
 * Documents herkese açık bir klasördür ve Share sheet dosyayı Drive/WhatsApp/
 * e-postaya gönderir. DB'yi SQLCipher ile şifrelemek, düz metin export'la
 * anlamsızlaşır — dosya tam bir finansal profil taşır.
 *
 * Anahtar uygulama PIN'inden TÜRETİLMEZ: 4 hane = 10.000 olasılık, çevrimdışı
 * saldırıya karşı değersiz; ayrıca PIN kaldırılabiliyor. Parola kullanıcıya ait
 * ve bağımsızdır.
 *
 * PBKDF2 turu unlock'takinden (200k) yüksek: yedek şifreleme kullanıcı
 * eyleminde bir kez çalışır, her açılışta değil — daha pahalı olması sorun
 * değil, zayıf parolayı savunmak için gerekli.
 */
export const BACKUP_KDF_ITERATIONS = 600_000;

export interface EncryptionEnvelope {
    kdf: {
        algorithm: 'PBKDF2-SHA256';
        iterations: number;
        /** hex */
        salt: string;
    };
    cipher: {
        algorithm: 'AES-GCM';
        /** hex, 12 bayt */
        iv: string;
    };
    /** base64(ciphertext + GCM tag) */
    payload: string;
}

/**
 * WebCrypto yoksa fırlatır. Beklenen tek durum güvensiz bağlam (http üzerinden
 * canlı-reload); native'de `https://localhost` güvenli sayıldığı için normalde
 * görülmemeli. Bu yüzden hangi koşulun tutmadığını da taşıyor — aksi halde
 * cihazda teşhis edilemiyor.
 */
export interface EncryptionContext {
    hasCrypto: boolean;
    hasSubtle: boolean;
    hasGetRandomValues: boolean;
    isSecureContext: boolean | 'n/a';
    origin: string;
}

export function readEncryptionContext(): EncryptionContext {
    const c = typeof crypto !== 'undefined' ? crypto : undefined;

    return {
        hasCrypto: !!c,
        hasSubtle: !!c?.subtle,
        hasGetRandomValues: typeof c?.getRandomValues === 'function',
        isSecureContext: typeof isSecureContext !== 'undefined' ? isSecureContext : 'n/a',
        origin: typeof location !== 'undefined' ? location.origin : 'n/a',
    };
}

/** Şifreli yedek bu ortamda üretilebilir mi? UI önceden sorabilsin diye ayrı. */
export function isEncryptionAvailable(): boolean {
    const ctx = readEncryptionContext();
    return ctx.hasSubtle && ctx.hasGetRandomValues;
}

export class EncryptionUnavailableError extends Error {
    readonly context: EncryptionContext;

    constructor(context: EncryptionContext = readEncryptionContext()) {
        super(
            'Web Crypto is unavailable in this context; encrypted backups require a secure context. ' +
            JSON.stringify(context)
        );
        this.name = 'EncryptionUnavailableError';
        this.context = context;
    }
}

/** Parola yanlış ya da dosya bozuk — ikisi GCM açısından ayırt edilemez. */
export class DecryptionFailedError extends Error {
    constructor() {
        super('Backup could not be decrypted with the given passphrase');
        this.name = 'DecryptionFailedError';
    }
}

function requireSubtle(): SubtleCrypto {
    // AES-GCM için saf-JS fallback YOK (PBKDF2'nin aksine).
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        const context = readEncryptionContext();
        logger.error('Şifreli yedek için WebCrypto bulunamadı', {
            context: 'backup-crypto',
            data: { ...context },
        });
        throw new EncryptionUnavailableError(context);
    }
    return crypto.subtle;
}

const hexToBytes = (hex: string) => {
    const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
};

const base64ToBytes = (b64: string) => {
    const binary = atob(b64);
    const out = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
};

async function deriveKey(passphrase: string, saltHex: string, iterations: number): Promise<CryptoKey> {
    const subtle = requireSubtle();
    // PBKDF2 çıktısı hex olarak alınır (mevcut, test edilmiş yol), ardından
    // ham anahtar olarak AES-GCM'e verilir.
    const keyHex = await pbkdf2Sha256Hex(passphrase, saltHex, iterations);

    return subtle.importKey('raw', hexToBytes(keyHex), { name: 'AES-GCM' }, false, [
        'encrypt',
        'decrypt',
    ]);
}

export async function encryptPayload(plaintext: string, passphrase: string): Promise<EncryptionEnvelope> {
    const subtle = requireSubtle();

    const salt = secureRandomHex(16);
    const iv = secureRandomHex(12);
    const key = await deriveKey(passphrase, salt, BACKUP_KDF_ITERATIONS);

    const ciphertext = await subtle.encrypt(
        { name: 'AES-GCM', iv: hexToBytes(iv) },
        key,
        new TextEncoder().encode(plaintext)
    );

    return {
        kdf: { algorithm: 'PBKDF2-SHA256', iterations: BACKUP_KDF_ITERATIONS, salt },
        cipher: { algorithm: 'AES-GCM', iv },
        payload: bytesToBase64(new Uint8Array(ciphertext)),
    };
}

export async function decryptPayload(envelope: EncryptionEnvelope, passphrase: string): Promise<string> {
    const subtle = requireSubtle();

    const { kdf, cipher, payload } = envelope;

    if (kdf?.algorithm !== 'PBKDF2-SHA256' || cipher?.algorithm !== 'AES-GCM') {
        throw new DecryptionFailedError();
    }

    const key = await deriveKey(passphrase, kdf.salt, kdf.iterations);

    try {
        const plaintext = await subtle.decrypt(
            { name: 'AES-GCM', iv: hexToBytes(cipher.iv) },
            key,
            base64ToBytes(payload)
        );

        return new TextDecoder().decode(plaintext);
    } catch {
        // GCM doğrulaması başarısız: yanlış parola ya da bozulmuş dosya.
        throw new DecryptionFailedError();
    }
}
