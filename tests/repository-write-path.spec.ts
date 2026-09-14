import { beforeEach, describe, expect, it } from 'vitest';
import { AccountRepository } from '@/infrastructure/database/repositories/account-repository';
import { BaseRepository } from '@/infrastructure/database/repositories/base-repository';
import { Account, AccountProps } from '@/domain/entities/account';
import { Money } from '@/domain/value-objects/money';
import { Icon } from '@/domain/value-objects/icon';
import { SqlJsTestAdapter } from './helpers/sqljs-adapter';

/** 005_create_accounts_table + 020_add_currency_minor_units (FK'siz izole kopya). */
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

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
const UPDATED_AT = new Date('2026-02-02T00:00:00.000Z');

function account(overrides: Partial<AccountProps> = {}): Account {
    return Account.reconstitute({
        id: 'acc-1',
        name: 'Vadesiz',
        type: 'bank',
        balance: Money.create(1500, 'try-id', 2),
        icon: Icon.create('wallet-outline', 'bg-blue-500'),
        isActive: true,
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
        ...overrides,
    });
}

/** Cast tanımlamayan repo: `_balance` (Money) convention pass'e düşer. */
class NoCastAccountRepository extends BaseRepository<Account> {
    protected readonly table = 'accounts';
    protected readonly entityClass = Account;
}

describe('BaseRepository write path (gerçek SQLite)', () => {
    let db: SqlJsTestAdapter;
    let repo: AccountRepository;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        await db.execute(ACCOUNTS_SCHEMA);
        repo = new AccountRepository(db);
    });

    it('save() yeni kaydı insert eder ve cast edilmiş alanları round-trip yapar', async () => {
        await repo.save(account({ notes: 'maaş hesabı' }));

        const loaded = await repo.findByIdOrFail('acc-1');

        expect(loaded.name).toBe('Vadesiz');
        expect(loaded.balance.amount).toBe(1500);
        expect(loaded.balance.currencyId).toBe('try-id');
        expect(loaded.icon.name).toBe('wallet-outline');
        expect(loaded.icon.color).toBe('bg-blue-500');
        expect(loaded.isActive).toBe(true);
        expect(loaded.notes).toBe('maaş hesabı');
        expect(loaded.createdAt?.toISOString()).toBe(CREATED_AT.toISOString());
    });

    it('ikinci save() aynı id için UPDATE eder, satır çoğalmaz', async () => {
        await repo.save(account());
        await repo.save(account({ name: 'Yeni ad', balance: Money.create(2500, 'try-id', 2) }));

        expect(await repo.count()).toBe(1);

        const loaded = await repo.findByIdOrFail('acc-1');
        expect(loaded.name).toBe('Yeni ad');
        expect(loaded.balance.amount).toBe(2500);
    });

    it('UPDATE created_at\'i korur, updated_at\'i entity\'den alır', async () => {
        await repo.save(account());

        const laterUpdate = new Date('2026-03-03T00:00:00.000Z');
        await repo.save(account({ name: 'Güncel', updatedAt: laterUpdate }));

        const loaded = await repo.findByIdOrFail('acc-1');
        expect(loaded.createdAt?.toISOString()).toBe(CREATED_AT.toISOString());
        expect(loaded.updatedAt?.toISOString()).toBe(laterUpdate.toISOString());
    });

    it('cast edilmemiş VO alanı sessizce yazılmaz, hata verir', async () => {
        const noCastRepo = new NoCastAccountRepository(db);

        await expect(noCastRepo.save(account())).rejects.toThrow(/SQL'e bind edilemez/);
    });

    it('boş id ile kayıt reddedilir', async () => {
        await expect(repo.save(account({ id: '' }))).rejects.toThrow(/boş 'id'/);
    });
});

