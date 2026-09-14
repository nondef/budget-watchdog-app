/**
 * Tarih biçimlendirme — saf, hiçbir üst katmana bağımlı değil.
 *
 * `locale` bilinçli olarak ZORUNLU: bu modül `shared/` altında ve i18n/stores/
 * plugins gibi üst katmanları import etmemeli. Aktif dili otomatik geçirmek
 * isteyen çağıran `@/i18n/format` içindeki sarmalayıcıları kullanır.
 */

/** "8 Haziran 2026" */
export function formatDate(date: Date, locale: string): string {
    return new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(date);
}

/** "8 Haz 2026" — liste/satır gibi dar alanlar için kısa ay adı. */
export function formatDateShort(date: Date, locale: string): string {
    return new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    }).format(date);
}
