import { DomainException } from '@/domain/exceptions/domain.exception';
import { AppError } from './app-error';

/**
 * i18n bağımsız son-çare mesaj. Kullanıcıya gösterilen asıl metin
 * `useErrorHandler` içinde `errors.domain.<CODE>` anahtarıyla aktif dile çevrilir;
 * bu sabit yalnızca çeviri hiç yüklenmemişse devreye girer.
 */
export const DEFAULT_USER_MESSAGE = 'Bir şeyler ters gitti, lütfen tekrar dene.';

/**
 * Herhangi bir hatayı kullanıcıya gösterilebilir `AppError`'a normalize eder.
 *
 * - Zaten `AppError` ise olduğu gibi döner.
 * - `DomainException` ise **kodu** taşır (teknik mesaj sızmaz); kullanıcı metni
 *   presentation katmanında `code` → i18n ile üretilir.
 * - Bilinmeyen hatalar (SQLite, network, runtime) `UNKNOWN` kodu alır;
 *   ham detay `cause`'ta kalır ve yalnızca log'a yazılır.
 */
export function normalizeError(err: unknown, fallback: string = DEFAULT_USER_MESSAGE): AppError {
    if (err instanceof AppError) return err;

    if (err instanceof DomainException) {
        return new AppError(fallback, {
            code: err.code,
            // Severity artık hatanın kendisinden gelir (base sınıf taşır).
            severity: err.severity,
            context: err.context,
            data: Object.keys(err.details).length > 0 ? err.details : undefined,
            cause: err,
        });
    }

    return new AppError(fallback, {
        code: 'UNKNOWN',
        severity: 'error',
        cause: err,
    });
}
