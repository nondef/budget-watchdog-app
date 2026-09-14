import { i18n, type SupportedLocale } from '@/i18n';

/** Varsayılan (seed) kategorilerin name alanında taşıdığı çeviri anahtarı öneki. */
const KEY_PREFIX = 'defaultCategories.';

/**
 * Kategori adını görüntülenecek metne çevirir.
 *
 * Varsayılan kategoriler DB'de "defaultCategories.*" çeviri anahtarıyla saklanır;
 * kullanıcı kategorileri düz metin isimle saklanır ve olduğu gibi gösterilir.
 * i18n.global üzerinden çalıştığı için setup dışındaki modüllerde de kullanılabilir;
 * computed/render içinde çağrıldığında dil değişimini reaktif olarak izler.
 *
 * @param locale Aktif dil yerine belirli bir dile çevirir. Açılışta DB'deki dil
 *   tercihi i18n'e daha uygulanmamış olabiliyor (app store `initialize()` içinde
 *   `setLocale` çağırıyor); o ana kadar çeviri isteyen çağıranlar dili açıkça
 *   verebilsin diye var.
 */
export function translateCategoryName(
    name: string | null | undefined,
    locale?: SupportedLocale
): string {
    if (!name) return '';
    if (!name.startsWith(KEY_PREFIX)) return name;
    const { t, te } = i18n.global;
    if (!te(name, locale)) return name;
    return locale ? t(name, {}, { locale }) : t(name);
}

/** Template içinde kullanım kolaylığı için composable sarmalayıcı. */
export function useCategoryName() {
    return { categoryName: translateCategoryName };
}
