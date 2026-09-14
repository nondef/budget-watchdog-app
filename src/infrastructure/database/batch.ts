/**
 * Tek `executeBatch` çağrısına konan azami statement sayısı.
 *
 * Native'de bütün set JSON olarak Capacitor köprüsünden geçiyor: binlerce
 * satırlık tek paket düşük RAM'li cihazlarda ANR/OOM demek. 500'lük dilimler
 * round-trip sayısını da makul tutar.
 *
 * Sabit ortak bir modülde duruyor çünkü aynı sınır iki ayrı yazma yolunda
 * geçerli — seeder ve yedek geri yükleme. Seeder'da uygulanmış, geri yüklemede
 * atlanmıştı: sonuç, bir yıllık veriyle yedek alan kullanıcının o yedeği
 * cihaz değiştirirken GERİ YÜKLEYEMEMESİydi. Kaybın en can yakan biçimi bu —
 * kullanıcı her şeyi doğru yapmışken.
 */
export const BATCH_CHUNK_SIZE = 500

/**
 * Okuma sayfası. Yazma tarafındaki gerekçenin aynısı: `SELECT *` ile bütün
 * tabloyu tek seferde köprüden geçirmek de aynı paketi ters yönde kurar.
 */
export const READ_PAGE_SIZE = 500

/** `items`'ı en fazla `size` uzunluğunda dilimlere böler. Boş dizi → boş sonuç. */
export function chunked<T>(items: readonly T[], size: number = BATCH_CHUNK_SIZE): T[][] {
    if (size < 1) throw new Error('chunk size must be at least 1')

    const chunks: T[][] = []

    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size))
    }

    return chunks
}