describe('BaseRepository okunmuş kaydın yazması (gerçek SQLite)', () => {
    let db: SqlJsTestAdapter;
    let repo: AccountRepository;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        await db.execute(ACCOUNTS_SCHEMA);
        repo = new AccountRepository(db);

        await repo.save(account());
    });

    /** Çalıştırılan SQL'i kaydeder; hangi dalın seçildiği ancak buradan görülür. */
    function recordSql(): string[] {
        const executed: string[] = [];
        const run = db.run.bind(db);

        (db as any).run = async (sql: string, params?: unknown[]) => {
            executed.push(sql);
            return run(sql, params);
        };

        return executed;
    }

    it('okunmuş kaydın güncellemesi düz UPDATE üretir', async () => {
        const loaded = await repo.findByIdOrFail('acc-1');
        loaded.rename('Güncel');

        const executed = recordSql();
        await repo.save(loaded);

        // Eskiden bu da `INSERT ... ON CONFLICT DO UPDATE` idi: log'da yeni kayıt
        // ekleniyormuş gibi görünüyordu ve satır silinmişse gerçekten ekliyordu.
        expect(executed.some(sql => sql.startsWith('UPDATE'))).toBe(true);
        expect(executed.some(sql => sql.startsWith('INSERT'))).toBe(false);

        expect((await repo.findByIdOrFail('acc-1')).name).toBe('Güncel');
    });

    it('satırı silinmiş kaydı geri diriltmez', async () => {
        const loaded = await repo.findByIdOrFail('acc-1');
        await repo.delete('acc-1');

        loaded.rename('Hayalet');
        await expect(repo.save(loaded)).rejects.toThrow(/not found/i);

        expect(await repo.count()).toBe(0);
    });

    it('saveMany satırı silinmiş kaydı sessizce atlamaz', async () => {
        const loaded = await repo.findByIdOrFail('acc-1');
        await repo.delete('acc-1');

        loaded.rename('Hayalet');
        await expect(repo.saveMany([loaded])).rejects.toThrow(/not found/i);

        expect(await repo.count()).toBe(0);
    });

    it('okunmamış entity yeni satır yaratmayı sürdürür', async () => {
        const executed = recordSql();
        await repo.save(account({ id: 'acc-2', name: 'İkinci' }));

        expect(executed.some(sql => sql.startsWith('INSERT'))).toBe(true);
        expect(await repo.count()).toBe(2);
    });

    it('okunmuş kayıt art arda iki kez güncellenebilir', async () => {
        const loaded = await repo.findByIdOrFail('acc-1');

        loaded.deposit(Money.create(100, 'try-id', 2));
        await repo.save(loaded);

        loaded.deposit(Money.create(50, 'try-id', 2));
        await repo.save(loaded);

        const reloaded = await repo.findByIdOrFail('acc-1');
        expect(reloaded.balance.amount).toBe(1650);
        expect(reloaded.createdAt?.toISOString()).toBe(CREATED_AT.toISOString());
    });
});

