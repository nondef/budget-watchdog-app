/** 1234567 -> "1.234.567" (yalnızca tam sayı; ondalıklı girdi için `decimal-input`) */
export function formatNumber(value: number, separator: string = '.'): string {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/** "1.234.567" -> 1234567; ayrıştırılamayan girdi 0 döner. */
export function parseFormattedNumber(value: string, separator: string = '.'): number {
    const regex = new RegExp(`\\${separator}`, 'g')
    const cleaned = value.replace(regex, '')

    return parseFloat(cleaned) || 0
}
