import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrations } from '@/infrastructure/database/migrations';
import { AccountRepository } from '@/infrastructure/database/repositories/account-repository';
import { BudgetRepository } from '@/infrastructure/database/repositories/budget-repository';
import { CategoryRepository } from '@/infrastructure/database/repositories/category-repository';
import { CurrencyRepository } from '@/infrastructure/database/repositories/currency-repository';
import { BaseRepository } from '@/infrastructure/database/repositories/base-repository';
import { BooleanCast, Cast, IconCast, MoneyCast } from '@/infrastructure/database/repositories/casts';
import { Account, AccountProps } from '@/domain/entities/account';
import { Budget } from '@/domain/entities/budget';
import { Category } from '@/domain/entities/category';
import { Currency } from '@/domain/entities/currency';
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

describe('Aynı kolona iki kaynak yazması', () => {
    /** `name` cast'i IconCast'in sahip olduğu `color` kolonuna da yazıyor. */
    class CollidingRepository extends BaseRepository<Account> {
        protected readonly table = 'accounts';
        protected readonly entityClass = Account;
        protected readonly casts: Record<string, Cast<any>> = {
            balance: MoneyCast('balance', 'currency_id', 'TRY', 'minor_unit'),
            icon: IconCast('icon', 'color'),
            isActive: BooleanCast('is_active', true),
            name: {
                columns: ['name', 'color'],
                get: (row) => row.name,
                set: (v: string) => ({ name: v, color: 'çakışan-değer' }),
            },
        };
    }

    it('farklı değer yazan iki cast sessizce birbirini ezmez', async () => {
        const db = await SqlJsTestAdapter.create();
        await db.execute(ACCOUNTS_SCHEMA);

        // Eskiden `Object.assign` sırası kazanıyor, kaybeden değer yok oluyordu.
        await expect(new CollidingRepository(db).save(account()))
            .rejects.toThrow(/'color' kolonuna .* farklı değer/);
    });

    it('aynı değeri yazan iki kaynak sorun değil', async () => {
        // BudgetRepository gerçek hayatta böyle: `_currencyId` alanı ile
        // amount/spentAmount MoneyCast'leri aynı `currency_id` kolonunu yazar.
        const db = await SqlJsTestAdapter.create();
        await db.execute(ACCOUNTS_SCHEMA);

        await expect(new AccountRepository(db).save(account())).resolves.toBeUndefined();
    });
});

