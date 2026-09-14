import { Capacitor } from '@capacitor/core';
import { logger } from '@/infrastructure/logging';

/**
 * Harici bağlantıyı (https:, mailto:, tel:) uygun uygulamada açar.
 *
 * Neden `window.open` DEĞİL: Capacitor WebView'ında çoklu pencere desteği
 * kapalı olduğu için `window.open(url, '_blank')` sessizce hiçbir şey yapmaz —
 * kullanıcı tıklar, ekranda hiçbir tepki olmaz. Köprü ise gezinme denemelerini
 * `shouldOverrideUrlLoading` → `Bridge.launchIntent` ile yakalayıp uygulama
 * dışı şemalar için ACTION_VIEW intent'i fırlatır; bu yüzden native'de
 * `location.href` doğru yoldur. Intent açıldığında köprü `true` döner, yani
 * WebView gezinmez ve SPA durumu korunur.
 *
 * Web'de http(s) yeni sekmede açılır; mailto/tel gibi şemalar için tarayıcının
 * kendi işleyicisine bırakılır.
 */
export function openExternalUrl(url: string): void {
    try {
        if (Capacitor.isNativePlatform()) {
            window.location.href = url;
            return;
        }

        if (/^https?:/i.test(url)) {
            window.open(url, '_blank', 'noopener,noreferrer');
            return;
        }

        window.location.href = url;
    } catch (error) {
        logger.warn('Harici bağlantı açılamadı', { context: 'openExternal', error, data: { url } });
    }
}
