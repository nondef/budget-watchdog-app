/**
 * Domain Exceptions
 *
 * Tüm domain (iş kuralı) hatalarının tek kaynağı.
 *
 * Tasarım ilkeleri:
 * - Her hatanın **stabil bir `code`'u** vardır (UI/log/telemetri buna göre dallanır,
 *   mesaj metnine göre değil).
 * - Base sınıf; `severity`, yapısal `details`, `context`, `cause` ve `timestamp`
 *   taşır → log ve hata izleme (Sentry vb.) için zengin bağlam.
 * - `toJSON()` ile güvenli, serileştirilebilir gösterim sağlar.
 * - Alt sınıflar geriye dönük uyumludur: `super(code, message)` çağrısı hâlâ geçerli;
 *   `options` (3. parametre) opsiyoneldir.
 */

export type DomainErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

/**
 * Stabil hata kodları.
 * String literal yerine bunu kullanmak yazım hatalarını önler ve otomatik
 * tamamlama sağlar. `normalizeError` içindeki Türkçe mesaj haritası bu kodlara dayanır.
 */
export const DomainErrorCode = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    ENTITY_NOT_FOUND: 'ENTITY_NOT_FOUND',
    ENTITY_ALREADY_EXISTS: 'ENTITY_ALREADY_EXISTS',
    INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
    CURRENCY_MISMATCH: 'CURRENCY_MISMATCH',
    ACCOUNT_LIMIT_EXCEEDED: 'ACCOUNT_LIMIT_EXCEEDED',
    ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
    ACCOUNT_IN_USE: 'ACCOUNT_IN_USE',
    BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
    BUDGET_INACTIVE: 'BUDGET_INACTIVE',
    BUDGET_PERIOD_ERROR: 'BUDGET_PERIOD_ERROR',
    INVALID_TRANSACTION_TYPE: 'INVALID_TRANSACTION_TYPE',
    TRANSFER_REQUIRES_DESTINATION: 'TRANSFER_REQUIRES_DESTINATION',
    TRANSFER_SAME_ACCOUNT: 'TRANSFER_SAME_ACCOUNT',
    TRANSFER_DESTINATION_AMOUNT_REQUIRED: 'TRANSFER_DESTINATION_AMOUNT_REQUIRED',
    SYSTEM_CATEGORY_ERROR: 'SYSTEM_CATEGORY_ERROR',
    CATEGORY_IN_USE: 'CATEGORY_IN_USE',
    SAVING_GOAL_INACTIVE: 'SAVING_GOAL_INACTIVE',
    SAVING_GOAL_COMPLETED: 'SAVING_GOAL_COMPLETED',
    NEGATIVE_AMOUNT: 'NEGATIVE_AMOUNT',
    ZERO_AMOUNT: 'ZERO_AMOUNT',
    DIVISION_BY_ZERO: 'DIVISION_BY_ZERO',
    BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
    OPERATION_NOT_ALLOWED: 'OPERATION_NOT_ALLOWED',
    CONCURRENCY_CONFLICT: 'CONCURRENCY_CONFLICT',
    STATE_NOT_INITIALIZED: 'STATE_NOT_INITIALIZED',
    EXCHANGE_RATES_UNAVAILABLE: 'EXCHANGE_RATES_UNAVAILABLE',
} as const;

export type DomainErrorCodeValue = (typeof DomainErrorCode)[keyof typeof DomainErrorCode];

export interface DomainExceptionOptions {
    /** Log/telemetri için yapısal ek veri (kullanıcıya gösterilmez). */
    details?: Record<string, unknown>;
    /** Önem derecesi. Varsayılan: 'error'. */
    severity?: DomainErrorSeverity;
    /** Hatanın çıktığı alan/etiket (örn. 'AccountAggregate', 'BudgetService'). */
    context?: string;
    /** Bu hataya sebep olan alt/orijinal hata (hata zincirleme). */
    cause?: unknown;
}

/** `toJSON()` çıktısının şekli — log ve hata izleme servisleri için. */
export interface SerializedDomainException {
    name: string;
    code: string;
    message: string;
    severity: DomainErrorSeverity;
    context?: string;
    details?: Record<string, unknown>;
    timestamp: string;
    stack?: string;
}