describe('Lost update koruması', () => {
    let db: SqlJsTestAdapter;
    let repo: AccountRepository;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        await db.execute(ACCOUNTS_SCHEMA);
        repo = new AccountRepository(db);
    });

    it('daha eski sürüm yeniyi ezemez', async () => {
        await repo.save(account({ name: 'Güncel', updatedAt: new Date('2026-03-03T00:00:00.000Z') }));

        await expect(repo.save(account({ name: 'Eski', updatedAt: UPDATED_AT })))
            .rejects.toThrow(/eski/);

        expect((await repo.findByIdOrFail('acc-1')).name).toBe('Güncel');
    });

    it('aynı updated_at ile tekrar kaydetmek engellenmez', async () => {
        await repo.save(account({ name: 'İlk' }));

        // `touch()` çağırmadan aynı entity'yi tekrar kaydetmek meşru bir akış.
        await expect(repo.save(account({ name: 'İkinci' }))).resolves.toBeUndefined();
        expect((await repo.findByIdOrFail('acc-1')).name).toBe('İkinci');
    });

    it('aynı kaydı iki yerden okuyup ikisini de yazmak sessizce kaybolmaz', async () => {
        await repo.save(account({ balance: Money.create(1000, 'try-id', 2) }));

        const copyA = await repo.findByIdOrFail('acc-1');
        const copyB = await repo.findByIdOrFail('acc-1');

        copyA.deposit(Money.create(100, 'try-id', 2));
        await repo.save(copyA);
        expect((await repo.findByIdOrFail('acc-1')).balance.amount).toBe(1100);

        // B, A'nın yazmasından habersiz. Eskiden guard `excluded.updated_at >=
        // tablo.updated_at` karşılaştırdığı için B'nin `touch()` ile tazelenmiş
        // damgası hep geçiyor ve A'nın +100'ü sessizce yok oluyordu (1050).
        copyB.deposit(Money.create(50, 'try-id', 2));
        await expect(repo.save(copyB)).rejects.toThrow(/eski/);

        expect((await repo.findByIdOrFail('acc-1')).balance.amount).toBe(1100);
    });

    it('okunan entity ardışık iki kez kaydedilebilir', async () => {
        await repo.save(account({ balance: Money.create(1000, 'try-id', 2) }));

        const loaded = await repo.findByIdOrFail('acc-1');

        loaded.deposit(Money.create(10, 'try-id', 2));
        await repo.save(loaded);

        // Yazılan sürüm entity'nin yeni "okunmuş sürümü" sayılmazsa guard hâlâ
        // ilk okunan damgayı arar ve bu meşru akış yanlışlıkla patlardı.
        loaded.deposit(Money.create(5, 'try-id', 2));
        await expect(repo.save(loaded)).resolves.toBeUndefined();

        expect((await repo.findByIdOrFail('acc-1')).balance.amount).toBe(1015);
    });

    it('saveMany sonrası entity tekrar kaydedilebilir', async () => {
        await repo.save(account({ id: 'acc-1' }));

        const loaded = await repo.findByIdOrFail('acc-1');
        loaded.rename('Toplu');
        await repo.saveMany([loaded]);

        loaded.rename('Tekil');
        await expect(repo.save(loaded)).resolves.toBeUndefined();

        expect((await repo.findByIdOrFail('acc-1')).name).toBe('Tekil');
    });

    it('saveMany eskimiş yazmayı sessizce yutmaz', async () => {
        await repo.save(account({ id: 'acc-1' }));

        const copyA = await repo.findByIdOrFail('acc-1');
        const copyB = await repo.findByIdOrFail('acc-1');

        copyA.rename('A yazdı');
        await repo.save(copyA);

        // `executeBatch` satır sayısı döndürmüyor: guard B'nin yazmasını
        // engelliyordu ama `saveMany` yine de başarıyla dönüyor, çağıran
        // kaydettiğini sanıyordu.
        copyB.rename('B yazdı');
        await expect(repo.saveMany([copyB])).rejects.toThrow(/eski/);

        expect((await repo.findByIdOrFail('acc-1')).name).toBe('A yazdı');
    });

    it('saveMany doğrulaması patlarsa batch\'in tamamı geri alınır', async () => {
        await repo.save(account({ id: 'eski-kayit' }));
        const stale = await repo.findByIdOrFail('eski-kayit');

        const winner = await repo.findByIdOrFail('eski-kayit');
        winner.rename('Araya giren');
        await repo.save(winner);

        // Aynı batch'te bir eskimiş, bir tertemiz kayıt. Kısmi uygulama kalırsa
        // `yeni-kayit` yazılmış olurdu.
        stale.rename('Eskimiş');
        await expect(repo.saveMany([stale, account({ id: 'yeni-kayit' })]))
            .rejects.toThrow(/eski/);

        expect(await repo.findById('yeni-kayit')).toBeNull();
        expect((await repo.findByIdOrFail('eski-kayit')).name).toBe('Araya giren');
    });

    it('saveMany aynı id\'yi iki kez alırsa reddeder', async () => {
        // İkinci statement'ın guard'ı birincinin yazdığı sürümü göremez ve
        // sessizce atlanır: tek satıra iki farklı gerçek yazılamaz.
        await expect(repo.saveMany([account({ id: 'a', name: 'İlk' }), account({ id: 'a', name: 'İkinci' })]))
            .rejects.toThrow(/birden fazla kez/);

        expect(await repo.count()).toBe(0);
    });

    it('saveMany atlanmayan kayıtların sürüm damgasını bozmaz', async () => {
        const first = account({ id: 'a' });
        const second = account({ id: 'b' });

        await repo.saveMany([first, second]);

        first.rename('A2');
        second.rename('B2');
        await expect(repo.saveMany([first, second])).resolves.toBeUndefined();

        expect((await repo.findByIdOrFail('a')).name).toBe('A2');
        expect((await repo.findByIdOrFail('b')).name).toBe('B2');
    });
});

