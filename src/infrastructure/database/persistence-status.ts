import { computed, ref } from 'vue';
import {
    classifyPersistenceError,
    isRetryableFailure,
    MigrationFailedError,
    SchemaTooNewError,
    type PersistenceFailureKind,
} from './errors';

/**
 * Kalıcı durum kurulumunun (DB → repository → seeder) son hatası.
 *
 * Neden ayrı bir modül: bu bilgiyi yazan (main.ts açılış akışı) ile okuyanlar
 * (router guard, kurtarma ekranı) birbirini tanımıyor ve Pinia bu noktada
 * henüz kurulmamış olabiliyor — hata `createApp` çağrılmadan da oluşabilir.
 * Bu yüzden düz bir reaktif modül; store değil.
 */
export interface PersistenceFailure {
    kind: PersistenceFailureKind;
    /** Kullanıcıya gösterilecek TEKNİK detay (i18n'siz): hata adı + mesaj. */
    detail: string;
    /** Migration hatasında takılan sürüm — destek için tek en değerli bilgi. */
    migration?: { version: number; name: string };
    /**
     * `schema-too-new` hatasında diskteki ve desteklenen şema sürümü.
     *
     * Kullanıcıya da gösterilir: "uygulamayı güncelle" tavsiyesinin somut
     * karşılığı bu iki sayı, ve destek tarafında hangi build'in geride
     * kaldığını tek bakışta söyler.
     */
    schema?: { onDisk: number; supported: number };
    /** Bu tür yeniden denemekle düzelebilir mi. */
    retryable: boolean;
    at: string;
}

const failure = ref<PersistenceFailure | null>(null);

export const persistenceFailure = computed(() => failure.value);

/**
 * Kurtarma ekranına yönlendirilmeli mi.
 *
 * Yeniden denenebilir hatalar burada `false` kalır: onlar için açılış akışı
 * arka planda denemeye devam ediyor ve kullanıcıyı korkutmaya gerek yok.
 * Denemeler tükenince `markPersistenceFailureFatal()` bayrağı kaldırır.
 */
export const requiresRecovery = computed(
    () => failure.value !== null && !failure.value.retryable,
);

/** Hata zincirini tek satıra indirger: "Name: message ← Name: message". */
function describe(error: unknown, depth = 0): string {
    if (depth > 3 || error == null) return '';

    if (error instanceof Error) {
        const head = `${error.name}: ${error.message}`;
        const causeText = describe((error as { cause?: unknown }).cause, depth + 1);
        return causeText ? `${head} ← ${causeText}` : head;
    }

    return String(error);
}

export function reportPersistenceFailure(error: unknown): PersistenceFailure {
    const kind = classifyPersistenceError(error);

    const next: PersistenceFailure = {
        kind,
        detail: describe(error) || 'Unknown persistence error',
        migration: error instanceof MigrationFailedError
            ? { version: error.version, name: error.migrationName }
            : undefined,
        schema: error instanceof SchemaTooNewError
            ? { onDisk: error.onDiskVersion, supported: error.supportedVersion }
            : undefined,
        retryable: isRetryableFailure(kind),
        at: new Date().toISOString(),
    };

    failure.value = next;

    return next;
}

/**
 * Yeniden denemeler tükendi: hata artık geçici sayılmaz.
 *
 * Ayrı bir çağrı olması bilinçli — `unknown` bir hatayı ilk görüşte kalıcı ilan
 * etmek, soğuk açılışta ara sıra patlayan ilk SQLite sorguları yüzünden
 * kullanıcıyı gereksiz yere kurtarma ekranına atardı.
 */
export function markPersistenceFailureFatal(): void {
    if (failure.value) {
        failure.value = { ...failure.value, retryable: false };
    }
}

export function clearPersistenceFailure(): void {
    failure.value = null;
}