/**
 * Base Domain Exception — tüm domain hatalarının ortak atası.
 */
export abstract class DomainException extends Error {
    /** Stabil, makine-okunur hata kodu. */
    readonly code: string;
    /** UI/log önceliklendirmesi için önem derecesi. */
    readonly severity: DomainErrorSeverity;
    /** Yapısal ek veri — kullanıcıya gösterilmez, yalnızca log'a gider. */
    readonly details: Record<string, unknown>;
    /** Hatanın oluştuğu zaman (UTC). */
    readonly timestamp: Date;
    /** Hatanın çıktığı alan/etiket. Sonradan `withContext` ile de doldurulabilir. */
    context?: string;

    constructor(code: string, message: string, options: DomainExceptionOptions = {}) {
        // `cause` yalnızca verildiyse iletilir (temiz stack/serialize için).
        super(message, options.cause !== undefined ? { cause: options.cause } : undefined);

        this.name = new.target.name;
        this.code = code;
        this.severity = options.severity ?? 'error';
        this.details = options.details ?? {};
        this.context = options.context;
        this.timestamp = new Date();

        // instanceof kontrollerinin (transpile sonrası da) doğru çalışması için.
        Object.setPrototypeOf(this, new.target.prototype);

        // V8'de temiz stack trace (constructor'ın kendisini gizle).
        const capture = (Error as unknown as { captureStackTrace?: (t: object, c?: unknown) => void })
            .captureStackTrace;
        if (typeof capture === 'function') {
            capture(this, new.target);
        }
    }

    /** Bu hatanın belirli bir koda sahip olup olmadığını kontrol eder. */
    is(code: string): boolean {
        return this.code === code;
    }

    /** Bağlam etiketi ekler ve aynı örneği döndürür (zincirlenebilir). */
    withContext(context: string): this {
        this.context = context;
        return this;
    }

    /** Yapısal detay ekler (mevcutları korur) ve aynı örneği döndürür. */
    withDetails(details: Record<string, unknown>): this {
        Object.assign(this.details, details);
        return this;
    }

    /** Log/telemetri için güvenli, serileştirilebilir gösterim. */
    toJSON(): SerializedDomainException {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            severity: this.severity,
            context: this.context,
            details: Object.keys(this.details).length > 0 ? this.details : undefined,
            timestamp: this.timestamp.toISOString(),
            stack: this.stack,
        };
    }

    /** Herhangi bir değeri DomainException olarak daraltan type guard. */
    static isDomainException(err: unknown): err is DomainException {
        return err instanceof DomainException;
    }

    /** Değer, belirtilen koda sahip bir DomainException mi? */
    static hasCode(err: unknown, code: string): err is DomainException {
        return err instanceof DomainException && err.code === code;
    }

    /**
     * Bir arama/tanımlama kriterini normalize eder ve hem yapısal nesnesini hem
     * insan-okur metnini üretir. `this` kullanmaz; alt sınıfların `super()` çağrısı
     * öncesinde `message`/`details` kurmasında kullanılır.
     *
     * Normalize kuralları:
     * - `string` → `{ id }`
     * - `array`  → `{ ids }`
     * - nesne    → olduğu gibi
     * Metinde değeri nesne/array olan alanlar `JSON.stringify` ile yazılır
     * (`[object Object]` / `a,b` gibi bozuk çıktı olmaz).
     *
     * `protected static`: alt sınıflara açık, public API'ye sızmaz.
     */
    protected static describeCriteria(criteria: LookupCriteria): {
        criteria: Record<string, unknown>;
        text: string;
    } {
        const normalized: Record<string, unknown> =
            typeof criteria === 'string'
                ? { id: criteria }
                : Array.isArray(criteria)
                    ? { ids: criteria }
                    : criteria;

        const format = (value: unknown): string =>
            value !== null && typeof value === 'object'
                ? JSON.stringify(value)
                : `'${String(value)}'`;

        const text = Object.entries(normalized)
            .map(([key, value]) => `${key}=${format(value)}`)
            .join(', ');

        return { criteria: normalized, text };
    }
}

