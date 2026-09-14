import { beforeEach, describe, expect, it } from 'vitest';
import { migrations } from '@/infrastructure/database/migrations';
import {
    AccountRepository,
    CurrencyRepository,
    ExchangeRateRepository,
    SavingGoalRepository,
} from '@/infrastructure/database/repositories';
import { Account } from '@/domain/entities/account';
import { Currency } from '@/domain/entities/currency';
import { ExchangeRate } from '@/domain/entities/exchange-rate';
import { SavingGoal } from '@/domain/entities/saving-goal';
import { Money } from '@/domain/value-objects/money';
import { SqlJsTestAdapter } from './helpers/sqljs-adapter';

/**
 * SQL katmanında bulunup düzeltilen üç hatanın regresyon testleri. Üçü de
 * gerçek şemaya (bütün migration'lar) karşı sürülür: ikisi trigger/tarih
 * karşılaştırması gibi yalnızca SQLite'ın kendisinde görünen davranışlar.
 */

const icon = { name: 'wallet-outline', color: 'bg-blue-500' };

async function freshDb(): Promise<SqlJsTestAdapter> {
    const db = await SqlJsTestAdapter.create();
    for (const migration of migrations) {
        await migration.up(db);
    }

    await new CurrencyRepository(db).save(Currency.create({
        id: 'cur-try', name: 'Türk Lirası', code: 'TRY', symbol: '₺', country: 'TR',
    }));

    return db;
}

describe('Kredi hesabı borç bakiyesi (migration 028)', () => {
    let db: SqlJsTestAdapter;

    beforeEach(async () => {
        db = await freshDb();
    });

    it('kredi hesabı eksi bakiyeyle kaydedilebilir', async () => {
        const accounts = new AccountRepository(db);
        const card = Account.create({
            name: 'Kredi Kartı', type: 'credit', currencyId: 'cur-try', balance: 0, icon,
        });
        await accounts.save(card);

        // Bakiyesinden büyük harcama: kredi kartında beklenen sonuç borç bakiyesi.
        card.withdraw(Money.create(500, 'cur-try', 2));
        await accounts.save(card);

        expect((await accounts.findByIdOrFail(card.id)).balance.amount).toBe(-500);
    });

    it('kredi dışı tipler hâlâ eksiye düşemez', async () => {
        const accounts = new AccountRepository(db);
        const bank = Account.create({
            name: 'Vadesiz', type: 'bank', currencyId: 'cur-try', balance: 100, icon,
        });
        await accounts.save(bank);

        // Domain guard'ını atlayıp doğrudan SQL yazıyoruz: korumanın DB
        // seviyesinde de durduğunu doğrulamak için.
        await expect(
            db.run('UPDATE accounts SET balance = ? WHERE id = ?', [-1, bank.id])
        ).rejects.toThrow(/invalid monetary amount in accounts/);
    });

    it('büyüklük sınırı kredi hesabında da geçerli', async () => {
        const accounts = new AccountRepository(db);
        const card = Account.create({
            name: 'Kredi Kartı', type: 'credit', currencyId: 'cur-try', balance: 0, icon,
        });
        await accounts.save(card);

        await expect(
            db.run('UPDATE accounts SET balance = ? WHERE id = ?', [-1e18, card.id])
        ).rejects.toThrow(/invalid monetary amount in accounts/);
    });
});

describe('SavingGoal deadline sorguları ISO formatını doğru karşılaştırır', () => {
    const NOW = new Date('2026-08-21T09:00:00.000Z');

    /**
     * Kritik durum aynı GÜN içinde: `datetime('now')` `'2026-08-21 09:00:00'`
     * üretiyordu ve ISO damgasıyla metin karşılaştırmasında 11. karakterde
     * `'T'`(84) > `' '`(32) çıkıyordu.
     */
    async function seedGoal(db: SqlJsTestAdapter, targetDate: Date): Promise<SavingGoal> {
        const accounts = new AccountRepository(db);
        const account = Account.create({
            name: 'Birikim', type: 'bank', currencyId: 'cur-try', balance: 5000, icon,
        });
        await accounts.save(account);

        const goals = new SavingGoalRepository(db);
        const goal = SavingGoal.create({
            name: 'Tatil',
            targetAmount: 20000,
            currencyId: 'cur-try',
            targetDate,
            icon: icon.name,
            iconColor: icon.color,
            accountId: account.id,
        });
        await goals.save(goal);

        return goal;
    }

    it('bugün içinde geçmiş deadline gecikmiş sayılır', async () => {
        const db = await freshDb();
        const goal = await seedGoal(db, new Date('2026-08-21T06:00:00.000Z'));

        const overdue = await new SavingGoalRepository(db).findOverdue(NOW);

        expect(overdue.map(g => g.id)).toEqual([goal.id]);
    });

    it('bugün içinde geçmiş deadline "yaklaşan" listesine girmez', async () => {
        const db = await freshDb();
        await seedGoal(db, new Date('2026-08-21T06:00:00.000Z'));

        const nearing = await new SavingGoalRepository(db).findNearingDeadline(7, NOW);

        expect(nearing).toEqual([]);
    });

    it('birkaç gün sonraki deadline yaklaşan sayılır, gecikmiş sayılmaz', async () => {
        const db = await freshDb();
        const goal = await seedGoal(db, new Date('2026-08-24T06:00:00.000Z'));

        const repo = new SavingGoalRepository(db);

        expect((await repo.findNearingDeadline(7, NOW)).map(g => g.id)).toEqual([goal.id]);
        expect(await repo.findOverdue(NOW)).toEqual([]);
    });

    it('pencerenin dışındaki deadline hiçbir listeye girmez', async () => {
        const db = await freshDb();
        await seedGoal(db, new Date('2026-09-30T06:00:00.000Z'));

        const repo = new SavingGoalRepository(db);

        expect(await repo.findNearingDeadline(7, NOW)).toEqual([]);
        expect(await repo.findOverdue(NOW)).toEqual([]);
    });
});

describe('ExchangeRateRepository.upsertMany', () => {
    it('alış/satış/değişim kurlarını da günceller', async () => {
        const db = await freshDb();
        await new CurrencyRepository(db).save(Currency.create({
            id: 'cur-usd', name: 'Dolar', code: 'USD', symbol: '$', country: 'US',
        }));

        const repo = new ExchangeRateRepository(db);

        await repo.upsertMany([ExchangeRate.create({
            baseCurrencyId: 'cur-try',
            targetCurrencyId: 'cur-usd',
            rate: 0.030,
            buyingRate: 0.029,
            sellingRate: 0.031,
            changeRate: 1.5,
            fetchDate: new Date('2026-08-20T10:00:00.000Z'),
        })]);

        // Aynı base+target: UPDATE dalına düşer.
        await repo.upsertMany([ExchangeRate.create({
            baseCurrencyId: 'cur-try',
            targetCurrencyId: 'cur-usd',
            rate: 0.040,
            buyingRate: 0.039,
            sellingRate: 0.041,
            changeRate: -2.5,
            fetchDate: new Date('2026-08-21T10:00:00.000Z'),
        })]);

        const stored = await repo.findRate('cur-try', 'cur-usd');

        expect(stored?.rate).toBe(0.040);
        expect(stored?.buyingRate).toBe(0.039);
        expect(stored?.sellingRate).toBe(0.041);
        expect(stored?.changeRate).toBe(-2.5);
    });
});