describe('BaseRepository query building (gerçek SQLite)', () => {
    let db: SqlJsTestAdapter;
    let repo: AccountRepository;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        await db.execute(ACCOUNTS_SCHEMA);
        repo = new AccountRepository(db);

        await repo.save(account({ id: 'a', name: '50% indirim' }));
        await repo.save(account({ id: 'b', name: 'Birikim' }));
        await repo.save(account({ id: 'c', name: 'Kredi', type: 'credit', isActive: false }));
    });

    it('offset, limit verilmeden de uygulanır', async () => {
        const all = await repo.find({}, { orderBy: 'id', direction: 'ASC' });
        const skipped = await repo.find({}, { orderBy: 'id', direction: 'ASC', offset: 1 });

        expect(all.map(a => a.id)).toEqual(['a', 'b', 'c']);
        expect(skipped.map(a => a.id)).toEqual(['b', 'c']);
    });

    it('çok kolonlu ORDER BY deterministik sıra üretir', async () => {
        const rows = await repo.find({}, {
            orderBy: [
                { column: 'type', direction: 'ASC' },
                { column: 'id', direction: 'DESC' },
            ],
        });

        expect(rows.map(a => a.id)).toEqual(['b', 'a', 'c']);
    });

    it('limit üst sınırı aşılırsa sessizce kırpmaz, hata verir', async () => {
        await expect(repo.find({}, { limit: 5000 })).rejects.toThrow(/üst sınırı/);
    });

    it('$or dalları OR ile birleşir', async () => {
        const rows = await repo.find(
            { $or: [{ id: 'a' }, { type: 'credit' }] },
            { orderBy: 'id', direction: 'ASC' }
        );

        expect(rows.map(a => a.id)).toEqual(['a', 'c']);
    });

    it('contains, kullanıcı girdisindeki % karakterini wildcard saymaz', async () => {
        const literal = await repo.find({ name: { contains: '50%' } });
        const wildcardish = await repo.find({ name: { contains: '%' } });

        expect(literal.map(a => a.id)).toEqual(['a']);
        // '%' literal arandığı için yalnızca adında gerçekten '%' geçen kayıt döner.
        expect(wildcardish.map(a => a.id)).toEqual(['a']);
    });

    it('boş filtre objesi sessizce tüm tabloyu döndürmez', async () => {
        await expect(repo.find({ type: {} })).rejects.toThrow(/boş filtre objesi/);
    });

    it('paginate sayfa, toplam ve hasNext bilgisini tek where\'den üretir', async () => {
        const first = await repo.paginate({}, { orderBy: 'id', direction: 'ASC', limit: 2 });

        expect(first.data.map(a => a.id)).toEqual(['a', 'b']);
        expect(first.total).toBe(3);
        expect(first.offset).toBe(0);
        expect(first.hasNext).toBe(true);

        const last = await repo.paginate({}, { orderBy: 'id', direction: 'ASC', limit: 2, offset: 2 });

        expect(last.data.map(a => a.id)).toEqual(['c']);
        expect(last.total).toBe(3);
        expect(last.hasNext).toBe(false);
    });

    it('paginate filtreyi hem sayfaya hem toplama uygular', async () => {
        const page = await repo.paginate({ isActive: true }, { orderBy: 'id', direction: 'ASC', limit: 10 });

        expect(page.data.map(a => a.id)).toEqual(['a', 'b']);
        expect(page.total).toBe(2);
        expect(page.hasNext).toBe(false);
    });

    it('sum, currency filtresi olmadan money kolonunu toplamayı reddeder', async () => {
        await expect(repo.sum('balance', { isActive: true })).rejects.toThrow(/para birimine bağlı/);
        await expect(repo.sum('balance', { isActive: true, currencyId: 'try-id' })).resolves.toBe(3000);
    });

    it('currency guard, birden fazla para birimi seçen operatörle aşılamaz', async () => {
        // Operatör objesi "null değil" diye pinlenmiş sayılıyordu; TRY ve USD
        // bakiyeleri tek sayıya toplanıyordu.
        await expect(repo.sum('balance', { currencyId: { in: ['try-id', 'usd-id'] } }))
            .rejects.toThrow(/para birimine bağlı/);
        await expect(repo.sum('balance', { currencyId: { neq: 'usd-id' } }))
            .rejects.toThrow(/para birimine bağlı/);
        await expect(repo.sum('balance', { currencyId: [] }))
            .rejects.toThrow(/para birimine bağlı/);

        // Tek değere sabitleyen biçimler geçerli (üç hesabın tamamı try-id).
        await expect(repo.sum('balance', { currencyId: { eq: 'try-id' } })).resolves.toBe(4500);
        await expect(repo.sum('balance', { currencyId: { in: ['try-id'] } })).resolves.toBe(4500);
    });

    it('bütün operatör değerleri undefined ise filtre sessizce düşmez', async () => {
        await expect(repo.find({ name: { eq: undefined } })).rejects.toThrow(/undefined/);
        await expect(repo.count({ type: { in: undefined } })).rejects.toThrow(/undefined/);
    });

    it('IN listesindeki null, satırları sessizce elemez', async () => {
        await repo.save(account({ id: 'd', name: 'Notsuz', notes: undefined }));

        const rows = await repo.find({ notes: [null as any, 'yok'] });

        expect(rows.map(a => a.id)).toContain('d');
    });

    it('şemada olmayan kolon, ham SQLite hatası yerine anlaşılır hata verir', async () => {
        await expect(repo.find({ nonExistentColumn: 1 } as any))
            .rejects.toThrow(/böyle bir kolon yok/);
    });

    it('orderBy yönü açıkça verilmeli', async () => {
        await expect(repo.find({}, { orderBy: 'name' } as any))
            .rejects.toThrow(/'direction' zorunlu/);
    });

    it('paginate sıralamasız çağrılamaz', async () => {
        await expect(repo.paginate({}, { limit: 2 } as any))
            .rejects.toThrow(/sıralama gerektirir/);
    });

    it('like operatörü string dışı değeri sessizce stringe çevirmez', async () => {
        await expect(repo.find({ name: { contains: {} as any } }))
            .rejects.toThrow(/string bekliyor/);
    });
});