describe('Şema doğrulamasının kalıcı olarak kapanmaması', () => {
    it('tablo yokken yapılan ilk sorgu doğrulamayı devre dışı bırakmaz', async () => {
        const db = await SqlJsTestAdapter.create();
        const repo = new AccountRepository(db);

        // Tablo henüz yok: PRAGMA boş döner. Bu sonuç cache'lenirse kolon
        // doğrulaması bu instance'ın ömrü boyunca sessizce kapalı kalırdı.
        await expect(repo.count()).rejects.toThrow(/no such table/i);

        await db.execute(ACCOUNTS_SCHEMA);

        await expect(repo.find({ nonExistentColumn: 1 } as any))
            .rejects.toThrow(/böyle bir kolon yok/);
    });
});

describe('Sıralama garantileri', () => {
    let db: SqlJsTestAdapter;
    let repo: AccountRepository;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        await db.execute(ACCOUNTS_SCHEMA);
        repo = new AccountRepository(db);

        await repo.save(account({ id: 'c' }));
        await repo.save(account({ id: 'a' }));
        await repo.save(account({ id: 'b' }));
    });

    it('findOne sırasız LIMIT 1 atmaz, id ile tie-break uygular', async () => {
        const found = await repo.findOne({ isActive: true });

        expect(found?.id).toBe('a');
    });

    it('boş orderBy dizisi sessizce sırasız sorgu üretmez', async () => {
        await expect(repo.find({}, { orderBy: [] }))
            .rejects.toThrow(/orderBy boş dizi olamaz/);
    });

    it('yalnız offset verildiğinde de sıralama uygulanır', async () => {
        // Tie-break eskiden yalnızca `limit` varken ekleniyordu: `{ offset }`
        // `paginate`'in yasakladığı sırasız OFFSET sayfasını aynen üretiyordu.
        const page = await repo.find({}, { offset: 1 } as any);

        expect(page.map(row => row.id)).toEqual(['b', 'c']);
    });
});

describe('NULL taşıyan kolonlarda negatif filtreler', () => {
    let db: SqlJsTestAdapter;
    let repo: AccountRepository;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        await db.execute(ACCOUNTS_SCHEMA);
        repo = new AccountRepository(db);

        await repo.save(account({ id: 'notlu', notes: 'dolu' }));
        await repo.save(account({ id: 'notsuz', notes: undefined }));
    });

    // `col NOT IN ('dolu')` NULL satırlar için NULL (=false) üretir; "bu
    // değerlerden biri olmayan" diyen çağırana kolonu boş olan satır dönmüyordu.
    it('notIn NULL satırları sessizce elemez', async () => {
        const found = await repo.find({ notes: { notIn: ['dolu'] } });

        expect(found.map(row => row.id)).toEqual(['notsuz']);
    });

    it('neq NULL satırları sessizce elemez', async () => {
        const found = await repo.find({ notes: { neq: 'dolu' } });

        expect(found.map(row => row.id)).toEqual(['notsuz']);
    });

    it('notIn null açıkça listelenirse NULL satırlar da dışlanır', async () => {
        const found = await repo.find({ notes: { notIn: ['dolu', null] } });

        expect(found).toEqual([]);
    });

    it('eq/neq null karşılaştırması IS NULL / IS NOT NULL olur', async () => {
        expect((await repo.find({ notes: { eq: null } })).map(row => row.id)).toEqual(['notsuz']);
        expect((await repo.find({ notes: { neq: null } })).map(row => row.id)).toEqual(['notlu']);
    });

    it('sıralama operatörü null ile sessizce boş sonuç üretmez', async () => {
        await expect(repo.find({ notes: { gt: null } }))
            .rejects.toThrow(/null ile kullanılamaz/);
    });
});

