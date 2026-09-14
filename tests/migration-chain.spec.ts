import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Migration } from '@/infrastructure/database/migrations';
import { SchemaTooNewError } from '@/infrastructure/database/errors';
import { SqlJsTestAdapter } from './helpers/sqljs-adapter';

/**
 * GERÇEK migration zincirinin uçtan uca testi.
 *
 * `migration-atomicity.spec.ts` sınırın kendisini (patlayan bir migration
 * hiçbir DDL bırakır mı) sahte migration'larla sınıyor. Buradaki soru başka ve
 * yayın öncesi çok daha kritik: **001'den 029'a kadar olan asıl zincir, içinde
 * VERİ olan bir veritabanının üstünden geçtiğinde o veri sağ çıkıyor mu?**
 *
 * Zincir hiç bu şekilde koşturulmamıştı. Temiz kurulumda da 29 migration'ın
 * tamamı cihazda çalışıyor; herhangi biri patlarsa hata bir "yükseltme" hatası
 * değil, HER YENİ KULLANICI için açılış hatası olur ve uygulama ilk açılışta
 * kurtarma ekranına düşer.
 *
 * Modül mock'lanıyor ki listeyi dilimleyebilelim: "eski sürüm kurulumu" ancak
 * zincirin bir prefix'i uygulanarak üretilebilir. Dilimler GERÇEK
 * migration'lardan geliyor (`importOriginal`), uydurma değil.
 */
const fake = vi.hoisted(() => ({ migrations: [] as Migration[], seedersEnabled: true }));

vi.mock('@/infrastructure/database/migrations', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/infrastructure/database/migrations')>();
    return {
        ...actual,
        get migrations() { return fake.migrations; },
    };
});

/**
 * Seeder'lar kapatılabilir olmalı.
 *
 * "Eski sürüm kurulumu"nu üretirken zinciri diliyoruz ama seeder kodu
 * dilimlenemez: BUGÜNKÜ `CurrencySeeder`, migration 020'de eklenen
 * `minor_unit` kolonunu yazıyor ve 18. sürümün şemasında o kolon yok. Gerçek
 * bir v0.18 kurulumunda o günün seeder'ı çalışmıştı; testin canlandırdığı şey
 * de o kurulumun BIRAKTIĞI VERİ, seeder'ın kendisi değil.
 *
 * Kapatma yalnızca eski sürüm kurulumunu hazırlarken kullanılıyor; temiz
 * kurulum ve idempotency testleri gerçek seeder'ları koşturuyor.
 */
vi.mock('@/infrastructure/database/seeders/seeder-manager', async (importOriginal) => {
    const actual = await importOriginal<
        typeof import('@/infrastructure/database/seeders/seeder-manager')
    >();

    return {
        SeederManager: class {
            constructor(private readonly db: never) {}
            async runAll() {
                if (!fake.seedersEnabled) return [];
                return new actual.SeederManager(this.db).runAll();
            }
        },
    };
});

const { SeederManager: RealSeederManager } = await vi.importActual<
    typeof import('@/infrastructure/database/seeders/seeder-manager')
>('@/infrastructure/database/seeders/seeder-manager');

const { migrations: realMigrations } = await vi.importActual<
    typeof import('@/infrastructure/database/migrations')
>('@/infrastructure/database/migrations');

const { MigrationManager } = await import('@/infrastructure/database/migrations/migration-manager');

/** Zincirin ilk `count` migration'ı — "o sürümde kalmış bir kurulum". */
function upTo(count: number): Migration[] {
    return realMigrations.slice(0, count);
}

async function runChain(db: SqlJsTestAdapter, list: Migration[]): Promise<void> {
    fake.migrations = list;
    await new MigrationManager(db).runMigrations();
}

async function appliedVersions(db: SqlJsTestAdapter): Promise<number[]> {
    const { rows } = await db.query('SELECT version FROM migrations ORDER BY version');
    return rows.map(row => Number(row.version));
}

async function count(db: SqlJsTestAdapter, table: string): Promise<number> {
    const { rows } = await db.query(`SELECT COUNT(*) AS n FROM ${table}`);
    return Number(rows[0]?.n ?? 0);
}

