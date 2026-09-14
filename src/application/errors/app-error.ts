export type ErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

export interface AppErrorOptions {
    /** Stabil hata kodu (örn. 'VALIDATION_ERROR', 'DB_ERROR'). */
    code?: string;
    severity?: ErrorSeverity;
    /** Orijinal/teknik hata — log'a yazılır, kullanıcıya gösterilmez. */
    cause?: unknown;
    /** Kaynak etiketi: 'FirstWallet', 'DB'... */
    context?: string;
    /** Yapısal ek veri (log'a gider). */
    data?: Record<string, unknown>;
}

/**
 * Kullanıcıya gösterilmeye uygun, normalize edilmiş hata.
 *
 * `userMessage` her zaman güvenlidir (ham SQL/stack içermez).
 * Teknik detay `cause` içinde taşınır ve yalnızca log'a yazılır.
 */
export class AppError extends Error {
    constructor(
        public readonly userMessage: string,
        public readonly options: AppErrorOptions = {},
    ) {
        super(options.code ? `${options.code}: ${userMessage}` : userMessage);
        this.name = 'AppError';
        Object.setPrototypeOf(this, AppError.prototype);
    }

    get code(): string {
        return this.options.code ?? 'UNKNOWN';
    }

    get severity(): ErrorSeverity {
        return this.options.severity ?? 'error';
    }

    get cause(): unknown {
        return this.options.cause;
    }

    get context(): string | undefined {
        return this.options.context;
    }
}