/**
 * Bir kaydın arandığı/tanımlandığı kriter. Üç biçim:
 * - `string`              → tek id (`'acc_1'` → `{ id: 'acc_1' }`)
 * - `unknown[]`           → id listesi (`['a','b']` → `{ ids: ['a','b'] }`)
 * - `Record<string, ...>` → isimli alanlar (`{ email }`, `{ userId, slug }`)
 */
export type LookupCriteria = string | unknown[] | Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/*  Validation                                                                */
/* -------------------------------------------------------------------------- */

export class ValidationException extends DomainException {
    constructor(message: string, public readonly field?: string) {
        super(DomainErrorCode.VALIDATION_ERROR, message, {
            severity: 'warning',
            details: field ? { field } : undefined,
        });
    }
}

export class RequiredFieldException extends ValidationException {
    constructor(fieldName: string) {
        super(`${fieldName} is required`, fieldName);
    }
}

export class InvalidValueException extends ValidationException {
    constructor(fieldName: string, reason: string) {
        super(`Invalid ${fieldName}: ${reason}`, fieldName);
    }
}

/* -------------------------------------------------------------------------- */
/*  Entity lifecycle                                                          */
/* -------------------------------------------------------------------------- */

export class EntityNotFoundException extends DomainException {
    /**
     * @param entityName  Aranan varlığın adı (ör. 'Account').
     * @param criteria    Bulunamama kriteri. String → `id`; nesne → çok alanlı arama.
     */
    constructor(entityName: string, criteria: LookupCriteria) {
        const { criteria: c, text } = DomainException.describeCriteria(criteria);
        super(DomainErrorCode.ENTITY_NOT_FOUND, `${entityName} not found (${text})`, {
            severity: 'warning',
            details: { entityName, criteria: c },
        });
    }
}

export class EntityAlreadyExistsException extends DomainException {
    /**
     * @param entityName  Varlığın adı (ör. 'Account').
     * @param criteria    Çakışan kayıt kriteri. String → `id`; nesne → çok alanlı.
     */
    constructor(entityName: string, criteria: LookupCriteria) {
        const { criteria: c, text } = DomainException.describeCriteria(criteria);
        super(DomainErrorCode.ENTITY_ALREADY_EXISTS, `${entityName} already exists (${text})`, {
            severity: 'warning',
            details: { entityName, criteria: c },
        });
    }
}

/**
 * Optimistic-locking / eşzamanlılık çakışması (aynı kayıt aynı anda güncellendi).
 */
export class ConcurrencyConflictException extends DomainException {
    constructor(entityName: string, criteria: LookupCriteria) {
        const { criteria: c, text } = DomainException.describeCriteria(criteria);
        super(DomainErrorCode.CONCURRENCY_CONFLICT, `${entityName} was modified concurrently (${text})`, {
            details: { entityName, criteria: c },
        });
    }
}

/**
 * Uygulama açılışında (bootstrap) her zaman var olması gereken bir singleton/
 * invariant kayıt yok. Bu "kullanıcı bir şey aradı bulunamadı" DEĞİLDİR —
 * bozuk/eksik sistem durumudur; bu yüzden `EntityNotFoundException` yerine bunu
 * kullan. Varsayılan önem: 'error' (kurtarılamazsa 'fatal' verilebilir).
 *
 * @example throw new StateNotInitializedException('AppSettings');
 */
export class StateNotInitializedException extends DomainException {
    constructor(stateName: string, severity: DomainErrorSeverity = 'error') {
        super(DomainErrorCode.STATE_NOT_INITIALIZED, `${stateName} is not initialized`, {
            severity,
            details: { stateName },
        });
    }
}

/* -------------------------------------------------------------------------- */
/*  Account                                                                   */
/* -------------------------------------------------------------------------- */

export class InsufficientBalanceException extends DomainException {
    constructor(accountId: string, required: number, available: number) {
        super(
            DomainErrorCode.INSUFFICIENT_BALANCE,
            `Insufficient balance in account ${accountId}. Required: ${required}, Available: ${available}`,
            { details: { accountId, required, available, shortfall: required - available } },
        );
    }
}

