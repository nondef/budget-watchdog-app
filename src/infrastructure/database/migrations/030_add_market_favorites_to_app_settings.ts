import { BaseMigration } from './base-migration';
import { DatabaseAdapter } from '@/domain';

/**
 * Piyasa ekranındaki favori kurlar `localStorage`'da tutuluyordu: WebView
 * deposu yedeğe girmiyor ve iOS'ta sistem yer açarken silinebiliyor —
 * kullanıcının seçimi sessizce varsayılana dönüyordu.
 *
 * Kod listesi JSON dizi olarak saklanır; sıra kullanıcının ekleme sırasıdır.
 * NULL "hiç seçim yapılmadı → varsayılan favoriler" demek, `'[]'` ise
 * kullanıcının hepsini kaldırdığı anlamına gelir; ikisi ayrı tutulmalı.
 *
 * Eski `localStorage` değeri burada değil, market store'un ilk açılışında
 * devralınır (bkz. `useMarketStore.initialize`): migration'lar yalnızca DB'ye
 * dokunur ve onboarding'den önce ayar satırı henüz yoktur.
 */
export class AddMarketFavoritesToAppSettings extends BaseMigration {
    version = 30;
    name = 'add_market_favorites_to_app_settings';

    async up(db: DatabaseAdapter): Promise<void> {
        await db.run(`ALTER TABLE app_settings ADD COLUMN market_favorites TEXT`);
    }

    async down(_db: DatabaseAdapter): Promise<void> {
        // SQLite ALTER TABLE DROP COLUMN sınırlı; şimdilik no-op.
    }
}