describe('Money toplama guard\'ları', () => {
    let db: SqlJsTestAdapter;
    let repo: AccountRepository;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        await db.execute(ACCOUNTS_SCHEMA);
        repo = new AccountRepository(db);
    });

    it('farklı minor_unit taşıyan satırlar toplanmaz', async () => {
        await repo.save(account({ id: 'a', balance: Money.create(100, 'try-id', 2) }));
        await repo.save(account({ id: 'b', balance: Money.create(100, 'try-id', 0) }));

        // Para birimi pinlenmiş olsa da ölçekler farklı: 1,00 ile 100 aynı
        // sayıya toplanıyordu.
        await expect(repo.sum('balance', { currencyId: 'try-id' }))
            .rejects.toThrow(/aynı ölçekte değil/);
    });

    it('tek ölçekte toplama çalışır', async () => {
        await repo.save(account({ id: 'a', balance: Money.create(100, 'try-id', 2) }));
        await repo.save(account({ id: 'b', balance: Money.create(250, 'try-id', 2) }));

        await expect(repo.sum('balance', { currencyId: 'try-id' })).resolves.toBe(350);
    });

    it('$or dallarının hepsi aynı para birimini pinliyorsa toplama yapılabilir', async () => {
        await repo.save(account({ id: 'a', type: 'bank', balance: Money.create(100, 'try-id', 2) }));
        await repo.save(account({ id: 'b', type: 'cash', balance: Money.create(250, 'try-id', 2) }));

        // `$or` eskiden toptan atlanıyordu: para birimi her dalda sabit olsa
        // bile guard "pinlenmemiş" sayıp toplamayı reddediyordu.
        await expect(repo.sum('balance', {
            $or: [
                { currencyId: 'try-id', type: 'bank' },
                { currencyId: 'try-id', type: 'cash' },
            ],
        })).resolves.toBe(350);
    });

    it('$or dalları farklı para birimi pinliyorsa toplama reddedilir', async () => {
        await repo.save(account({ id: 'a', balance: Money.create(100, 'try-id', 2) }));
        await repo.save(account({ id: 'b', balance: Money.create(250, 'usd-id', 2) }));

        await expect(repo.sum('balance', {
            $or: [{ currencyId: 'try-id' }, { currencyId: 'usd-id' }],
        })).rejects.toThrow(/para birimine bağlı/);
    });
});

describe('NULL minor_unit taşıyan satırlarda toplama', () => {
    /** `minor_unit` nullable: repo dışı INSERT'ler ve eski migration'lar NULL bırakabiliyor. */
    const NULLABLE_MINOR_UNIT_SCHEMA = ACCOUNTS_SCHEMA.replace(
        'minor_unit INTEGER NOT NULL DEFAULT 2',
        'minor_unit INTEGER'
    );

    let db: SqlJsTestAdapter;
    let repo: AccountRepository;

    async function insertRaw(id: string, balance: number, minorUnit: number | null) {
        await db.run(
            `INSERT INTO accounts (id, currency_id, name, type, balance, color, icon,
                                   is_active, created_at, updated_at, minor_unit)
             VALUES (?, 'try-id', 'X', 'bank', ?, 'bg-blue-500', 'wallet-outline', 1,
                     '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', ?)`,
            [id, balance, minorUnit]
        );
    }

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        await db.execute(NULLABLE_MINOR_UNIT_SCHEMA);
        repo = new AccountRepository(db);
    });

    it('NULL ile farklı bir ölçek karışıksa toplama reddedilir', async () => {
        await insertRaw('bos', 100, null); // MoneyCast NULL'ı 2 okuyor
        await insertRaw('sifir', 100, 0);

        // `COUNT(DISTINCT minor_unit)` NULL'ları saymadığı için guard tek ölçek
        // görüyor, 1,00 TL ile 100 TL aynı sayıya toplanıyordu.
        await expect(repo.sum('balance', { currencyId: 'try-id' }))
            .rejects.toThrow(/aynı ölçekte değil/);
    });

    it('NULL ile örtük ölçek (2) aynı sayılır, toplama çalışır', async () => {
        await insertRaw('bos', 100, null);
        await insertRaw('iki', 250, 2);

        await expect(repo.sum('balance', { currencyId: 'try-id' })).resolves.toBe(350);
    });

    it('gruplu toplamada da NULL karışımı yakalanır', async () => {
        await insertRaw('bos', 100, null);
        await insertRaw('sifir', 100, 0);

        await expect(repo.sumGroupBy('balance', 'currencyId'))
            .rejects.toThrow(/aynı ölçekte değil/);
    });
});

