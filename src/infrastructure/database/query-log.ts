import { Capacitor } from '@capacitor/core';

/** %c CSS stillemesi yalnızca tarayıcı DevTools'unda anlamlı; native Logcat ham basar. */
const CONSOLE_SUPPORTS_CSS = !Capacitor.isNativePlatform();

const ENV = import.meta.env;

export type QueryKind = 'query' | 'run' | 'execute' | 'batch' | 'transaction';

/** Konsol yazım modu — VITE_DB_LOG: auto | on | off */
type ConsoleMode = 'auto' | 'on' | 'off';

/**
 * Transaction satırlarının konsolda görünürlüğü — VITE_DB_LOG_TX.
 * - 'off'     → hiç gösterilme; sorgular da `⤷` işareti almaz (düz SQL akışı)
 * - 'summary' → BEGIN yutulur, kapanışta tek özet satırı (varsayılan)
 * - 'verbose' → BEGIN/COMMIT/ROLLBACK ham satır olarak
 */
export type TransactionLogMode = 'off' | 'summary' | 'verbose';

export interface QueryLogEntry {
    id: number;
    timestamp: string; // ISO
    kind: QueryKind;
    /** Ham SQL (parametreler `?` olarak). Batch'te ilk ifade. */
    sql: string;
    bindings: unknown[];
    /** Batch'te tüm ifadeler; tekil çağrılarda undefined. */
    statements?: { sql: string; bindings: unknown[] }[];
    durationMs: number;
    /** Okuma sorgularında dönen satır, yazmalarda etkilenen satır sayısı. */
    rows?: number;
    /** Çağıranın yeri (`account-repository.ts:112` gibi) — Telescope'taki "caller". */
    source?: string;
    error?: string;
}

type Subscriber = (entry: QueryLogEntry) => void;

function parseConsoleMode(value: string | undefined): ConsoleMode {
    const v = value?.trim().toLowerCase();
    return v === 'on' || v === 'off' ? v : 'auto';
}

function parseTransactionMode(value: string | undefined): TransactionLogMode {
    const v = value?.trim().toLowerCase();
    return v === 'off' || v === 'verbose' ? v : 'summary';
}

function parseThreshold(value: string | undefined): number {
    const n = Number(value?.trim());
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Tek satır konsol çıktısı için SQL'i sadeleştirir (şablon SQL'leri çok satırlı). */
function condense(sql: string): string {
    return sql.replace(/\s+/g, ' ').trim();
}

/** Bir parametreyi SQL literaline çevirir — çıktı kopyalanıp DB'de çalıştırılabilsin diye. */
function toLiteral(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (value instanceof Date) return `'${value.toISOString()}'`;
    if (ArrayBuffer.isView(value)) return `x'…${(value as ArrayBufferView).byteLength}b'`;

    const text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
    return `'${text.replace(/'/g, "''")}'`;
}

/**
 * `?` yer tutucularını gerçek değerlerle doldurur (Laravel Debugbar'ın yaptığı gibi).
 * String literalleri içindeki `?` atlanır; aksi hâlde `'a?b'` gibi bir metin
 * parametre kaydırıp tüm satırı yanlış gösteriyordu.
 */
export function interpolate(sql: string, bindings: unknown[] = []): string {
    if (!bindings.length) return sql;

    let index = 0;
    let inString = false;
    let out = '';

    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];

        if (char === "'") {
            inString = !inString;
            out += char;
            continue;
        }

        if (char === '?' && !inString && index < bindings.length) {
            out += toLiteral(bindings[index++]);
            continue;
        }

        out += char;
    }

    return out;
}

/** Yığından ilk uygulama karesini çıkarır; infra/logger kareleri elenir. */
function captureSource(): string | undefined {
    const stack = new Error().stack;
    if (!stack) return undefined;

    // Altyapı kareleri elenir: aksi hâlde her generic finder aynı
    // `base-repository.ts:937` satırını gösterir, çağıranı bulmak imkânsızlaşır.
    const skip = /query-log|query-logging-database-adapter|sqlite-database-adapter|base-repository|transaction-coordinator|unit-of-work|node_modules/;

    for (const line of stack.split('\n').slice(2)) {
        if (skip.test(line)) continue;

        const match = line.match(/([\w.-]+\.(?:ts|js|vue))(?::(\d+))?(?::\d+)?\)?$/);
        if (match) return match[2] ? `${match[1]}:${match[2]}` : match[1];
    }

    return undefined;
}

/**
 * Laravel'deki `DB::listen()` / Debugbar karşılığı: çalışan her SQL'i süresi,
 * parametreleri ve çağıran dosyasıyla konsola basar, son N kaydı bellekte tutar.
 *
 * Kapalıyken (`enabled === false`) adapter hiç ölçüm yapmaz — prod'da maliyeti yok.
 */
