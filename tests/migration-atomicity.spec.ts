import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseAdapter } from '@/domain';
import { SqlJsTestAdapter } from './helpers/sqljs-adapter';

/**
 * `MigrationManager` migration listesini modül seviyesinde import ediyor;
 * atomikliği gerçekten sınamak için listeyi sahte migration'larla değiştiriyoruz.
 */
const fake = vi.hoisted(() => ({
    migrations: [] as {
        version: number;
        name: string;
        up(db: DatabaseAdapter): Promise<void>;
        down(db: DatabaseAdapter): Promise<void>;
    }[],
    seederRan: false,
}));

vi.mock('@/infrastructure/database/migrations', () => ({
    get migrations() { return fake.migrations; },
}));

vi.mock('@/infrastructure/database/seeders/seeder-manager', () => ({
    SeederManager: class {
        async runAll() { fake.seederRan = true; }
    },
}));

const { MigrationManager } = await import('@/infrastructure/database/migrations/migration-manager');

async function tableExists(db: SqlJsTestAdapter, name: string): Promise<boolean> {
    const { rows } = await db.query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [name]
    );
    return rows.length > 0;
}

async function appliedVersions(db: SqlJsTestAdapter): Promise<number[]> {
    const { rows } = await db.query('SELECT version FROM migrations ORDER BY version');
    return rows.map(r => Number(r.version));
}

describe('Migration atomikliği', () => {
    let db: SqlJsTestAdapter;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        fake.migrations = [];
        fake.seederRan = false;
    });

    it('yarıda patlayan migration hiçbir DDL bırakmaz', async () => {
        fake.migrations = [{
            version: 1,
            name: 'patlayan',
            async up(d) {
                await d.execute('CREATE TABLE ilk (id TEXT PRIMARY KEY)');
                await d.execute('CREATE TABLE ikinci (id TEXT PRIMARY KEY)');
                throw new Error('migration ortasında patladı');
            },
            async down() {},
        }];

        await expect(new MigrationManager(db).runMigrations())
            .rejects.toThrow('migration ortasında patladı');

        // Sınır olmadan `ilk` ve `ikinci` şemada kalıyordu; sonraki açılış
        // migration'ı baştan çalıştırıp "table already exists" ile takılırdı.
        expect(await tableExists(db, 'ilk')).toBe(false);
        expect(await tableExists(db, 'ikinci')).toBe(false);
        expect(await appliedVersions(db)).toEqual([]);
    });

    it('patlayan migration kendinden öncekileri geri almaz', async () => {
        fake.migrations = [
            {
                version: 1,
                name: 'saglam',
                async up(d) { await d.execute('CREATE TABLE saglam (id TEXT PRIMARY KEY)'); },
                async down() {},
            },
            {
                version: 2,
                name: 'patlayan',
                async up(d) {
                    await d.execute('CREATE TABLE yarim (id TEXT PRIMARY KEY)');
                    throw new Error('ikinci patladı');
                },
                async down() {},
            },
        ];

        await expect(new MigrationManager(db).runMigrations()).rejects.toThrow('ikinci patladı');

        // Sınır migration BAŞINA: başarılı olan kalıcı, patlayan tamamen geri alınır.
        expect(await tableExists(db, 'saglam')).toBe(true);
        expect(await tableExists(db, 'yarim')).toBe(false);
        expect(await appliedVersions(db)).toEqual([1]);
    });

    it('yeniden çalıştırma yarım kalan migration için temiz devam eder', async () => {
        let ilkDeneme = true;

        fake.migrations = [{
            version: 1,
            name: 'ilk-denemede-patlar',
            async up(d) {
                await d.execute('CREATE TABLE hedef (id TEXT PRIMARY KEY)');
                if (ilkDeneme) {
                    ilkDeneme = false;
                    throw new Error('ilk deneme patladı');
                }
            },
            async down() {},
        }];

        const manager = new MigrationManager(db);

        await expect(manager.runMigrations()).rejects.toThrow('ilk deneme patladı');
        // Eskiden burada "table hedef already exists" geliyordu.
        await expect(manager.runMigrations()).resolves.toBeUndefined();

        expect(await tableExists(db, 'hedef')).toBe(true);
        expect(await appliedVersions(db)).toEqual([1]);
    });

    it('başarılı çalıştırmada up ve kayıt birlikte kalıcı olur', async () => {
        fake.migrations = [{
            version: 1,
            name: 'saglam',
            async up(d) { await d.execute('CREATE TABLE saglam (id TEXT PRIMARY KEY)'); },
            async down() {},
        }];

        await new MigrationManager(db).runMigrations();

        expect(await tableExists(db, 'saglam')).toBe(true);
        expect(await appliedVersions(db)).toEqual([1]);
        expect(fake.seederRan).toBe(true);
        expect(await db.isTransactionActive()).toBe(false);
    });

    it('applied_at ISO 8601 yazılır', async () => {
        fake.migrations = [{
            version: 1,
            name: 'saglam',
            async up(d) { await d.execute('CREATE TABLE saglam (id TEXT PRIMARY KEY)'); },
            async down() {},
        }];

        await new MigrationManager(db).runMigrations();

        const { rows } = await db.query('SELECT applied_at FROM migrations WHERE version = 1');
        const appliedAt = String(rows[0].applied_at);

        // `DEFAULT CURRENT_TIMESTAMP` boşluklu format üretiyordu; projenin
        // kanonik formatı ISO 8601 (bkz. migration 026).
        expect(appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('rollback down ile kayıt silmeyi birlikte yapar', async () => {
        fake.migrations = [{
            version: 1,
            name: 'saglam',
            async up(d) { await d.execute('CREATE TABLE saglam (id TEXT PRIMARY KEY)'); },
            async down(d) {
                await d.execute('DROP TABLE saglam');
                throw new Error('down patladı');
            },
        }];

        const manager = new MigrationManager(db);
        await manager.runMigrations();

        await expect(manager.rollback(1)).rejects.toThrow('down patladı');

        // DROP geri alınır ve kayıt yerinde kalır: yarım geri alınmış durum yok.
        expect(await tableExists(db, 'saglam')).toBe(true);
        expect(await appliedVersions(db)).toEqual([1]);
    });
});