export class CurrencyMismatchException extends DomainException {
    constructor(expected: string, actual: string) {
        super(DomainErrorCode.CURRENCY_MISMATCH, `Currency mismatch: expected ${expected}, got ${actual}`, {
            details: { expected, actual },
        });
    }
}

export class AccountLimitExceededException extends DomainException {
    constructor(limit: number) {
        super(DomainErrorCode.ACCOUNT_LIMIT_EXCEEDED, `Account limit of ${limit} reached`, {
            severity: 'warning',
            details: { limit },
        });
    }
}

/**
 * Kendisine bağlı işlem/bütçe bulunan bir hesap silinmeye çalışıldı.
 *
 * Silinseydi bu kayıtların `accountId`'si öksüz kalır, geçmiş ve bakiye
 * geçmişi bozulurdu. Alternatif, hesabı pasife almaktır (`deactivate`).
 */
export class AccountInUseException extends DomainException {
    constructor(accountId: string, usage: { transactions: number; budgets: number; savingGoals?: number }) {
        const { criteria, text } = DomainException.describeCriteria(accountId);
        super(
            DomainErrorCode.ACCOUNT_IN_USE,
            `Account is in use and cannot be deleted (${text})`,
            {
                severity: 'warning',
                details: { entityName: 'Account', criteria, ...usage },
            },
        );
    }
}

export class AccountInactiveException extends DomainException {
    constructor(accountId: string) {
        const { criteria, text } = DomainException.describeCriteria(accountId);
        super(DomainErrorCode.ACCOUNT_INACTIVE, `Account is inactive (${text})`, {
            details: { entityName: 'Account', criteria },
        });
    }
}

/* -------------------------------------------------------------------------- */
/*  Budget                                                                    */
/* -------------------------------------------------------------------------- */

export class BudgetExceededException extends DomainException {
    constructor(budgetName: string, limit: number, spent: number) {
        super(
            DomainErrorCode.BUDGET_EXCEEDED,
            `Budget '${budgetName}' exceeded. Limit: ${limit}, Spent: ${spent}`,
            { severity: 'warning', details: { budgetName, limit, spent, overBy: spent - limit } },
        );
    }
}

export class BudgetInactiveException extends DomainException {
    constructor(budgetId: string) {
        const { criteria, text } = DomainException.describeCriteria(budgetId);
        super(DomainErrorCode.BUDGET_INACTIVE, `Budget is not active (${text})`, {
            details: { entityName: 'Budget', criteria },
        });
    }
}

export class BudgetPeriodException extends DomainException {
    constructor(message: string, details?: Record<string, unknown>) {
        super(DomainErrorCode.BUDGET_PERIOD_ERROR, message, { severity: 'warning', details });
    }
}

/* -------------------------------------------------------------------------- */
/*  Transaction                                                               */
/* -------------------------------------------------------------------------- */

export class InvalidTransactionTypeException extends DomainException {
    constructor(expectedType: string, actualType: string) {
        super(
            DomainErrorCode.INVALID_TRANSACTION_TYPE,
            `Expected transaction type '${expectedType}', got '${actualType}'`,
            { details: { expectedType, actualType } },
        );
    }
}

export class TransferRequiresDestinationException extends DomainException {
    constructor() {
        super(
            DomainErrorCode.TRANSFER_REQUIRES_DESTINATION,
            'Transfer transaction requires a destination account',
            { severity: 'warning' },
        );
    }
}

/**
 * Kaynak ve hedef hesabın aynı olduğu transfer.
 *
 * Yalnızca anlamsız değil, **tehlikeli**: aynı hesap iki ayrı entity örneği
 * olarak yüklenir (identity map yok), biri `withdraw` biri `deposit` uygular ve
 * ikisi de kaydedilince son yazan kazanır — hesapta yoktan tutar oluşur.
 */
export class TransferSameAccountException extends DomainException {
    constructor(accountId: string) {
        const { criteria, text } = DomainException.describeCriteria(accountId);
        super(
            DomainErrorCode.TRANSFER_SAME_ACCOUNT,
            `Transfer source and destination accounts must differ (${text})`,
            { severity: 'warning', details: { entityName: 'Account', criteria } },
        );
    }
}