class QueryLog {
    private buffer: QueryLogEntry[] = [];
    private readonly maxBuffer = 200;
    private counter = 0;

    private readonly consoleMode: ConsoleMode = parseConsoleMode(ENV.VITE_DB_LOG);

    /** Bu süreden hızlı sorgular konsola yazılmaz (0 = hepsi). */
    private slowThresholdMs = parseThreshold(ENV.VITE_DB_LOG_SLOW);

    /** Runtime override — `db.enable()` / `db.disable()`. null ise moda uyar. */
    private override: boolean | null = null;

    /** Transaction görünürlüğü — VITE_DB_LOG_TX, varsayılan 'summary'. */
    private txMode: TransactionLogMode = parseTransactionMode(ENV.VITE_DB_LOG_TX);

    /** Açık transaction'ın başlangıcı ve içinde koşan sorgu sayısı. */
    private txStartedAt: number | null = null;
    private txQueryCount = 0;
    /** Kapanış satırının kullanacağı, biten transaction'ın özeti. */
    private lastTxSummary: { count: number; durationMs: number } | null = null;

    private readonly storageKey = 'bw_db_log';
    private readonly subscribers = new Set<Subscriber>();

    /**
     * Öncelik: runtime override > .env kesin değeri > cihaz tercihi > ortam varsayılanı.
     *
     * - 'on'   → her zaman açık
     * - 'off'  → her zaman kapalı
     * - 'auto' → `localStorage.bw_db_log` ('1' açık / '0' kapalı) varsa o; yoksa
     *            dev'de açık, prod'da kapalı.
     *
     * Cihaz tercihi ortam varsayılanının ÜSTÜNDE: aksi hâlde `db.disable(true)`
     * dev'de hiçbir işe yaramıyordu, yenilemede `ENV.DEV` logu geri açıyordu.
     */
    get enabled(): boolean {
        if (this.override !== null) return this.override;
        if (this.consoleMode === 'on') return true;
        if (this.consoleMode === 'off') return false;

        const stored = this.readStored();
        if (stored !== null) return stored;

        return ENV.DEV;
    }

    /** Bu oturum için aç (kalıcı istenirse `persist: true`). */
    enable(persist = false): void {
        this.override = true;
        if (persist) this.writeStored('1');
    }

    /** Bu oturum için kapat; `persist: true` ile dev'de de kalıcı kapalı kalır. */
    disable(persist = false): void {
        this.override = false;
        if (persist) this.writeStored('0');
    }

    /** Kalıcı tercihi siler, .env davranışına geri döner. */
    reset(): void {
        this.override = null;
        try { localStorage.removeItem(this.storageKey); } catch { /* yoksay */ }
    }

    /** Yalnızca bu eşiği aşan sorguları konsola bas (ms). */
    setSlowThreshold(ms: number): void {
        this.slowThresholdMs = Math.max(0, ms);
    }

    /** Transaction satırları: 'off' | 'summary' | 'verbose'. */
    setTransactionMode(mode: TransactionLogMode): void {
        this.txMode = mode;
    }

    record(entry: Omit<QueryLogEntry, 'id' | 'timestamp'>): void {
        const full: QueryLogEntry = {
            ...entry,
            id: ++this.counter,
            timestamp: new Date().toISOString(),
        };

        this.push(full);
        this.trackTransaction(full);
        this.writeConsole(full);
        this.emit(full);
    }

