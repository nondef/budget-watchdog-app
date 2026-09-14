import { logger } from '@/infrastructure/logging';
import { AppError, normalizeError, type ErrorSeverity } from '@/application/errors';
import { i18n } from '@/i18n';
import { useToast } from './useToast';

interface HandleOptions {
    /** Kaynak etiketi: 'FirstWallet', 'AddTransaction'... Log'da görünür. */
    context?: string;
    /** Bilinmeyen hata için kullanıcıya gösterilecek özel mesaj. */
    fallback?: string;
    /** true ise toast gösterme, yalnızca logla. */
    silent?: boolean;
    /** Log'a eklenecek ek yapısal veri. */
    data?: Record<string, unknown>;
}

const SEVERITY_TO_COLOR: Record<ErrorSeverity, 'danger' | 'warning' | 'primary'> = {
    fatal: 'danger',
    error: 'danger',
    warning: 'warning',
    info: 'primary',
};

const SEVERITY_TO_LOG = {
    fatal: 'fatal',
    error: 'error',
    warning: 'warn',
    info: 'info',
} as const;

/**
 * Hata kodunu aktif dile çevirir. Öncelik:
 *   1. `errors.domain.<CODE>`  → dile özel spesifik mesaj
 *   2. çağıranın verdiği `fallback`
 *   3. `errors.domain._default` → dile özel generic mesaj
 *   4. `appErr.userMessage`     → i18n hiç yoksa son çare
 */
function resolveUserMessage(appErr: AppError, fallback?: string): string {
    const t = i18n.global.t;

    const key = `errors.domain.${appErr.code}`;
    const specific = t(key);
    if (specific !== key) return specific;

    if (fallback) return fallback;

    const defaultKey = 'errors.domain._default';
    const generic = t(defaultKey);
    return generic !== defaultKey ? generic : appErr.userMessage;
}

/**
 * Tek noktadan hata yönetimi.
 *
 * `handle`:
 *  1. Hatayı `AppError`'a normalize eder (ham detay sızmaz).
 *  2. Teknik detayı (cause + stack) logger'a yazar.
 *  3. Kullanıcıya temiz bir toast gösterir (silent değilse).
 *  4. Normalize edilmiş AppError'ı döndürür → inline gösterim için kullanılabilir.
 */
export function useErrorHandler() {
    const toast = useToast();

    function handle(err: unknown, opts: HandleOptions = {}): AppError {
        const appErr = normalizeError(err, opts.fallback);
        const userMessage = resolveUserMessage(appErr, opts.fallback);

        // Log'a teknik (İngilizce) domain mesajı + kod gider; kullanıcıya gösterilen
        // çevrilmiş metin değil.
        const technicalMessage = appErr.cause instanceof Error ? appErr.cause.message : appErr.message;
        logger.log(SEVERITY_TO_LOG[appErr.severity], technicalMessage, {
            context: opts.context ?? appErr.context,
            error: appErr.cause ?? appErr,
            data: { code: appErr.code, ...appErr.options.data, ...opts.data },
        });

        if (!opts.silent) {
            void toast.showToast({
                message: userMessage,
                color: SEVERITY_TO_COLOR[appErr.severity],
            });
        }

        return appErr;
    }

    return { handle };
}
