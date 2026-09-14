import { describe, expect, it } from 'vitest'
import { SqliteUnitOfWork } from '@/infrastructure/database/unit-of-work'
import { migrations } from '@/infrastructure/database/migrations'
import {
    AccountRepository,
    BudgetRepository,
    CategoryRepository,
    CurrencyRepository,
} from '@/infrastructure/database/repositories'
import { Account } from '@/domain/entities/account'
import { Budget } from '@/domain/entities/budget'
import { Category } from '@/domain/entities/category'
import { Currency } from '@/domain/entities/currency'
import { SqlJsTestAdapter } from './helpers/sqljs-adapter'

/** begin/commit/rollback çağrılarını sırasıyla kaydeden sahte adapter. */
function fakeDb() {
    const calls: string[] = []

    return {
        calls,
        adapter: {
            async query() { return { rows: [] } },
            async run() { return { rows: [] } },
            async beginTransaction() { calls.push('begin') },
            async commitTransaction() { calls.push('commit') },
            async rollbackTransaction() { calls.push('rollback') },
        } as any,
    }
}

describe('SqliteUnitOfWork', () => {
    it('iç içe çağrıda sınırı en dıştaki run yönetir', async () => {
        const { calls, adapter } = fakeDb()
        const uow = new SqliteUnitOfWork(adapter)

        await uow.run(async () => {
            await uow.runNested(async () => {
                calls.push('inner')
            })
            calls.push('outer')
        })

        expect(calls).toEqual(['begin', 'inner', 'outer', 'commit'])
    })

    it('hata durumunda rollback eder ve hatayı yukarı taşır', async () => {
        const { calls, adapter } = fakeDb()
        const uow = new SqliteUnitOfWork(adapter)

        await expect(uow.run(async () => { throw new Error('patladı') })).rejects.toThrow('patladı')
        expect(calls).toEqual(['begin', 'rollback'])
    })

    it('eşzamanlı çağrılar iç içe geçmez, sıraya girer', async () => {
        const { calls, adapter } = fakeDb()
        const uow = new SqliteUnitOfWork(adapter)

        await Promise.all([
            uow.run(async () => {
                // Diğer işin araya girebilmesi için bir mikro-görev bekle.
                await Promise.resolve()
                calls.push('iş-1')
            }),
            uow.run(async () => {
                calls.push('iş-2')
            }),
        ])

        // İkinci iş, birincinin commit'inden sonra kendi transaction'ını açar.
        expect(calls).toEqual(['begin', 'iş-1', 'commit', 'begin', 'iş-2', 'commit'])
    })

    it('ilk callback başladıktan sonra gelen bağımsız çağrıyı da sıraya alır', async () => {
        const { calls, adapter } = fakeDb()
        const uow = new SqliteUnitOfWork(adapter)
        let release!: () => void
        const gate = new Promise<void>(resolve => { release = resolve })

        const first = uow.run(async () => {
            calls.push('iş-1-başladı')
            await gate
            calls.push('iş-1-bitti')
        })

        await Promise.resolve()
        const second = uow.run(async () => { calls.push('iş-2') })
        release()
        await Promise.all([first, second])

        expect(calls).toEqual([
            'begin',
            'iş-1-başladı',
            'iş-1-bitti',
            'commit',
            'begin',
            'iş-2',
            'commit',
        ])
    })

    it('bir iş patlasa da kuyruktaki sonraki iş çalışır', async () => {
        const { calls, adapter } = fakeDb()
        const uow = new SqliteUnitOfWork(adapter)

        const failing = uow.run(async () => { throw new Error('patladı') })
        const following = uow.run(async () => { calls.push('iş-2') })

        await expect(failing).rejects.toThrow('patladı')
        await following

        expect(calls).toEqual(['begin', 'rollback', 'begin', 'iş-2', 'commit'])
    })

    it('çoklu okumayı bekleyen yazmadan sonra bölünmeden çalıştırır', async () => {
        const { calls, adapter } = fakeDb()
        const uow = new SqliteUnitOfWork(adapter)
        let release!: () => void
        const gate = new Promise<void>(resolve => { release = resolve })

        const write = uow.run(async () => {
            calls.push('write-start')
            await gate
            calls.push('write-end')
        })
        await Promise.resolve()

        const read = uow.read(async () => {
            calls.push('read-query-1')
            await Promise.resolve()
            calls.push('read-query-2')
        })

        release()
        await Promise.all([write, read])

        // Okuma bekleyen yazmadan SONRA başlar ve iki sorgusu bitişik kalır.
        // Okumanın etrafında `begin`/`commit` YOK: salt okuma için transaction
        // açmak SQLite yazma kilidini tutup bütün yazmaları bekletiyordu.
        // Bölünmezliği artık transaction değil koordinatör kuyruğu sağlıyor.
        expect(calls).toEqual([
            'begin',
            'write-start',
            'write-end',
            'commit',
            'read-query-1',
            'read-query-2',
        ])
    })

    it('okuma grubu transaction açmaz', async () => {
        const { calls, adapter } = fakeDb()
        const uow = new SqliteUnitOfWork(adapter)

        await uow.read(async () => { calls.push('read') })

        expect(calls).toEqual(['read'])
    })

    /**
     * Bölünmezlik eskiden transaction'dan geliyordu; artık kuyruktan geliyor.
     * Bu yüzden "araya yazma giremez" ayrı ayrı doğrulanmalı: `readGroup`
     * yalnızca OKUMALARA yeniden giriş izni verir, yazmalar bayrağı görmez.
     */
    it('okuma grubunun ortasına bekleyen yazma giremez', async () => {
        const { calls, adapter } = fakeDb()
        const uow = new SqliteUnitOfWork(adapter)

        const read = uow.read(async () => {
            calls.push('read-query-1')
            // Grup sürerken bağımsız bir yazma sıraya girsin.
            void uow.run(async () => { calls.push('write') })
            await Promise.resolve()
            await Promise.resolve()
            calls.push('read-query-2')
        })

        await read
        await new Promise(resolve => setTimeout(resolve, 0))

        expect(calls.slice(0, 3)).toEqual(['read-query-1', 'read-query-2', 'begin'])
        expect(calls).toContain('write')
    })
})

