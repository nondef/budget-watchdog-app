import { Seeder, SeederResult } from "@/infrastructure/database/seeders/base-seeder";
import { CurrencySeeder } from "@/infrastructure/database/seeders/currency-seeder";
import { CategoriesSeeder } from "@/infrastructure/database/seeders/categories-seeder";
import type { FakeDataMode } from "@/infrastructure/database/seeders/dev/fake-data-seeder";
import { DatabaseAdapter } from "@/domain";
import { logger } from "@/infrastructure/logging";

const CTX = "seeder";

/**
 * Fake veri anahtarı — `bw_db_log` / `bw_debug` ile aynı kalıp.
 * '1' → aç, '0' → .env true olsa bile kapat, 'reset' → temizleyip yeniden üret.
 */
const FAKE_DATA_KEY = 'bw_seed_fake';

/**
 * Öncelik: localStorage tercihi > .env > kapalı.
 *
 * localStorage yolu, `.env` dosyası ve dev sunucu restart'ı olmadan da
 * açılabilsin diye var. Prod'da her koşulda kapalı.
 *
 * 'seed' kurulu uygulamada da çalışır: fake veri kullanıcının verisinin
 * ÜSTÜNE eklenir, hiçbir şey silinmez (bkz. FakeDataSeeder). 'reset' yalnızca
 * "üretilmiş fake veriyi at, yenisini üret" demek — o da sadece fake satırlara
 * dokunur, kullanıcının cüzdanı/işlemleri her iki modda da korunur.
 */
function fakeDataMode(): FakeDataMode | 'off' {
    if (!import.meta.env.DEV) {
        return 'off';
    }

    try {
        const stored = localStorage.getItem(FAKE_DATA_KEY);
        if (stored === '1') return 'seed';
        if (stored === '0') return 'off';
        if (stored === 'reset') return 'reset';
    } catch { /* özel mod: localStorage okunamayabilir */ }

    const env = import.meta.env.VITE_SEED_FAKE_DATA?.trim().toLowerCase();
    if (env === 'reset') return 'reset';

    return env === 'true' ? 'seed' : 'off';
}

export class SeederManager {
    private seeders: Seeder[] = []
    private registration?: Promise<void>

    constructor(private db: DatabaseAdapter) {
    }

    /**
     * Kayıt async, çünkü FakeDataSeeder dinamik import ediliyor (bkz. aşağı).
     * İki giriş noktası (runAll/rollbackAll) da bunu bekler; promise saklanır
     * ki ikisi peş peşe çağrılsa bile liste bir kez kurulsun.
     */
    private ensureSeeders(): Promise<void> {
        return this.registration ??= this.registerSeeders()
    }

    private async registerSeeders() {
        this.seeders = [
            new CurrencySeeder(),
            new CategoriesSeeder(),
        ]

        // Sahte test verisi: sadece dev ortamında (bkz. fakeDataMode).
        //
        // `import.meta.env.DEV` build sırasında sabit `false`'a dönüşür, bu yüzden
        // blok tamamen elenir ve dinamik import ile birlikte @faker-js/faker
        // üretim bundle'ına HİÇ girmez. Eskiden statik import'tu: faker (525 kB
        // ham / 205 kB gzip) açılış zincirindeki database-factory chunk'ına
        // bağlanıp her kullanıcıya iniyordu.
        if (import.meta.env.DEV) {
            const mode = fakeDataMode()

            if (mode !== 'off') {
                const { FakeDataSeeder } = await import("@/infrastructure/database/seeders/dev/fake-data-seeder")
                this.seeders.push(new FakeDataSeeder(mode))
            }
        }
    }

    /**
     * Çalışan her seeder kendi info log'unu basar (BaseSeeder.run). Burada
     * yalnızca "hiçbir şey yapılmadı" durumu ve hata loglanır — normal
     * açılışta (her şey seed'li) log gürültüsü sıfır olsun diye.
     */
    async runAll(): Promise<SeederResult[]> {
        try {
            await this.ensureSeeders()

            const results: SeederResult[] = []

            for (const seeder of this.seeders) {
                results.push(await seeder.run(this.db))
            }

            if (!results.some(r => r.seeded)) {
                logger.debug('Seed gerekmedi — tüm tablolar dolu', { context: CTX })
            }

            return results
        } catch (error) {
            logger.error('Seeder hatası', { context: CTX, error })
            throw error
        }
    }

    async rollbackAll() {
        try {
            await this.ensureSeeders()

            logger.debug('Seeder rollback başlatılıyor', { context: CTX })

            for (let i = this.seeders.length - 1; i >= 0; i--) {
                await this.seeders[i].rollback(this.db)
            }

            logger.debug('Tüm rollback\'ler tamamlandı', { context: CTX })
        } catch (error) {
            logger.error('Seeder rollback hatası', { context: CTX, error })
            throw error
        }
    }
}