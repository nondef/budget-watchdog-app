/**
 * Uygulama meta bilgisi — tek kaynak.
 * .env (VITE_APP_*) okunur; tanımsızsa güvenli varsayılana düşer.
 *
 * Not: VITE_ değişkenleri build sırasında gömülür ve client'ta açıktır;
 * burada yalnızca gösterim amaçlı, hassas olmayan değerler tutulur.
 */
export const appConfig = {
    name: import.meta.env.VITE_APP_NAME?.trim() || 'Budget Watchdog',
    version: import.meta.env.VITE_APP_VERSION?.trim() || '1.0.0',
} as const;