/**
 * Gerçek şema üzerinde UnitOfWork sınırı ile repository'nin kendi
 * `transactional()` helper'ının birlikte çalışması. Bu yol hiç test edilmiyordu:
 * test adapter'ı `isTransactionActive` sunmadığı için repo dış transaction'ı
 * göremiyor, iç içe BEGIN atıyor ve "cannot start a transaction within a
 * transaction" ile patlıyordu.
 */
describe('SqliteUnitOfWork ↔ repository transaction sınırı', () => {
    const icon = { name: 'wallet-outline', color: 'bg-blue-500' }

    async function fixture() {
        const db = await SqlJsTestAdapter.create()
        for (const migration of migrations) {
            await migration.up(db)
        }

        await new CurrencyRepository(db).save(Currency.create({
            id: 'cur-try', name: 'Türk Lirası', code: 'TRY', symbol: '₺', country: 'TR',
        }))

        const account = Account.create({
            name: 'Bütçe hesabı', type: 'bank', currencyId: 'cur-try', balance: 5000, icon,
        })
        await new AccountRepository(db).save(account)

        const category = Category.create({
            name: 'Gıda', type: 'expense', icon: icon.name, color: icon.color,
        })
        await new CategoryRepository(db).save(category)

        const budget = (name: string) => Budget.create({
            name,
            amount: 3000,
            accountId: account.id,
            currencyId: 'cur-try',
            type: 'monthly',
            categoryIds: [category.id],
            startDate: new Date('2026-05-01T00:00:00.000Z'),
            icon,
        })

        return { db, budgets: new BudgetRepository(db), budget }
    }

    it('UoW transaction içindeki repo yazması iç içe BEGIN denemez', async () => {
        const { db, budgets, budget } = await fixture()
        const uow = new SqliteUnitOfWork(db)
        const created = budget('Aylık gıda')

        await uow.run(() => budgets.save(created))

        expect((await budgets.findById(created.id))?.categoryIds).toHaveLength(1)
    })

    it('UoW rollback ederse repo yazması da geri alınır', async () => {
        const { db, budgets, budget } = await fixture()
        const uow = new SqliteUnitOfWork(db)
        const created = budget('Geri alınacak')

        await expect(uow.run(async () => {
            await budgets.save(created)
            throw new Error('patladı')
        })).rejects.toThrow('patladı')

        expect(await budgets.findById(created.id)).toBeNull()
    })
})
