import { beforeEach, describe, expect, it } from 'vitest';
import { AccountRepository } from '@/infrastructure/database/repositories/account-repository';
import { SqliteUnitOfWork } from '@/infrastructure/database/unit-of-work';
import { Account, AccountProps } from '@/domain/entities/account';
import { Money } from '@/domain/value-objects/money';
import { Icon } from '@/domain/value-objects/icon';
import { SqlJsTestAdapter } from './helpers/sqljs-adapter';

const ACCOUNTS_SCHEMA = `
    CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        currency_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        balance REAL NOT NULL DEFAULT 0,
        color TEXT NOT NULL,
        icon TEXT NOT NULL,
        notes TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT,
        updated_at TEXT,
        minor_unit INTEGER NOT NULL DEFAULT 2
    );
`;

function account(overrides: Partial<AccountProps> = {}): Account {
    return Account.reconstitute({
        id: 'acc-1',
        name: 'Vadesiz',
        type: 'bank',
        balance: Money.create(1500, 'try-id', 2),
        icon: Icon.create('wallet-outline', 'bg-blue-500'),
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-02-02T00:00:00.000Z'),
        ...overrides,
    });
}

let db: SqlJsTestAdapter;
let repo: AccountRepository;

beforeEach(async () => {
    db = await SqlJsTestAdapter.create();
    await db.execute(ACCOUNTS_SCHEMA);
    repo = new AccountRepository(db);
});

/**
 * UnitOfWork ile repository'nin `transactional()` helper'ı eskiden **iki ayrı
 * kuyruk** kullanıyordu: ikisi de aynı bağlantı üzerinde BEGIN atmaya
 * çalışabiliyordu. Artık ikisi de adapter başına tekil `TransactionCoordinator`
 * üzerinden geçiyor.
 */
describe('UnitOfWork ↔ repository ortak transaction kuyruğu', () => {
    it('UoW ile repo sınırı aynı anda açılmaya çalışıldığında çakışmaz', async () => {
        const uow = new SqliteUnitOfWork(db);

        // Repo sınırı önce açılıyor ve bir süre açık kalıyor; UoW aynı anda
        // kendi sınırını istiyor. Eskiden ikinci BEGIN "cannot start a
        // transaction within a transaction" ile patlıyordu.
        const repoWork = (repo as any).transactional(async () => {
            await new Promise(resolve => setTimeout(resolve, 20));
            await repo.save(account({ id: 'repo' }));
        });

        const uowWork = uow.run(() => repo.save(account({ id: 'uow' })));

        await expect(Promise.all([repoWork, uowWork])).resolves.toBeDefined();
        expect(await repo.count()).toBe(2);
    });

    it('bağımsız iki UoW işi birbirinin rollback\'ine yakalanmaz', async () => {
        const uow = new SqliteUnitOfWork(db);

        const failing = uow.run(async () => {
            await repo.save(account({ id: 'kotu' }));
            await new Promise(resolve => setTimeout(resolve, 10));
            throw new Error('patla');
        });
        const succeeding = uow.run(() => repo.save(account({ id: 'iyi' })));

        await expect(failing).rejects.toThrow('patla');
        await succeeding;

        expect(await repo.findById('iyi')).not.toBeNull();
        expect(await repo.findById('kotu')).toBeNull();
    });

    it('tekil yazma açık bir sınırın ortasına düşmez', async () => {
        const order: string[] = [];

        const boundary = (repo as any).transactional(async () => {
            order.push('sinir-basladi');
            await new Promise(resolve => setTimeout(resolve, 20));
            order.push('sinir-bitti');
        });

        // Eskiden `saveMany` hiçbir kuyruğa girmiyor ve sırası
        // `sinir-basladi > saveMany > sinir-bitti` oluyordu: sınır rollback
        // etseydi batch sessizce kaybolurdu.
        const batch = repo.saveMany([account({ id: 'batch' })]).then(() => order.push('saveMany'));

        await Promise.all([boundary, batch]);

        expect(order).toEqual(['sinir-basladi', 'sinir-bitti', 'saveMany']);
    });

    it('rollback edilen yazmanın sürüm damgası geri alınır', async () => {
        const uow = new SqliteUnitOfWork(db);
        await repo.save(account({ id: 'v1' }));

        const loaded = (await repo.findById('v1'))!;
        loaded.rename('Yeni ad');

        await expect(uow.run(async () => {
            await repo.save(loaded);
            throw new Error('patla');
        })).rejects.toThrow('patla');

        // Damga geri alınmazsa entity DB'de hiç bulunmayan bir sürümü hatırlar
        // ve guard bu kaydı bir daha hiç yazdırmaz ("sürüm eski").
        loaded.rename('Tekrar dene');
        await expect(repo.save(loaded)).resolves.toBeUndefined();
        expect((await repo.findById('v1'))?.name).toBe('Tekrar dene');
    });
});

