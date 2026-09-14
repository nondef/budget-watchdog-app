import { Capacitor } from '@capacitor/core';
import { uuid } from '@/shared/utils/id/uuid';
import { LEVEL_WEIGHT, type LogEntry, type LogLevel, type LogOptions, type SerializedError } from './types';

/** %c CSS stillemesi yalnızca tarayıcı DevTools'unda anlamlı; native Logcat ham basar. */
const CONSOLE_SUPPORTS_CSS = !Capacitor.isNativePlatform();

type Subscriber = (entry: LogEntry) => void;
type ConsoleMode = 'auto' | 'on' | 'off';

/** .env (VITE_LOG_*) okunur; geçersiz/boş değerler güvenli varsayılana düşer. */
const ENV = import.meta.env;

function parseLevel(value: string | undefined): LogLevel | undefined {
    const v = value?.trim().toLowerCase();
    return v && v in LEVEL_WEIGHT ? (v as LogLevel) : undefined;
}

function parseConsoleMode(value: string | undefined): ConsoleMode {
    const v = value?.trim().toLowerCase();
    return v === 'on' || v === 'off' ? v : 'auto';
}

/** Bilinmeyen bir değeri serileştirilebilir hata özetine çevirir. */
function serializeError(err: unknown): SerializedError | undefined {
    if (err == null) return undefined;
    if (err instanceof Error) {
        const code = 'code' in err ? String(err.code) : undefined;
        return {
            name: err.name,
            message: err.message,
            stack: err.stack,
            code,
        };
    }
    return { name: 'NonError', message: String(err) };
}

/**
 * Merkezi Logger.
 * - Tüm loglar tek bir ring-buffer'da toplanır (debug → fatal).
 * - Konsola yazar (dev'de renkli/okunaklı).
 * - `persistFromLevel` ve üstü kayıtlar localStorage'a yazılır → reload/crash sonrası
 *   mobilde bile incelenebilir.
 * - subscribe() ile bir log-viewer UI canlı dinleyebilir.
 */
class Logger {
    private buffer: LogEntry[] = [];
    private readonly maxBuffer = 500;

    /** Bu seviyenin altındaki loglar yok sayılır. VITE_LOG_LEVEL override eder. */
    private minLevel: LogLevel = parseLevel(ENV.VITE_LOG_LEVEL) ?? (ENV.DEV ? 'debug' : 'info');

    /** Konsol yazım modu — VITE_LOG_CONSOLE: auto | on | off */
    private readonly consoleMode: ConsoleMode = parseConsoleMode(ENV.VITE_LOG_CONSOLE);

    private readonly subscribers = new Set<Subscriber>();

    /** Prod'da konsol bu bayrak açılmadıkça sessizdir. */
    private readonly debugFlagKey = 'bw_debug';

    setMinLevel(level: LogLevel): void {
        this.minLevel = level;
    }

    /**
     * Konsola yazılsın mı? (VITE_LOG_CONSOLE)
     * - 'on'   → her zaman açık.
     * - 'off'  → her zaman kapalı.
     * - 'auto' → dev'de açık; prod'da yalnızca `localStorage.bw_debug === '1'` ise
     *            (dev escape-hatch). Yayındaki son kullanıcı F12 açsa bile görmez.
     */
    private get consoleEnabled(): boolean {
        if (this.consoleMode === 'on') return true;
        if (this.consoleMode === 'off') return false;
        if (import.meta.env.DEV) return true;
        try {
            return localStorage.getItem(this.debugFlagKey) === '1';
        } catch {
            return false;
        }
    }

    // ─── Public API ──────────────────────────────────────────────────────

    debug(message: string, opts?: LogOptions): void { this.log('debug', message, opts); }
    info(message: string, opts?: LogOptions): void { this.log('info', message, opts); }
    warn(message: string, opts?: LogOptions): void { this.log('warn', message, opts); }
    error(message: string, opts?: LogOptions): void { this.log('error', message, opts); }
    fatal(message: string, opts?: LogOptions): void { this.log('fatal', message, opts); }

