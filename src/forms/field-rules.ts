/**
 * Form şemaları arasında paylaşılan alan kuralları.
 *
 * Aynı sınırın iki dosyada ayrı ayrı yazılması, biri değiştiğinde diğerinin
 * sessizce geride kalmasına yol açıyordu; tek kaynak burası.
 */

/** Tutar alanlarının üst sınırı (DB'deki DECIMAL genişliğiyle uyumlu). */
export const MAX_AMOUNT = 999_999_999_999.99

/** Metin uzunluk sınırları. */
export const MAX_NAME_LENGTH = 50
export const MAX_NOTE_LENGTH = 200

/**
 * Boş input'u `undefined`'a çevirir; böylece yup "sayı olmalı" yerine
 * "zorunlu" mesajını verir. `yup.number().transform(...)` ile kullanılır.
 */
export const emptyToUndefined = (value: unknown, original: unknown) =>
    original === '' || original === null || original === undefined ? undefined : value