    /** Süre ölçüp kaydı düşen sarmalayıcı; hata da kaydedilir ve yeniden fırlatılır. */
    async measure<T>(
        meta: Pick<QueryLogEntry, 'kind' | 'sql' | 'bindings'> & { statements?: QueryLogEntry['statements'] },
        run: () => Promise<T>,
        rowsOf?: (result: T) => number | undefined,
    ): Promise<T> {
        const source = captureSource();
        const started = performance.now();

        try {
            const result = await run();
            this.record({ ...meta, source, durationMs: performance.now() - started, rows: rowsOf?.(result) });
            return result;
        } catch (error) {
            this.record({
                ...meta,
                source,
                durationMs: performance.now() - started,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /** Kayıtlar (eskiden yeniye). */
    getEntries(): QueryLogEntry[] {
        return [...this.buffer];
    }

    clear(): void {
        this.buffer = [];
    }

    subscribe(fn: Subscriber): () => void {
        this.subscribers.add(fn);
        return () => this.subscribers.delete(fn);
    }

    /** Konsolda tablo hâlinde özet — `db.dump()`. */
    dump(): void {
        console.table(
            this.buffer.map((e) => ({
                '#': e.id,
                ms: Number(e.durationMs.toFixed(2)),
                kind: e.kind,
                rows: e.rows ?? '',
                sql: condense(interpolate(e.sql, e.bindings)).slice(0, 120),
                source: e.source ?? '',
                error: e.error ?? '',
            })),
        );
    }

    /** En yavaş sorgular — `db.slow()`. */
    slowest(limit = 10): QueryLogEntry[] {
        return [...this.buffer].sort((a, b) => b.durationMs - a.durationMs).slice(0, limit);
    }

    /** Aynı SQL'in kaç kez çalıştığı — N+1 avı için. */
    duplicates(): { sql: string; count: number; totalMs: number }[] {
        const map = new Map<string, { sql: string; count: number; totalMs: number }>();

        for (const e of this.buffer) {
            const key = condense(e.sql);
            const hit = map.get(key) ?? { sql: key, count: 0, totalMs: 0 };
            hit.count++;
            hit.totalMs += e.durationMs;
            map.set(key, hit);
        }

        return [...map.values()].filter((x) => x.count > 1).sort((a, b) => b.count - a.count);
    }

    /** Tüm kayıtları paylaşılabilir tek metne çevirir. */
    export(): string {
        return this.buffer
            .map((e) => {
                const head = `[${e.timestamp}] ${e.durationMs.toFixed(2)}ms ${e.kind}${e.source ? ` (${e.source})` : ''}`;
                const body = condense(interpolate(e.sql, e.bindings));
                return `${head}\n  ${body}${e.error ? `\n  ERROR: ${e.error}` : ''}`;
            })
            .join('\n');
    }

    // ─── İç işleyiş ──────────────────────────────────────────────────────

    private push(entry: QueryLogEntry): void {
        this.buffer.push(entry);
        if (this.buffer.length > this.maxBuffer) {
            this.buffer.splice(0, this.buffer.length - this.maxBuffer);
        }
    }

    /** Kalıcı tercih: true=açık, false=kapalı, null=tercih yok. */
    private readStored(): boolean | null {
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (raw === '1') return true;
            if (raw === '0') return false;
            return null;
        } catch {
            return null;
        }
    }

    private writeStored(value: '0' | '1'): void {
        try { localStorage.setItem(this.storageKey, value); } catch { /* yoksay */ }
    }

    private emit(entry: QueryLogEntry): void {
        for (const fn of this.subscribers) {
            try { fn(entry); } catch { /* subscriber hatası log'u bozmasın */ }
        }
    }

    /**
     * Transaction sınırlarını takip eder: kapanışta özet satırı basabilmek için
     * içeride koşan sorguları sayar. Kayıt her hâlükârda tampona girdiği için
     * `db.log()` tam sadakatini korur — sadeleştirme yalnızca konsol çıktısında.
     */
    private trackTransaction(entry: QueryLogEntry): void {
        if (entry.kind !== 'transaction') {
            if (this.txStartedAt !== null) this.txQueryCount++;
            return;
        }

        if (TX_BEGIN.test(entry.sql)) {
            this.txStartedAt = performance.now();
            this.txQueryCount = 0;
            this.lastTxSummary = null;
            return;
        }

        this.lastTxSummary = {
            count: this.txQueryCount,
            durationMs: this.txStartedAt === null ? entry.durationMs : performance.now() - this.txStartedAt,
        };
        this.txStartedAt = null;
        this.txQueryCount = 0;
    }

    private writeConsole(entry: QueryLogEntry): void {
        if (entry.kind === 'transaction' && this.txMode !== 'verbose') {
            this.writeTransactionSummary(entry);
            return;
        }

        // Hatalar eşikten bağımsız her zaman görünür.
        if (!entry.error && entry.durationMs < this.slowThresholdMs) return;

        const duration = `${entry.durationMs.toFixed(2)}ms`;
        // Transaction içindeki sorgular işaretlenir; 'off' modunda akış düz kalır.
        const marker = this.txMode !== 'off' && this.txStartedAt !== null ? '⤷ ' : '';
        const sql = marker + condense(interpolate(entry.sql, entry.bindings));
        const suffix = entry.statements?.length ? ` (+${entry.statements.length - 1} ifade)` : '';
        const tail = [
            entry.rows !== undefined ? `${entry.rows} satır` : '',
            entry.source ?? '',
        ].filter(Boolean).join(' · ');

        if (!CONSOLE_SUPPORTS_CSS) {
            // Logcat %c işleyemez → düz metin.
            // `[SQL]` prefix'i Logcat'te grep ile ayrıştırmak için (bkz. logger.ts).
            const line = `[SQL] ${duration} | ${sql}${suffix}${tail ? ` | ${tail}` : ''}`;
            if (entry.error) console.error(`${line}\n  ERROR: ${entry.error}`);
            else console.log(line);
            return;
        }

        const label = entry.error ? '%c SQL ✕ ' : '%c SQL ';
        const args: unknown[] = [
            `${label}%c ${duration} %c${sql}${suffix}${tail ? `%c  ${tail}` : ''}`,
            entry.error ? STYLE.labelError : STYLE.label,
            this.durationStyle(entry.durationMs),
            STYLE.sql,
        ];
        if (tail) args.push(STYLE.meta);

        if (entry.error) {
            console.error(...args, `\n  ${entry.error}`);
            return;
        }

        // Batch'te tek satır özet + açılabilir ifade listesi.
        if (entry.statements && entry.statements.length > 1) {
            console.groupCollapsed(...args);
            for (const stmt of entry.statements) {
                console.log(condense(interpolate(stmt.sql, stmt.bindings)));
            }
            console.groupEnd();
            return;
        }

        console.log(...args);
    }

    /**
     * BEGIN yutulur; kapanışta tek satır: `TX 4.21ms COMMIT · 3 sorgu`.
     *
     * ROLLBACK, 'off' modunda ve eşik altında bile basılır — sessizce geri alınan
     * bir transaction, gürültü azaltmak uğruna kaçırılacak son şeydir ve zaten
     * yalnızca bir şeyler ters gittiğinde çıkar.
     */
    private writeTransactionSummary(entry: QueryLogEntry): void {
        if (TX_BEGIN.test(entry.sql)) return;

        const rolledBack = TX_ROLLBACK.test(entry.sql);
        if (this.txMode === 'off' && !rolledBack && !entry.error) return;
        const summary = this.lastTxSummary;
        const totalMs = summary?.durationMs ?? entry.durationMs;

        if (!rolledBack && !entry.error && totalMs < this.slowThresholdMs) return;

        const duration = `${totalMs.toFixed(2)}ms`;
        const text = `${rolledBack ? 'ROLLBACK' : 'COMMIT'} · ${summary?.count ?? 0} sorgu`;

        if (!CONSOLE_SUPPORTS_CSS) {
            const line = `[TX] ${duration} | ${text}`;
            if (entry.error) console.error(`${line}\n  ERROR: ${entry.error}`);
            else console.log(line);
            return;
        }

        const args: unknown[] = [
            `%c TX %c ${duration} %c${text}`,
            rolledBack || entry.error ? STYLE.labelWarn : STYLE.label,
            this.durationStyle(totalMs),
            STYLE.meta,
        ];

        if (entry.error) console.error(...args, `\n  ${entry.error}`);
        else console.log(...args);
    }

    private durationStyle(ms: number): string {
        if (ms >= 100) return STYLE.slow;
        if (ms >= 25) return STYLE.medium;
        return STYLE.fast;
    }
}

const TX_BEGIN = /^\s*BEGIN/i;
const TX_ROLLBACK = /^\s*ROLLBACK/i;

const STYLE = {
    label: 'color:#fff;background:#0ea5e9;font-weight:bold;border-radius:3px',
    labelError: 'color:#fff;background:#b91c1c;font-weight:bold;border-radius:3px',
    labelWarn: 'color:#fff;background:#b45309;font-weight:bold;border-radius:3px',
    fast: 'color:#22c55e',
    medium: 'color:#f59e0b',
    slow: 'color:#ef4444;font-weight:bold',
    sql: 'color:inherit',
    meta: 'color:#9ca3af',
};

/** Uygulama genelinde tek sorgu-log örneği. */
export const queryLog = new QueryLog();

/**
 * Konsoldan elle kullanım için `window.db` kısayolları:
 * `db.dump()`, `db.slow()`, `db.duplicates()`, `db.enable()`, `db.clear()`.
 */
export function installQueryLogDevtools(): void {
    if (typeof window === 'undefined') return;

    (window as unknown as Record<string, unknown>).db = {
        enable: (persist = false) => queryLog.enable(persist),
        disable: (persist = false) => queryLog.disable(persist),
        reset: () => queryLog.reset(),
        threshold: (ms: number) => queryLog.setSlowThreshold(ms),
        transactions: (mode: TransactionLogMode = 'summary') => queryLog.setTransactionMode(mode),
        log: () => queryLog.getEntries(),
        dump: () => queryLog.dump(),
        slow: (limit?: number) => queryLog.slowest(limit),
        duplicates: () => queryLog.duplicates(),
        export: () => queryLog.export(),
        clear: () => queryLog.clear(),
    };
}