describe('BaseRepository silme koruması (gerçek SQLite)', () => {
    let db: SqlJsTestAdapter;
    let repo: AccountRepository;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        await db.execute(ACCOUNTS_SCHEMA);
        repo = new AccountRepository(db);

        await repo.save(account({ id: 'a' }));
        await repo.save(account({ id: 'b' }));
    });

    it('her satırı kapsayan koşulla toplu silme reddedilir', async () => {
        // `notIn: []` → `1 = 1`; guard koşul *sayısına* baktığı için geçiyor ve
        // bütün tabloyu siliyordu.
        await expect(repo.deleteMany({ id: { notIn: [] } }))
            .rejects.toThrow(/seçici koşul yok/);

        expect(await repo.count()).toBe(2);
    });

    it('$or dalındaki tautoloji de silmeyi genişletemez', async () => {
        await expect(repo.deleteMany({ $or: [{ id: { notIn: [] } }, { id: 'a' }] }))
            .rejects.toThrow(/seçici koşul yok/);

        expect(await repo.count()).toBe(2);
    });

    it('tautoloji yanında seçici koşul varsa silme çalışır', async () => {
        const deleted = await repo.deleteMany({ id: 'a', type: { notIn: [] } });

        expect(deleted).toBe(1);
        expect(await repo.count()).toBe(1);
    });

    it('truncate açık onay ister', async () => {
        await expect(repo.truncate({} as any)).rejects.toThrow(/confirm: true/);
        expect(await repo.count()).toBe(2);

        await repo.truncate({ confirm: true });
        expect(await repo.count()).toBe(0);
    });
});

describe('BaseRepository yazma doğrulaması (gerçek SQLite)', () => {
    let db: SqlJsTestAdapter;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        await db.execute(ACCOUNTS_SCHEMA);
    });

    it('tabloda karşılığı olan ama row\'da üretilmeyen kolon reddedilir', async () => {
        // `notes` transient sayılırsa hiç yazılmaz; UPSERT o kolonu güncellemez
        // ve DB\'deki eski değer sessizce kalırdı.
        class DroppingNotesRepository extends AccountRepository {
            protected readonly transientFields = ['notes'] as const;
        }

        await expect(new DroppingNotesRepository(db).save(account()))
            .rejects.toThrow(/kolonunu üretmedi/);
    });

    it('entity\'deki public alan sessizce düşmez', async () => {
        const repo = new AccountRepository(db);
        const withPublicField: any = account();
        withPublicField.extraField = 'kaybolmamalı';

        await expect(repo.save(withPublicField)).rejects.toThrow(/'_' ile başlamıyor/);
    });

    it('saveMany tek batch\'te yazar', async () => {
        const repo = new AccountRepository(db);

        await repo.saveMany([
            account({ id: 'm1', name: 'Bir' }),
            account({ id: 'm2', name: 'İki' }),
        ]);

        expect(await repo.count()).toBe(2);
        expect((await repo.findByIdOrFail('m2')).name).toBe('İki');
    });
});