describe('Silme ve identifier kaçışı', () => {
    let db: SqlJsTestAdapter;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
    });

    it('boş id ile silme sessizce "kayıt yok" demez', async () => {
        await db.execute(ACCOUNTS_SCHEMA);
        const repo = new AccountRepository(db);

        await expect(repo.delete('')).rejects.toThrow(/boş 'id'/);
    });

    it('rezerve kelime adı taşıyan kolon sorgulanabilir', async () => {
        await db.execute(`
            CREATE TABLE accounts (
                id TEXT PRIMARY KEY, currency_id TEXT NOT NULL, name TEXT NOT NULL,
                type TEXT NOT NULL, balance REAL NOT NULL DEFAULT 0, color TEXT NOT NULL,
                icon TEXT NOT NULL, notes TEXT, is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT, updated_at TEXT, minor_unit INTEGER NOT NULL DEFAULT 2,
                "order" INTEGER
            );
        `);

        class OrderedAccountRepository extends AccountRepository {
            protected readonly externalColumns = ['order'];
        }

        // Tırnaksız `WHERE order = ?` SQLite'ta syntax hatası veriyordu.
        await expect(new OrderedAccountRepository(db).find({ order: 1 } as any))
            .resolves.toEqual([]);
    });
});

describe('Koşul/parametre eşleşmesi', () => {
    let db: SqlJsTestAdapter;
    let repo: AccountRepository;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        await db.execute(ACCOUNTS_SCHEMA);
        repo = new AccountRepository(db);
    });

    it('$or kardeş koşullarla her iki sırada da doğru bağlanır', async () => {
        await repo.save(account({ id: 'a', name: 'X', type: 'cash' }));
        await repo.save(account({ id: 'b', name: 'Y', type: 'bank' }));
        await repo.save(account({ id: 'c', name: 'X', type: 'credit' }));

        const orFirst = await repo.find(
            { $or: [{ type: 'cash' }, { type: 'credit' }], name: 'X' },
            { orderBy: 'id', direction: 'ASC' }
        );
        const orLast = await repo.find(
            { name: 'X', $or: [{ type: 'cash' }, { type: 'credit' }] },
            { orderBy: 'id', direction: 'ASC' }
        );
        const nested = await repo.find(
            { $or: [{ $or: [{ id: 'a' }, { id: 'b' }] }, { type: 'credit' }] },
            { orderBy: 'id', direction: 'ASC' }
        );

        expect(orFirst.map(a => a.id)).toEqual(['a', 'c']);
        expect(orLast.map(a => a.id)).toEqual(['a', 'c']);
        expect(nested.map(a => a.id)).toEqual(['a', 'b', 'c']);
    });

    it('elenen tautoloji kalan koşulların parametrelerini kaydırmaz', async () => {
        await repo.save(account({ id: 'a', name: 'Sil' }));
        await repo.save(account({ id: 'b', name: 'Kalsın' }));

        const deleted = await repo.deleteMany({
            type: { notIn: [] },      // → 1 = 1, elenir
            name: 'Sil',              // parametreli
            id: { in: ['a', 'b'] },   // parametreli
        });

        expect(deleted).toBe(1);
        expect((await repo.findByIdOrFail('b')).name).toBe('Kalsın');
    });

    it('NOT NULL kolondaki isNull:false tabloyu boşaltamaz', async () => {
        await repo.save(account({ id: 'a' }));
        await repo.save(account({ id: 'b' }));

        // `"id" IS NOT NULL` metin olarak `1 = 1` değil, ama `id` PK olduğu için
        // bütün tabloyu kapsıyor: guard'ı geçip iki kaydı da siliyordu.
        await expect(repo.deleteMany({ id: { isNull: false } }))
            .rejects.toThrow(/Silme için seçici koşul yok/);

        expect(await repo.count()).toBe(2);
    });

    it('kapsayıcı koşul $or dalında da yakalanır', async () => {
        await repo.save(account({ id: 'a' }));

        await expect(repo.deleteMany({ $or: [{ id: { isNull: false } }, { id: 'a' }] }))
            .rejects.toThrow(/Silme için seçici koşul yok/);

        expect(await repo.count()).toBe(1);
    });

    it('nullable kolonda isNull:false hâlâ seçici sayılır', async () => {
        await repo.save(account({ id: 'notlu', notes: 'dolu' }));
        await repo.save(account({ id: 'notsuz', notes: undefined }));

        // `notes` NULL alabiliyor: koşul gerçekten daraltıyor, engellenmemeli.
        expect(await repo.deleteMany({ notes: { isNull: false } })).toBe(1);
        expect((await repo.findAll()).map(row => row.id)).toEqual(['notsuz']);
    });

    it('kapsayıcı koşul yanında seçici koşul varsa silme çalışır', async () => {
        await repo.save(account({ id: 'a', name: 'Sil' }));
        await repo.save(account({ id: 'b', name: 'Kalsın' }));

        expect(await repo.deleteMany({ id: { isNull: false }, name: 'Sil' })).toBe(1);
        expect((await repo.findByIdOrFail('b')).name).toBe('Kalsın');
    });

    it('deleteMany da SQLite parametre üst sınırını kontrol eder', async () => {
        const many = Array.from({ length: 600 }, (_, i) => `id-${i}`);

        await expect(repo.deleteMany({ id: many, name: many }))
            .rejects.toThrow(/parametre üretti/);
    });

    it('like operatörü ham deseni escape etmeden kullanır', async () => {
        await repo.save(account({ id: 'a', name: 'Vadesiz' }));
        await repo.save(account({ id: 'b', name: 'Vadeli' }));

        const prefix = await repo.find({ name: { like: 'Vade%' } }, { orderBy: 'id', direction: 'ASC' });
        const exact = await repo.find({ name: { like: 'Vadeli' } });

        expect(prefix.map(a => a.id)).toEqual(['a', 'b']);
        expect(exact.map(a => a.id)).toEqual(['b']);
    });
});

