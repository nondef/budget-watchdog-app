import { Capacitor } from '@capacitor/core';
import { logger } from '@/infrastructure/logging';

/**
 * Capacitor'un native köprü logger'ını devralır (yalnızca native platformlarda).
 *
 * Köprü, her plugin çağrısını ve dönen sonucu konsola döküyor; Android'de bu
 * çıktı WebView → Logcat'e aynen geçiyor:
 *
 *   native-bridge.js:345 → `c.dir(call)`                        → `[object Object]`
 *   native-bridge.js:329 → `c.dir(JSON.stringify(result.data))` → tüm sonuç satırları JSON olarak
 *
 * Capacitor 7'de bu loglar Logcat'e hiç düşmüyordu; 8'de iki ayrı değişiklik
 * birlikte görünür kıldı:
 *
 *   1. `native-bridge.js:329` — `c.dir(result.data)` → `c.dir(JSON.stringify(result.data))`.
 *      Argüman objeyken WebView `[object Object]`'e indiriyordu; artık düz string
 *      olduğu için her SELECT'in tüm satırları basılıyor.
 *   2. `BridgeWebChromeClient.isValidMsg()` — v7'deki `msg.equalsIgnoreCase("[object Object]")`
 *      elemesi kaldırıldı, dolayısıyla `c.dir(call)` çıktısı da artık geçiyor.
 *      v8'de yalnızca `%cresult %c` / `%cnative %c` başlıkları ve `console.groupEnd` eleniyor.
 *
 * Web'de sorun görünmez: DevTools `console.dir`'ü katlanabilir bir ağaç olarak
 * gösterir ve `groupCollapsed` başlığı altında saklar.
 *
 * Köprü `logToNative`/`logFromNative`'i çağrı anında `window.Capacitor` üzerinden
 * okuduğu için (native-bridge.js:915 ve :944) burada değiştirmek yeterli — sonuç
 * gövdesi hiç basılmaz, yerine tek satır geçer.
 *
 * Not: `capacitor.config.ts` içindeki `loggingBehavior: 'none'` bu dökümü de
 * kapatır AMA Java tarafında `Logger.shouldLog()` üzerinden TÜM Logcat çıktısını
 * (uygulamanın SQL logları dahil) kapattığı için kullanılmadı.
 *
 * Yan etkisi import anında oluşur; `main.ts` içinde ilk import olmalı ki
 * boot sırasındaki ilk plugin çağrısından önce devreye girsin.
 */

/**
 * VITE_BRIDGE_LOG — köprü trafiğinin nereye gideceği:
 * - 'off'     → hiçbir yere; köprü tamamen susar (varsayılan)
 * - 'logger'  → merkezi `logger`'a `debug`/`bridge` olarak → logger buffer + export()
 * - 'console' → doğrudan konsola; logger buffer'ına dokunmadan ham izleme
 */
type BridgeLogMode = 'off' | 'logger' | 'console';

function parseMode(value: string | undefined): BridgeLogMode {
    const v = value?.trim().toLowerCase();
    return v === 'logger' || v === 'console' ? v : 'off';
}

const MODE = parseMode(import.meta.env.VITE_BRIDGE_LOG);

/**
 * Bu plugin'lerin köprü trafiği yutulur.
 *
 * SQLite tek başına tüm trafiğin neredeyse tamamı (her sorgu = 1 çağrı + 1 sonuç)
 * ve `query-log.ts` aynı çağrıları süre, interpolate edilmiş SQL, satır sayısı ve
 * çağıran dosyayla zaten kaydediyor — köprü satırı hem gereksiz hem de logger'ın
 * 500'lük ring-buffer'ını doldurup gerçek uygulama loglarını dışarı atardı.
 */
const QUIET_PLUGINS = new Set(['CapacitorSQLite']);

/** Devasa payload'lar (`importFromJson` gibi) Logcat'i doldurmasın diye kırpılır. */
const MAX_OPTIONS_LENGTH = 300;

interface BridgeCall {
    pluginId: string;
    methodName: string;
    options?: unknown;
}

interface BridgeResult {
    pluginId: string;
    methodName: string;
    success: boolean;
    error?: unknown;
}

/** Köprünün `window.Capacitor` üzerine koyduğu, public tiplerde yer almayan alanlar. */
interface BridgeLogger {
    isLoggingEnabled?: boolean;
    logToNative?: (call: BridgeCall) => void;
    logFromNative?: (result: BridgeResult) => void;
}

function summarize(options: unknown): string {
    if (options === undefined) return '';

    const text = JSON.stringify(options) ?? String(options);
    return text.length > MAX_OPTIONS_LENGTH ? `${text.slice(0, MAX_OPTIONS_LENGTH)}… (${text.length}b)` : text;
}

if (Capacitor.isNativePlatform()) {
    const bridge = Capacitor as unknown as BridgeLogger;

    if (MODE === 'off') {
        // Bayrak tek başına yetmiyor: `@capacitor/core` init'i `cap.isLoggingEnabled`
        // üzerinden geçiyor ve modül sırası/HMR'a göre bu atamayı sonradan ezebiliyor.
        // Asıl yayıncı fonksiyonların kendisi olduğu için onlar da boşa alınır —
        // köprü ikisini de çağrı anında okuyor (native-bridge.js:915 ve :944).
        const noop = () => { /* köprü dökümü susturuldu */ };

        bridge.isLoggingEnabled = false;
        bridge.logToNative = noop;
        bridge.logFromNative = noop;
    } else if (MODE === 'logger') {
        // Özyineleme yok: Android'de `console.log` doğrudan WebView konsoluna gider
        // (Console plugin patch'i yalnızca iOS'ta), iOS'ta ise köprü Console
        // çağrılarını `pluginName !== 'Console'` ile zaten dışlıyor.
        bridge.logToNative = (call) => {
            if (QUIET_PLUGINS.has(call.pluginId)) return;
            logger.debug(`→ ${call.pluginId}.${call.methodName}`, {
                context: 'bridge',
                data: { options: summarize(call.options) },
            });
        };

        bridge.logFromNative = (result) => {
            if (QUIET_PLUGINS.has(result.pluginId)) return;

            const message = `← ${result.pluginId}.${result.methodName}`;
            // Başarısız çağrı `warn`: görünür olsun ama `persistFromLevel` ('error')
            // altında kaldığı için localStorage'ı doldurmasın.
            if (result.success) logger.debug(message, { context: 'bridge' });
            else logger.warn(message, { context: 'bridge', error: result.error });
        };
    } else {
        // 'logger' modunda etiket `context: 'bridge'`ten türüyor; burada elle eklenir
        // ki iki mod da Logcat'te aynı `[BRIDGE]` prefix'iyle grep'lensin.
        bridge.logToNative = (call) => {
            if (QUIET_PLUGINS.has(call.pluginId)) return;
            console.log(`[BRIDGE] → ${call.pluginId}.${call.methodName}`, summarize(call.options));
        };

        bridge.logFromNative = (result) => {
            if (QUIET_PLUGINS.has(result.pluginId)) return;
            const line = `[BRIDGE] ← ${result.pluginId}.${result.methodName} ${result.success ? 'ok' : 'FAIL'}`;
            if (result.success) console.log(line);
            else console.warn(line, result.error);
        };
    }
}
