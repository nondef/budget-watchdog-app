/**
 * Log seviyeleri — ağırlık sırasına göre.
 * debug < info < warn < error < fatal
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export const LEVEL_WEIGHT: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    fatal: 50,
};

/** Bir hatanın serileştirilebilir özeti (stack dahil). */
export interface SerializedError {
    name: string;
    message: string;
    stack?: string;
    code?: string;
}

/** Tek bir log kaydı. */
export interface LogEntry {
    id: string;
    timestamp: string; // ISO
    level: LogLevel;
    message: string;
    /** Kaynağı belirten kısa etiket: 'DB', 'FirstWallet', 'vue'... */
    context?: string;
    /** Yapısal ek veri. */
    data?: Record<string, unknown>;
    /** Varsa orijinal hata. */
    error?: SerializedError;
}

export interface LogOptions {
    context?: string;
    data?: Record<string, unknown>;
    error?: unknown;
}
