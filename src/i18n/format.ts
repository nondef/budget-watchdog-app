import { i18n } from '@/i18n'
import { formatDate, formatDateShort, type TimeRange } from '@/shared/utils/date'

/**
 * i18n'e bağlı biçimlendirme.
 *
 * `shared/utils` saf kalsın diye locale/çeviri gerektiren her şey burada
 * toplanır: aktif dili buradaki sarmalayıcılar geçirir.
 */

/** Aktif dille "8 Haziran 2026" */
export function formatDateLocalized(date: Date): string {
    return formatDate(date, i18n.global.locale.value)
}

/** Aktif dille "8 Haz 2026" */
export function formatDateShortLocalized(date: Date): string {
    return formatDateShort(date, i18n.global.locale.value)
}

export function dateRangeText(range: TimeRange): string {
    const today = new Date()
    const t = i18n.global.t

    switch (range) {
        case 'today':
            return formatDateLocalized(today);
        case 'thisWeek':
            return t('dates.thisWeek');
        case 'thisMonth':
            return t('dates.thisMonth');
        case 'thisYear':
            return t('dates.thisYear');
        case 'allTime':
            return t('dates.allTime');
        default:
            return formatDateLocalized(today);
    }
}