describe('paginate ve gruplama', () => {
    let db: SqlJsTestAdapter;
    let repo: AccountRepository;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        await db.execute(ACCOUNTS_SCHEMA);
        repo = new AccountRepository(db);
    });

    it('offset sonun ötesindeyken hasNext yanlış pozitif vermez', async () => {
        await repo.save(account({ id: 'a' }));
        await repo.save(account({ id: 'b' }));

        const page = await repo.paginate({}, {
            orderBy: 'id', direction: 'ASC', limit: 2, offset: 10,
        });

        expect(page.data).toEqual([]);
        expect(page.total).toBe(2);
        expect(page.hasNext).toBe(false);
    });

    it('sumGroupBy anahtarları grup kolonunun değerleri', async () => {
        await repo.save(account({ id: 'a', type: 'bank', balance: Money.create(100, 'try-id', 2) }));
        await repo.save(account({ id: 'b', type: 'cash', balance: Money.create(50, 'try-id', 2) }));
        await repo.save(account({ id: 'c', type: 'bank', balance: Money.create(25, 'usd-id', 2) }));

        expect(Object.fromEntries(await repo.getBalanceByCurrency()))
            .toEqual({ 'try-id': 150, 'usd-id': 25 });
        expect(Object.fromEntries(await repo.getBalanceByType('try-id')))
            .toEqual({ bank: 100, cash: 50 });
    });
});