/**
 * Kur dönüşümlü transferde hedef tutar verilmedi.
 *
 * Kaynak ve hedef hesap farklı para birimindeyse hedefe ne kadar yatacağı
 * `amount`'tan türetilemez (banka kuru değişkendir) — çağıran hedef tutarı
 * açıkça geçmeli.
 */
export class TransferDestinationAmountRequiredException extends DomainException {
    constructor() {
        super(
            DomainErrorCode.TRANSFER_DESTINATION_AMOUNT_REQUIRED,
            'Cross-currency transfer requires an explicit destination amount',
            { severity: 'warning' },
        );
    }
}

/* -------------------------------------------------------------------------- */
/*  Category                                                                  */
/* -------------------------------------------------------------------------- */

export class SystemCategoryException extends DomainException {
    constructor(action: string) {
        super(DomainErrorCode.SYSTEM_CATEGORY_ERROR, `Cannot ${action} system category`, {
            severity: 'warning',
            details: { action },
        });
    }
}

export class CategoryInUseException extends DomainException {
    constructor(categoryId: string) {
        const { criteria, text } = DomainException.describeCriteria(categoryId);
        super(DomainErrorCode.CATEGORY_IN_USE, `Category is in use and cannot be deleted (${text})`, {
            severity: 'warning',
            details: { entityName: 'Category', criteria },
        });
    }
}

/* -------------------------------------------------------------------------- */
/*  Saving goal                                                               */
/* -------------------------------------------------------------------------- */

export class SavingGoalInactiveException extends DomainException {
    constructor(goalId: string) {
        const { criteria, text } = DomainException.describeCriteria(goalId);
        super(DomainErrorCode.SAVING_GOAL_INACTIVE, `Saving goal is not active (${text})`, {
            details: { entityName: 'SavingGoal', criteria },
        });
    }
}

export class SavingGoalCompletedException extends DomainException {
    constructor(goalId: string) {
        const { criteria, text } = DomainException.describeCriteria(goalId);
        super(DomainErrorCode.SAVING_GOAL_COMPLETED, `Saving goal is already completed (${text})`, {
            severity: 'info',
            details: { entityName: 'SavingGoal', criteria },
        });
    }
}

/* -------------------------------------------------------------------------- */
/*  Amount / arithmetic                                                       */
/* -------------------------------------------------------------------------- */

export class NegativeAmountException extends DomainException {
    constructor(context: string) {
        super(DomainErrorCode.NEGATIVE_AMOUNT, `${context} amount must be positive`, {
            severity: 'warning',
            details: { context },
        });
    }
}

export class ZeroAmountException extends DomainException {
    constructor(context: string) {
        super(DomainErrorCode.ZERO_AMOUNT, `${context} amount cannot be zero`, {
            severity: 'warning',
            details: { context },
        });
    }
}

export class DivisionByZeroException extends DomainException {
    constructor() {
        super(DomainErrorCode.DIVISION_BY_ZERO, 'Cannot divide by zero');
    }
}

/* -------------------------------------------------------------------------- */
/*  Genel amaçlı iş kuralı hataları                                           */
/* -------------------------------------------------------------------------- */

/** Belirli bir sınıfı olmayan iş kuralı ihlalleri için genel hata. */
export class BusinessRuleViolationException extends DomainException {
    constructor(message: string, details?: Record<string, unknown>) {
        super(DomainErrorCode.BUSINESS_RULE_VIOLATION, message, { details });
    }
}

export class ExchangeRatesUnavailableException extends DomainException {
    constructor(currencyId: string, options?: { cause?: unknown }) {
        super(DomainErrorCode.EXCHANGE_RATES_UNAVAILABLE, `No exchange rates available for currency '${currencyId}'`, {
            severity: 'warning',
            details: { currencyId },
            cause: options?.cause,
        });
    }
}

/** Mevcut durumda izin verilmeyen bir işlem denendiğinde. */
export class OperationNotAllowedException extends DomainException {
    constructor(operation: string, reason: string) {
        super(DomainErrorCode.OPERATION_NOT_ALLOWED, `Operation '${operation}' not allowed: ${reason}`, {
            severity: 'warning',
            details: { operation, reason },
        });
    }
}
