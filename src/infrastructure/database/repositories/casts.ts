import { Money } from '@/domain/value-objects/money';
import { Icon } from '@/domain/value-objects/icon';
import { DateRange } from '@/domain/value-objects/date-range';
import { Percentage } from '@/domain/value-objects/percentage';

/**
 * Bir entity property'sini DB row'da bir veya birden fazla kolona eşler.
 * Laravel'in `CastsAttributes`'ının TS karşılığı.
 *
 * - `columns` → cast'in okuduğu/yazdığı kolonlar.
 * - `get(row)` → row'un ilgili kolonlarından entity property değerini üretir.
 * - `set(value)` → property değerinden row'a yazılacak kolon-değer çiftlerini üretir.
 *
 * Birden fazla kolon (Money: amount + currency_id) tek bir property'ye
 * (`balance: Money`) eşlenebilir.
 *
 * `columns` zorunlu: BaseRepository bunu iki yerde kullanır — okuma yolunda
 * convention'ın tarih sezgisini cast'in sahip olduğu kolonda çalıştırmamak için,
 * yazma yolunda ise iki cast'in (ya da bir cast ile bir entity alanının) aynı
 * kolona farklı değer yazmasını yakalamak için. Eskiden `Object.assign` sırası
 * kazanıyordu ve kaybeden değer sessizce yok oluyordu.
 */
export type Cast<T> = {
    readonly columns: readonly string[];
    get(row: Record<string, any>): T;
    set(value: T): Record<string, any>;
};

/**
 * Cast'in beklediği kolon row'da hiç yoksa (projeksiyonlu SELECT, yanlış alias)
 * sessizce default üretmek yerine hata ver. NULL değer geçerlidir — burada
 * kontrol edilen, kolonun *varlığı*.
 */
function requireColumn(row: Record<string, any>, col: string, castName: string): void {
    if (!(col in row)) {
        throw new Error(`${castName}: '${col}' kolonu sorgu sonucunda yok.`);
    }
}

// ========== Built-in Casts ==========

export const MoneyCast = (
    amountCol: string,
    currencyCol: string,
    defaultCurrency = 'TRY',
    minorUnitCol?: string
): Cast<Money> => ({
    columns: minorUnitCol ? [amountCol, currencyCol, minorUnitCol] : [amountCol, currencyCol],
    get: (row) => {
        requireColumn(row, amountCol, 'MoneyCast');
        requireColumn(row, currencyCol, 'MoneyCast');

        return Money.create(
            row[amountCol] ?? 0,
            row[currencyCol] ?? defaultCurrency,
            minorUnitCol ? (row[minorUnitCol] ?? 2) : 2
        );
    },
    set: (v) => ({
        [amountCol]: v?.amount ?? 0,
        [currencyCol]: v?.currencyId ?? null,
        ...(minorUnitCol ? { [minorUnitCol]: v?.minorUnit ?? 2 } : {}),
    }),
});

/**
 * Money gibi ama opsiyonel: tutar kolonu NULL ise `undefined` döner (kolon 0
 * varsaymaz). Transfer'in hedef bacağı gibi yalnızca bazı satırlarda dolu olan
 * para alanları için — transfer olmayan işlemlerde `to_amount` NULL'dır ve
 * `undefined`'a hydrate edilir.
 */
export const OptionalMoneyCast = (
    amountCol: string,
    currencyCol: string,
    minorUnitCol: string
): Cast<Money | undefined> => ({
    columns: [amountCol, currencyCol, minorUnitCol],
    get: (row) => {
        const rawAmount = row[amountCol];
        const rawCurrency = row[currencyCol];
        if (rawAmount == null || rawCurrency == null) {
            return undefined;
        }
        return Money.create(rawAmount, rawCurrency, row[minorUnitCol] ?? 2);
    },
    set: (v) => ({
        [amountCol]: v ? v.amount : null,
        [currencyCol]: v ? v.currencyId : null,
        [minorUnitCol]: v ? v.minorUnit : null,
    }),
});

export const IconCast = (
    nameCol: string,
    colorCol: string,
    defaults: { name?: string; color?: string } = {}
): Cast<Icon> => ({
    columns: [nameCol, colorCol],
    get: (row) => {
        requireColumn(row, nameCol, 'IconCast');
        requireColumn(row, colorCol, 'IconCast');

        return Icon.create(
            row[nameCol] ?? defaults.name ?? 'wallet-outline',
            row[colorCol] ?? defaults.color ?? 'bg-gray-500'
        );
    },
    set: (v) => ({
        [nameCol]: v?.name ?? null,
        [colorCol]: v?.color ?? null,
    }),
});

