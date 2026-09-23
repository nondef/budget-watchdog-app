/** 1234567 -> "1.234.567" (yalnızca tam sayı; ondalıklı girdi için `decimal-input`) */
export function formatNumber(value: number, separator: string = '.'): string {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}