    log(level: LogLevel, message: string, opts?: LogOptions): void {
        if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.minLevel]) return;

        const entry: LogEntry = {
            id: uuid(),
            timestamp: new Date().toISOString(),
            level,
            message,
            context: opts?.context,
            data: opts?.data,
            error: serializeError(opts?.error),
        };

        this.push(entry);
        this.writeConsole(entry);

        this.emit(entry);
    }

    /** Buffer'daki kayıtları (yeniden eskiye) döndürür; opsiyonel seviye filtresi. */
    getEntries(minLevel?: LogLevel): LogEntry[] {
        const list = [...this.buffer].reverse();
        if (!minLevel) return list;
        return list.filter((e) => LEVEL_WEIGHT[e.level] >= LEVEL_WEIGHT[minLevel]);
    }

    clear(): void {
        this.buffer = [];
    }

    /** Bütün logları paylaşılabilir tek metne çevirir (destek/feedback için). */
    export(): string {
        return this.buffer
            .map((e) => {
                const base = `[${e.timestamp}] ${e.level.toUpperCase()}${e.context ? ` (${e.context})` : ''}: ${e.message}`;
                const err = e.error ? `\n  ${e.error.name}: ${e.error.message}${e.error.stack ? `\n  ${e.error.stack}` : ''}` : '';
                const data = e.data ? `\n  data: ${JSON.stringify(e.data)}` : '';
                return base + data + err;
            })
            .join('\n');
    }

    subscribe(fn: Subscriber): () => void {
        this.subscribers.add(fn);
        return () => this.subscribers.delete(fn);
    }

    // ─── İç işleyiş ──────────────────────────────────────────────────────

    private push(entry: LogEntry): void {
        this.buffer.push(entry);
        if (this.buffer.length > this.maxBuffer) {
            this.buffer.splice(0, this.buffer.length - this.maxBuffer);
        }
    }

    private emit(entry: LogEntry): void {
        for (const fn of this.subscribers) {
            try { fn(entry); } catch { /* subscriber hatası logger'ı bozmasın */ }
        }
    }

    private safeStringfy(value: unknown) {
        try {
            return JSON.stringify(value, null, 2)
        } catch {
            return String(value)
        }
    }

    private writeConsole(entry: LogEntry): void {
        if (!this.consoleEnabled) return;

        // Her satır tek tip `[ETIKET]` ile başlar. Logcat'te gerçek gruplama yok
        // (console.group düz satır olarak düşer, groupEnd zaten `isValidMsg()`
        // tarafından eleniyor), dolayısıyla kaynak ayrımı ancak grep'le yapılabilir:
        //   adb logcat -s "Capacitor/Console" | grep "\[BRIDGE\]"
        // Etiket `context`ten türer — paralel bir kavram icat etmeye gerek yok.
        const tag = `[${(entry.context ?? 'app').toUpperCase()}]`;
        const label = `${tag} ${entry.level.toUpperCase()}`;

        // Native (Capacitor) Logcat köprüsü %c CSS stillemesini işleyemez → ham
        // "%c... color:..." basar. Bu yüzden native'de stilsiz düz metin; web
        // DevTools'ta renkli %c.
        let args: unknown[];
        if (CONSOLE_SUPPORTS_CSS) {
            args = [`%c${label}`, CONSOLE_STYLE[entry.level], entry.message];
        } else {
            args = [`${label}: ${entry.message}`];
        }

        if (entry.data) args.push(this.safeStringfy(entry.data));
        if (entry.error) args.push(this.safeStringfy(entry.error));

        switch (entry.level) {
            case 'debug': console.debug(...args); break;
            case 'info': console.info(...args); break;
            case 'warn': console.warn(...args); break;
            default: console.error(...args); break;
        }
    }
}

const CONSOLE_STYLE: Record<LogLevel, string> = {
    debug: 'color:#6b7280',
    info: 'color:#3b82f6',
    warn: 'color:#f59e0b;font-weight:bold',
    error: 'color:#ef4444;font-weight:bold',
    fatal: 'color:#fff;background:#b91c1c;font-weight:bold;padding:1px 4px;border-radius:3px',
};

/** Uygulama genelinde tek logger örneği. */
export const logger = new Logger();