export const DateRangeCast = (
    startCol: string,
    endCol: string
): Cast<DateRange> => ({
    columns: [startCol, endCol],
    // `new Date(...)` yerine `parseDate`: hem SQLite'ın zaman dilimi eki olmayan
    // 'YYYY-MM-DD HH:MM:SS' formatını UTC olarak normalize eder, hem de geçersiz
    // değerde sessizce `Invalid Date` üretmek yerine hata verir.
    get: (row) => DateRange.create(
        parseDate(row[startCol], startCol),
        row[endCol] ? parseDate(row[endCol], endCol) : undefined
    ),
    set: (v) => ({
        [startCol]: v?.startDate?.toISOString() ?? null,
        [endCol]: v?.endDate ? v.endDate.toISOString() : null,
    }),
});

export const PercentageCast = (
    col: string,
    defaultValue = 0
): Cast<Percentage> => ({
    columns: [col],
    get: (row) => {
        requireColumn(row, col, 'PercentageCast');
        return Percentage.create(row[col] ?? defaultValue);
    },
    set: (v) => ({ [col]: v?.value ?? defaultValue }),
});

export const BooleanCast = (
    col: string,
    defaultValue = false
): Cast<boolean> => ({
    columns: [col],
    get: (row) => {
        requireColumn(row, col, 'BooleanCast');
        return row[col] != null ? Boolean(row[col]) : defaultValue;
    },
    set: (v) => ({ [col]: v ? 1 : 0 }),
});

export const OptionalDateCast = (col: string): Cast<Date | undefined> => ({
    columns: [col],
    get: (row) => row[col] ? parseDate(row[col], col) : undefined,
    set: (v) => ({ [col]: v ? v.toISOString() : null }),
});

/**
 * Zorunlu tarih alanı. Convention tabanlı `*At` / `*Date` sezgisinin
 * yakalayamadığı `period_start` gibi kolonlar için açık cast kullanılır.
 */
export const DateCast = (col: string): Cast<Date> => ({
    columns: [col],
    get: (row) => parseDate(row[col], col),
    set: (v) => ({ [col]: parseDate(v, col).toISOString() }),
});

/** SQLite `CURRENT_TIMESTAMP` çıktısı: 'YYYY-MM-DD HH:MM:SS' (UTC, ek yok). */
const SQLITE_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;

export function parseDate(value: unknown, field: string): Date {
    const date = value instanceof Date
        ? new Date(value.getTime())
        : new Date(normalizeDateString(String(value)));

    if (!Number.isFinite(date.getTime())) {
        throw new Error(`Invalid date value for '${field}'`);
    }

    return date;
}

/**
 * Repository ISO 8601 (`...T...Z`) yazar, ama `DEFAULT CURRENT_TIMESTAMP`'e düşen
 * satırlar 'YYYY-MM-DD HH:MM:SS' formatında olur. JS bu formatı zaman dilimi eki
 * olmadığı için yerel saat sayabiliyor ve tarih kayıyordu — UTC olarak normalize et.
 */
function normalizeDateString(raw: string): string {
    return SQLITE_TIMESTAMP.test(raw) ? `${raw.replace(' ', 'T')}Z` : raw;
}

/**
 * Tek kolonu farklı bir property adıyla eşler.
 * Convention'ın yakalayamadığı isim eşleşmeleri için (örn. `user_email_address` → `email`).
 */
export const AliasCast = (col: string): Cast<any> => ({
    columns: [col],
    get: (row) => row[col],
    set: (v) => ({ [col]: v ?? null }),
});

/**
 * Enum/VO-from-string için sarmalayıcı: ham değeri factory'den geçirir, instance'tan değer çıkarır.
 *
 * Ör:
 *   theme: WrappedCast('theme', Theme.from, (v: Theme) => v.value, 'system')
 */
export const WrappedCast = <T>(
    col: string,
    fromValue: (raw: any) => T,
    toValue: (instance: T) => any,
    defaultValue?: any
): Cast<T> => ({
    columns: [col],
    get: (row) => fromValue(row[col] ?? defaultValue),
    set: (v) => ({ [col]: toValue(v) }),
});