async function tableNames(db: SqlJsTestAdapter): Promise<string[]> {
    const { rows } = await db.query(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    return rows.map(row => String(row.name));
}

/**
 * Migration 18'in şemasına göre gerçekçi bir kullanıcı verisi yazar.
 *
 * Sürüm 18 bilinçli seçildi: `transaction_budget_effects` yeni gelmiş,
 * arkasından zincirin en riskli üç adımı geliyor — 020 (`minor_unit` eklenmesi),
 * 021 (para bütünlüğü trigger'ları) ve 026 (bütün tarih kolonlarının ISO 8601'e
 * normalize edilmesi). Bu üçü eldeki satırlara DOKUNUYOR; sahada veri kaybı
 * olacaksa buradan çıkar.
 *
 * Tarihler bilinçli olarak SQLite'ın boşluklu `CURRENT_TIMESTAMP` formatında
 * yazılıyor — 026'nın normalize etmesi gereken tam olarak bu biçim.
 */
async function seedLegacyData(db: SqlJsTestAdapter): Promise<void> {
    const legacyStamp = '2026-01-15 09:30:00';

    // ISO 4217'nin test kodu: seeder'ın yazdığı gerçek para birimleriyle
    // `code` UNIQUE kısıtında çakışmaz.
    await db.run(
        'INSERT INTO currencies (id, code, name, symbol, country) VALUES (?, ?, ?, ?, ?)',
        ['cur-legacy', 'XTS', 'Test Para', '¤', 'Testland'],
    );

    await db.run(
        `INSERT INTO categories (id, name, icon, color, type, is_system, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        ['cat-legacy', 'Eski Kategori', 'cartOutline', 'bg-lime-500', 'expense', legacyStamp, legacyStamp],
    );

    await db.run(
        `INSERT INTO accounts (id, currency_id, name, type, balance, color, icon, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        ['acc-legacy', 'cur-legacy', 'Eski Cüzdan', 'cash', 1250.75, 'bg-sky-500', 'walletOutline', legacyStamp, legacyStamp],
    );

    await db.run(
        `INSERT INTO transactions (id, account_id, category_id, currency_id, title, amount, date, type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['txn-legacy', 'acc-legacy', 'cat-legacy', 'cur-legacy', 'Eski Harcama', 249.9, legacyStamp, 'expense', legacyStamp, legacyStamp],
    );
}

describe('Gerçek migration zinciri', () => {
    let db: SqlJsTestAdapter;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        fake.migrations = [];
        fake.seedersEnabled = true;
    });

    it('temiz kurulumda baştan sona uygulanır', async () => {
        await runChain(db, realMigrations);

        expect(await appliedVersions(db)).toEqual(realMigrations.map(m => m.version));

        // Yedek servisinin taşıdığı tabloların hepsi gerçekten var mı: eksik
        // biri, geri yüklemede "şema okunamadı" ile patlardı.
        const tables = await tableNames(db);
        for (const table of [
            'currencies', 'categories', 'app_settings', 'exchange_rates', 'accounts',
            'budgets', 'saving_goals', 'transactions', 'transaction_budget_effects',
            'saving_goal_contributions', 'budget_categories', 'budget_daily_spent',
        ]) {
            expect(tables, `${table} tablosu oluşmadı`).toContain(table);
        }

        // Seeder'lar ilk kurulumda koştu mu — boş bir kategori/para birimi
        // listesiyle açılan uygulama pratikte kullanılamaz.
        expect(await count(db, 'currencies')).toBeGreaterThan(0);
        expect(await count(db, 'categories')).toBeGreaterThan(0);
    });

    it('sürüm numaraları benzersiz ve artan', async () => {
        const versions = realMigrations.map(m => m.version);

        expect(new Set(versions).size).toBe(versions.length);
        expect([...versions].sort((a, b) => a - b)).toEqual(versions);
    });

    it('eski sürümden yükseltmede mevcut kullanıcı verisi bozulmadan geçer', async () => {
        // Eski kurulum: o günün seeder'ı değil, BIRAKTIĞI veri canlandırılıyor.
        fake.seedersEnabled = false;
        await runChain(db, upTo(18));
        await seedLegacyData(db);
        fake.seedersEnabled = true;

        const currenciesBefore = await count(db, 'currencies');
        const categoriesBefore = await count(db, 'categories');

        // Kullanıcı uygulamayı güncelliyor: kalan zincir eldeki verinin
        // üstünden geçiyor.
        await runChain(db, realMigrations);

        expect(await appliedVersions(db)).toEqual(realMigrations.map(m => m.version));

        // Hiçbir satır kaybolmadı. (`toBeGreaterThanOrEqual` değil: yükseltme
        // satır SİLMEMELİ, backfill dışında satır da EKLEMEMELİ.)
        expect(await count(db, 'currencies')).toBe(currenciesBefore);
        expect(await count(db, 'categories')).toBe(categoriesBefore);
        expect(await count(db, 'accounts')).toBe(1);
        expect(await count(db, 'transactions')).toBe(1);

        // Parasal değerler birebir korunmalı: 020 `minor_unit` ekliyor ve 021
        // tutarlara trigger takıyor; ikisinden biri tutarı yeniden ölçeklese
        // kullanıcının bakiyesi sessizce değişirdi.
        const { rows: accounts } = await db.query(
            'SELECT balance, name FROM accounts WHERE id = ?', ['acc-legacy'],
        );
        expect(accounts[0]).toMatchObject({ balance: 1250.75, name: 'Eski Cüzdan' });

        const { rows: transactions } = await db.query(
            'SELECT amount, title FROM transactions WHERE id = ?', ['txn-legacy'],
        );
        expect(transactions[0]).toMatchObject({ amount: 249.9, title: 'Eski Harcama' });

        // 026 boşluklu damgayı ISO 8601'e çevirmeli; çeviremediğinde satırı
        // NULL'a düşürmek `resolveTimestamps`'i her okumada patlatırdı.
        const { rows: stamps } = await db.query(
            'SELECT created_at, updated_at FROM accounts WHERE id = ?', ['acc-legacy'],
        );
        expect(String(stamps[0].created_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(String(stamps[0].updated_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('seeder\'lar dolu bir veritabanında idempotent', async () => {
        await runChain(db, realMigrations);

        const currencies = await count(db, 'currencies');
        const categories = await count(db, 'categories');

        // `bootstrapPersistence` seeder'ları HER açılışta çağırıyor (main.ts),
        // yalnızca ilk kurulumda değil. İdempotent olmasalardı kullanıcının
        // kategori listesi her açılışta bir kat daha büyürdü.
        await new RealSeederManager(db).runAll();
        await new RealSeederManager(db).runAll();

        expect(await count(db, 'currencies')).toBe(currencies);
        expect(await count(db, 'categories')).toBe(categories);
    });
});

/**
 * Geri-sürüm (downgrade) koruması.
 *
 * Eskiden `runMigrations()` yalnızca ileri yönde filtreliyordu: diskteki
 * BİLİNMEYEN bir üst sürüm hiçbir filtreye takılmıyor, runner "uygulanacak bir
 * şey yok" deyip geçiyor ve uygulama tanımadığı şemanın üstüne yazmaya
 * başlıyordu. Sessiz olduğu için en tehlikelisi buydu.
 */
describe('Şema geri-sürüm koruması', () => {
    let db: SqlJsTestAdapter;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        fake.migrations = [];
        fake.seedersEnabled = true;
    });

    it('diskteki şema build\'in bildiğinden yeniyse açılış durur', async () => {
        await runChain(db, realMigrations);

        // Kullanıcı eski bir build'e döndü (internal testing kanalı, sideload).
        fake.migrations = upTo(realMigrations.length - 2);
        const manager = new MigrationManager(db);

        await expect(manager.runMigrations()).rejects.toBeInstanceOf(SchemaTooNewError);
    });

    it('durduğunda hangi sürümlerin karşılaştığını taşır', async () => {
        await runChain(db, realMigrations);

        const supported = realMigrations[realMigrations.length - 3].version;
        fake.migrations = upTo(realMigrations.length - 2);

        const error = await new MigrationManager(db).runMigrations().catch(e => e);

        expect(error).toBeInstanceOf(SchemaTooNewError);
        expect(error.onDiskVersion).toBe(realMigrations[realMigrations.length - 1].version);
        expect(error.supportedVersion).toBe(supported);
    });

    it('eşit sürümde geçer: bilinen şema engellenmez', async () => {
        await runChain(db, realMigrations);

        await expect(runChain(db, realMigrations)).resolves.toBeUndefined();
    });
});