describe('Transaction helper', () => {
    let db: SqlJsTestAdapter;
    let repo: AccountRepository;

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create();
        await db.execute(ACCOUNTS_SCHEMA);
        repo = new AccountRepository(db);
    });

    it('rollback sonrası repo yazmaya devam edebilir', async () => {
        await expect(
            (repo as any).transactional(async () => {
                await repo.save(account({ id: 'a' }));
                throw new Error('patla');
            })
        ).rejects.toThrow('patla');

        expect(await repo.count()).toBe(0);

        await repo.save(account({ id: 'b' }));
        expect(await repo.count()).toBe(1);
    });

    it('eşzamanlı iki transactional çağrısı ikinci BEGIN denemez', async () => {
        // İkisi de aynı anda BEGIN denerse adapter "transaction already active"
        // ile patlar; çağrılar kuyruğa girip sırayla kendi sınırlarını açar.
        await Promise.all([
            (repo as any).transactional(() => repo.save(account({ id: 'a' }))),
            (repo as any).transactional(() => repo.save(account({ id: 'b' }))),
        ]);

        expect(await repo.count()).toBe(2);
    });

    it('eşzamanlı çağrılardan biri patlarsa diğerinin yazdığı kalır', async () => {
        const [failed, succeeded] = await Promise.allSettled([
            (repo as any).transactional(async () => {
                await repo.save(account({ id: 'kotu' }));
                throw new Error('patla');
            }),
            (repo as any).transactional(() => repo.save(account({ id: 'iyi' }))),
        ]);

        expect(failed.status).toBe('rejected');
        expect(succeeded.status).toBe('fulfilled');

        // Eskiden ikinci çağrı birincinin transaction'ına katılıyordu: promise
        // başarıyla resolve oluyor ama rollback kaydı da siliyordu. Çağıran
        // yazdığını sanıyor, veri yok.
        expect(await repo.findById('iyi')).not.toBeNull();
        expect(await repo.findById('kotu')).toBeNull();
    });

    it('dışarıda açık transaction varsa ona katılır, ikinci BEGIN denemez', async () => {
        // UnitOfWork sınırı: repo kendi BEGIN'ini atarsa SQLite iç içe
        // transaction'ı reddeder. Test adapter'ı `isTransactionActive`
        // sunmadığı sürece bu yol hiç çalışmıyordu.
        await db.beginTransaction();

        await expect(
            (repo as any).transactional(() => repo.save(account({ id: 'a' })))
        ).resolves.toBeUndefined();

        await db.rollbackTransaction();

        // Sınırı dıştaki sahibi yönetir: rollback repo'nun yazdığını da alır.
        expect(await repo.count()).toBe(0);
    });
});

describe('Lost update guard\'ının kapsamı', () => {
    it('DB\'deki updated_at NULL ise yazma engellenmez', async () => {
        const db = await SqlJsTestAdapter.create();
        await db.execute(ACCOUNTS_SCHEMA);
        const repo = new AccountRepository(db);

        // Repo dışından yazılmış, updated_at'i olmayan satır.
        await db.run(
            `INSERT INTO accounts (id, currency_id, name, type, balance, color, icon,
                                   is_active, created_at, updated_at, minor_unit)
             VALUES ('acc-1','try-id','Eski','bank',10,'bg-blue-500','wallet-outline',1,?,NULL,2)`,
            [CREATED_AT.toISOString()]
        );

        await expect(repo.save(account({ name: 'Yeni' }))).resolves.toBeUndefined();
        expect((await repo.findByIdOrFail('acc-1')).name).toBe('Yeni');
    });
});

