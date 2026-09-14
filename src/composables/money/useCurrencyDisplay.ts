import { i18n } from '@/i18n';

/**
 * Para birimi adı/ülkesi için görüntüleme çevirisi.
 *
 * DB'deki name/country alanları Türkçe seed'lenir; kimlik ISO kodudur (USD, TRY...).
 * Ad ve ülke, aktif dile göre tarayıcının yerleşik Intl.DisplayNames API'siyle
 * üretilir (kod → yerelleştirilmiş ad); API bilmiyorsa DB'deki değere düşer.
 * Bu sayede migration ya da locale dosyası bakımı gerekmez.
 *
 * i18n.global üzerinden çalıştığı için setup dışındaki modüllerde de kullanılabilir;
 * computed/render içinde çağrıldığında dil değişimini reaktif olarak izler.
 */

interface CurrencyLike {
    code: string;
    name?: string | null;
    country?: string | null;
}

const displayNamesCache = new Map<string, Intl.DisplayNames | null>();

function getDisplayNames(locale: string, type: 'currency' | 'region'): Intl.DisplayNames | null {
    const key = `${locale}:${type}`;
    if (!displayNamesCache.has(key)) {
        try {
            // fallback: 'none' → bilinmeyen kodda kodu değil undefined döndürür,
            // biz de DB'deki değere düşebilelim.
            displayNamesCache.set(key, new Intl.DisplayNames([locale], { type, fallback: 'none' }));
        } catch {
            displayNamesCache.set(key, null);
        }
    }
    return displayNamesCache.get(key) ?? null;
}

export function translateCurrencyName(currency: CurrencyLike | null | undefined): string {
    if (!currency) return '';
    // locale.value okuması reaktif izleme için bilinçli olarak burada.
    const locale = i18n.global.locale.value;
    try {
        const translated = getDisplayNames(locale, 'currency')?.of(currency.code);
        if (translated) return translated;
    } catch {
        // Geçersiz kod (Intl RangeError fırlatır) → DB değerine düş.
    }
    return currency.name ?? currency.code;
}

export function translateCurrencyCountry(currency: CurrencyLike | null | undefined): string {
    if (!currency) return '';
    const locale = i18n.global.locale.value;
    // ISO 4217 kodlarının ilk iki harfi ISO 3166 bölge kodudur (EUR → EU dahil).
    const region = currency.code?.slice(0, 2).toUpperCase();
    if (region?.length === 2) {
        try {
            const translated = getDisplayNames(locale, 'region')?.of(region);
            if (translated) return translated;
        } catch {
            // Geçersiz bölge kodu → DB değerine düş.
        }
    }
    return currency.country ?? '';
}

/** Template içinde kullanım kolaylığı için composable sarmalayıcı. */
export function useCurrencyDisplay() {
    return {
        currencyName: translateCurrencyName,
        currencyCountry: translateCurrencyCountry,
    };
}