describe('Sıralama tie-break', () => {
    class OrderRepo extends AccountRepository {
        public clause(options: any): string {
            return (this as any).buildOrderLimitClause(options);
        }
    }

    it('orderBy verildiğinde de id ile tie-break uygulanır', async () => {
        const ordered = new OrderRepo(db);
        await ordered.count(); // şema cache'ini doldur

        expect(ordered.clause({ orderBy: 'name', direction: 'DESC', limit: 5 }))
            .toBe(' ORDER BY "name" DESC, "id" ASC LIMIT 5');
    });

    it('sıralamada id zaten varsa tekrarlanmaz', async () => {
        const ordered = new OrderRepo(db);
        await ordered.count();

        expect(ordered.clause({
            orderBy: [
                { column: 'name', direction: 'DESC' },
                { column: 'id', direction: 'DESC' },
            ],
        })).toBe(' ORDER BY "name" DESC, "id" DESC');
    });

    it('eşit sıralama anahtarında sayfalar kayıt tekrarlamaz', async () => {
        for (const id of ['a', 'b', 'c', 'd']) {
            await repo.save(account({ id, name: 'Aynı ad' }));
        }

        const first = await repo.paginate({}, { orderBy: 'name', direction: 'ASC', limit: 2, offset: 0 });
        const second = await repo.paginate({}, { orderBy: 'name', direction: 'ASC', limit: 2, offset: 2 });

        const ids = [...first.data, ...second.data].map(entity => entity.id);
        expect(new Set(ids).size).toBe(4);
    });
});

describe('NULL zaman damgası taşıyan satırlar', () => {
    async function insertRaw(id: string, createdAt: string | null, updatedAt: string | null) {
        await db.run(
            `INSERT INTO accounts (id, currency_id, name, type, balance, color, icon, is_active, created_at, updated_at, minor_unit)
             VALUES (?, 'try', 'X', 'bank', 10, 'bg-blue-500', 'wallet-outline', 1, ?, ?, 2)`,
            [id, createdAt, updatedAt]
        );
    }

    it('updated_at NULL ise created_at\'ten tamamlanır', async () => {
        await insertRaw('n1', '2026-01-01T00:00:00.000Z', null);

        const entity = await repo.findById('n1');

        expect(entity).not.toBeNull();
        expect(entity!.updatedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });

    it('created_at NULL ise updated_at\'ten tamamlanır', async () => {
        await insertRaw('n2', null, '2026-03-03T00:00:00.000Z');

        const entity = await repo.findById('n2');

        expect(entity!.createdAt?.toISOString()).toBe('2026-03-03T00:00:00.000Z');
    });

    it('tek NULL satır bütün listeyi düşürmez', async () => {
        await repo.save(account({ id: 'saglam' }));
        await insertRaw('n3', '2026-01-01T00:00:00.000Z', null);

        expect(await repo.findAll()).toHaveLength(2);
    });

    it('iki damga da NULL ise uydurulmaz, hata verilir', async () => {
        await insertRaw('n4', null, null);

        await expect(repo.findById('n4')).rejects.toThrow(/zaman damgası/);
    });
});

describe('insert() sürüm damgası bırakır', () => {
    class InsertRepo extends AccountRepository {
        public insertOnly(entity: Account): Promise<void> {
            return (this as any).insert(entity);
        }
    }

    it('insert edilen entity sonradan save edilebilir', async () => {
        const inserting = new InsertRepo(db);
        const entity = account({ id: 'i1' });

        await inserting.insertOnly(entity);
        entity.rename('Değişti');

        await expect(inserting.save(entity)).resolves.toBeUndefined();
        expect((await inserting.findById('i1'))?.name).toBe('Değişti');
    });
});

describe('IN listesi parametre sınırı', () => {
    it('null\'lar parametre bütçesinden düşülür', async () => {
        // 999 somut değer + null: eskiden dizi uzunluğu (1000) üzerinden
        // sayıldığı için reddediliyordu, oysa bind edilen parametre 999.
        const ids: (string | null)[] = Array.from({ length: 999 }, (_, i) => `id-${i}`);
        ids.push(null);

        await expect(repo.find({ id: ids })).resolves.toEqual([]);
    });
});

describe('executeBatch atomikliği (test adapter\'ı prod sözleşmesini taklit eder)', () => {
    it('batch ortasında patlarsa önceki satırlar da kalmaz', async () => {
        // İkinci statement geçersiz: prod adapter'ı batch'i kendi
        // transaction'ına sardığı için ilk INSERT de geri alınmalı.
        await expect(
            db.executeBatch([
                { sql: `INSERT INTO accounts (id, currency_id, name, type, balance, color, icon, is_active, minor_unit) VALUES ('b1','try','A','bank',1,'c','i',1,2)`, params: [] },
                { sql: `INSERT INTO accounts (id, bozuk_kolon) VALUES ('b2', 1)`, params: [] },
            ])
        ).rejects.toThrow();

        expect(await repo.count()).toBe(0);
    });
});