describe('Relation yükleyen repo bütün okuma yollarında tam hydrate olur', () => {
    let db: SqlJsTestAdapter;
    let budget: Budget;
    let categoryId: string;

    beforeAll(async () => {
        db = await SqlJsTestAdapter.create();
        for (const migration of migrations) {
            await migration.up(db);
        }

        await new CurrencyRepository(db).save(Currency.create({
            id: 'cur-try', name: 'Türk Lirası', code: 'TRY', symbol: '₺', country: 'TR',
        }));

        const icon = { name: 'wallet-outline', color: 'bg-blue-500' };

        const acc = Account.create({
            name: 'Bütçe hesabı', type: 'bank', currencyId: 'cur-try', balance: 5000, icon,
        });
        await new AccountRepository(db).save(acc);

        const category = Category.create({
            name: 'Gıda', type: 'expense', icon: icon.name, color: icon.color,
        });
        await new CategoryRepository(db).save(category);
        categoryId = category.id;

        budget = Budget.create({
            name: 'Aylık gıda',
            amount: 3000,
            accountId: acc.id,
            currencyId: 'cur-try',
            type: 'monthly',
            categoryIds: [category.id],
            startDate: new Date('2026-05-01T00:00:00.000Z'),
            icon,
        });
        await new BudgetRepository(db).save(budget);
    });

    // Bunlar eskiden `toDomain` üzerinden geçtiği için categoryIds boş dönüyordu:
    // hata yok, uyarı yok, sadece kategorisiz bütçe.
    it('find', async () => {
        const [loaded] = await new BudgetRepository(db).find({ id: budget.id });
        expect(loaded.categoryIds).toEqual([categoryId]);
    });

    it('findOne', async () => {
        const loaded = await new BudgetRepository(db).findOne({ id: budget.id });
        expect(loaded?.categoryIds).toEqual([categoryId]);
    });

    it('paginate', async () => {
        const page = await new BudgetRepository(db).paginate({}, {
            orderBy: 'createdAt', direction: 'DESC', limit: 10,
        });
        expect(page.data[0].categoryIds).toEqual([categoryId]);
    });

    it('findById', async () => {
        const loaded = await new BudgetRepository(db).findById(budget.id);
        expect(loaded?.categoryIds).toEqual([categoryId]);
    });
});

describe('Junction senkronizasyonu atomik', () => {
    it('ilişki yazımı patlarsa ana satır da yazılmaz', async () => {
        const db = await SqlJsTestAdapter.create();
        for (const migration of migrations) {
            await migration.up(db);
        }

        await new CurrencyRepository(db).save(Currency.create({
            id: 'cur-try', name: 'Türk Lirası', code: 'TRY', symbol: '₺', country: 'TR',
        }));

        const icon = { name: 'wallet-outline', color: 'bg-blue-500' };
        const acc = Account.create({
            name: 'Hesap', type: 'bank', currencyId: 'cur-try', balance: 100, icon,
        });
        await new AccountRepository(db).save(acc);

        const repo = new BudgetRepository(db);
        const budget = Budget.create({
            name: 'Kırık bütçe',
            amount: 500,
            accountId: acc.id,
            currencyId: 'cur-try',
            type: 'monthly',
            categoryIds: ['olmayan-kategori'], // budget_categories FK'sini ihlal eder
            startDate: new Date('2026-05-01T00:00:00.000Z'),
            icon,
        });

        // Hatanın gerçekten junction INSERT'inden geldiğini doğrula: ana satır
        // yazıldıktan *sonra* patlamazsa test boşuna geçerdi.
        await expect(repo.save(budget)).rejects.toThrow(/FOREIGN KEY constraint failed/i);

        // Eskiden `budgets` satırı yazılmış, yalnızca junction INSERT'i patlamıştı.
        expect(await repo.findById(budget.id)).toBeNull();
    });
});
