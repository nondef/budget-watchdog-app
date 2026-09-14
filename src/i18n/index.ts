import { createI18n } from 'vue-i18n';
import type { LanguageCode } from '@/domain/value-objects/language';
import { Language } from '@/domain/value-objects/language';
import tr from '@/locales/tr.json';
import en from '@/locales/en.json';
import de from '@/locales/de.json';

/** Uygulamada aktif olarak desteklenen diller. */
export const SUPPORTED_LOCALES = ['tr', 'en', 'de'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'tr';

/** Dil tercihinin senkron okunabilmesi için localStorage anahtarı (DB kaynak-of-truth). */
const LANG_STORAGE_KEY = 'bw:lang';

export function isSupportedLocale(code: string): code is SupportedLocale {
    return (SUPPORTED_LOCALES as readonly string[]).includes(code);
}

/** Cihaz/tarayıcı dilini desteklenen bir locale'e eşler (yoksa varsayılan). */
export function getDeviceLocale(): SupportedLocale {
    const nav = typeof navigator !== 'undefined' ? navigator.language?.slice(0, 2) : '';
    if (nav && isSupportedLocale(nav)) {
        return nav;
    }
    return DEFAULT_LOCALE;
}

/** Açılışta hızlı/senkron başlangıç dili: localStorage → cihaz dili → varsayılan. */
function resolveInitialLocale(): SupportedLocale {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(LANG_STORAGE_KEY) : null;
    if (stored && isSupportedLocale(stored)) {
        return stored;
    }
    return getDeviceLocale();
}

export const i18n = createI18n({
    legacy: false,
    locale: resolveInitialLocale(),
    fallbackLocale: DEFAULT_LOCALE,
    messages: { tr, en, de },
});

export const t = i18n.global.t

function applyDocumentLang(code: SupportedLocale) {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('lang', code);
    document.documentElement.setAttribute('dir', Language.from(code).direction);
}

/** Aktif dili değiştirir ve localStorage + <html lang/dir> tarafını günceller. */
export function setLocale(code: LanguageCode | string) {
    const next: SupportedLocale = isSupportedLocale(code) ? code : DEFAULT_LOCALE;
    i18n.global.locale.value = next;

    if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LANG_STORAGE_KEY, next);
    }
    applyDocumentLang(next);
}

// İlk yüklemede <html> niteliklerini başlangıç diline göre ayarla.
applyDocumentLang(i18n.global.locale.value as SupportedLocale);
