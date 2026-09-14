import { beforeAll, describe, expect, it } from 'vitest';
import { migrations } from '@/infrastructure/database/migrations';
import {
    AccountRepository,
    AppSettingsRepository,
    BudgetRepository,
    CategoryRepository,
    CurrencyRepository,
    ExchangeRateRepository,
    SavingGoalRepository,
    TransactionRepository,
} from '@/infrastructure/database/repositories';
import { Account } from '@/domain/entities/account';
import { AppSettings } from '@/domain/entities/app-settings';
import { Budget } from '@/domain/entities/budget';
import { Category } from '@/domain/entities/category';
import { Currency } from '@/domain/entities/currency';
import { ExchangeRate } from '@/domain/entities/exchange-rate';
import { SavingGoal } from '@/domain/entities/saving-goal';
import { Transaction } from '@/domain/entities/transaction';
import { SqlJsTestAdapter } from './helpers/sqljs-adapter';

/**
 * `BaseRepository` artık yazmadan önce üretilen row ile tablo kolonlarının
 * birebir örtüştüğünü doğruluyor (eksik kolon = UPSERT'ün sessizce güncellemediği
 * kolon). Bu doğrulama yalnızca gerçek şemaya karşı anlamlı olduğundan burada
 * bütün migration'lar çalıştırılıp her repository'nin save yolu bir kez sürülür.
 */
describe('Repository ↔ şema uyumu (tüm migration\'lar)', () => {
    let db: SqlJsTestAdapter;

    const icon = { name: 'wallet-outline', color: 'bg-blue-500' };

    beforeAll(async () => {
        db = await SqlJsTestAdapter.create();
        for (const migration of migrations) {
            await migration.up(db);
        }
    });

    it('bütün tablolar oluşturuldu', async () => {
        const { rows } = await db.query(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        );
        const names = rows.map(r => r.name);

        expect(names).toEqual(expect.arrayContaining([
            'currencies', 'categories', 'app_settings', 'exchange_rates',
            'accounts', 'transactions', 'budgets', 'saving_goals',
        ]));
    });

    it('CurrencyRepository', async () => {
        const repo = new CurrencyRepository(db);
        const currency = Currency.create({
            id: 'cur-try', name: 'Türk Lirası', code: 'TRY', symbol: '₺', country: 'TR',
        });

        await repo.save(currency);

        expect((await repo.findByIdOrFail('cur-try')).code).toBe('TRY');
    });

    it('CategoryRepository', async () => {
        const repo = new CategoryRepository(db);
        const category = Category.create({
            name: 'Market', type: 'expense', icon: icon.name, color: icon.color,
        });

        await repo.save(category);

        expect((await repo.findByIdOrFail(category.id)).name).toBe('Market');
    });

    it('AccountRepository', async () => {
        const repo = new AccountRepository(db);
        const account = Account.create({
            name: 'Vadesiz', type: 'bank', currencyId: 'cur-try', balance: 1000, icon,
        });

        await repo.save(account);

        expect((await repo.findByIdOrFail(account.id)).balance.amount).toBe(1000);
    });

    it('TransactionRepository', async () => {
        const accounts = new AccountRepository(db);
        const account = Account.create({
            name: 'Harcama', type: 'bank', currencyId: 'cur-try', balance: 500, icon,
        });
        await accounts.save(account);

        const categories = new CategoryRepository(db);
        const category = Category.create({
            name: 'Fatura', type: 'expense', icon: icon.name, color: icon.color,
        });
        await categories.save(category);

        const repo = new TransactionRepository(db);
        const transaction = Transaction.create({
            title: 'Elektrik',
            amount: 250,
            currencyId: 'cur-try',
            date: new Date('2026-05-05T10:00:00.000Z'),
            type: 'expense',
            accountId: account.id,
            categoryId: category.id,
        });

        await repo.save(transaction);

        expect((await repo.findByIdOrFail(transaction.id)).amount.amount).toBe(250);
    });

    it('BudgetRepository', async () => {
        const accounts = new AccountRepository(db);
        const account = Account.create({
            name: 'Bütçe hesabı', type: 'bank', currencyId: 'cur-try', balance: 5000, icon,
        });
        await accounts.save(account);

        const categories = new CategoryRepository(db);
        const category = Category.create({
            name: 'Gıda', type: 'expense', icon: icon.name, color: icon.color,
        });
        await categories.save(category);

        const repo = new BudgetRepository(db);
        const budget = Budget.create({
            name: 'Aylık gıda',
            amount: 3000,
            accountId: account.id,
            currencyId: 'cur-try',
            type: 'monthly',
            categoryIds: [category.id],
            startDate: new Date('2026-05-01T00:00:00.000Z'),
            icon,
        });

        await repo.save(budget);

        const loaded = await repo.findById(budget.id);
        expect(loaded?.categoryIds).toEqual([category.id]);
    });

    it('SavingGoalRepository', async () => {
        const accounts = new AccountRepository(db);
        const account = Account.create({
            name: 'Birikim', type: 'bank', currencyId: 'cur-try', balance: 200, icon,
        });
        await accounts.save(account);

        const repo = new SavingGoalRepository(db);
        const goal = SavingGoal.create({
            name: 'Tatil',
            targetAmount: 20000,
            currencyId: 'cur-try',
            icon: icon.name,
            iconColor: icon.color,
            accountId: account.id,
        });

        await repo.save(goal);

        expect((await repo.findByIdOrFail(goal.id)).targetAmount.amount).toBe(20000);
    });

    it('AppSettingsRepository', async () => {
        const repo = new AppSettingsRepository(db);
        const settings = AppSettings.create({ baseCurrencyId: 'cur-try' });

        await repo.save(settings);

        expect((await repo.findByIdOrFail(settings.id)).baseCurrencyId).toBe('cur-try');

        // `get()` boş where + LIMIT 1 yolundan geçer; sıralamasız LIMIT'e eklenen
        // `id` tie-break'i gerçek şemada da çalışmalı.
        expect((await repo.get())?.baseCurrencyId).toBe('cur-try');
    });

    it('ExchangeRateRepository', async () => {
        const currencies = new CurrencyRepository(db);
        await currencies.save(Currency.create({
            id: 'cur-usd', name: 'Dolar', code: 'USD', symbol: '$', country: 'US',
        }));

        const repo = new ExchangeRateRepository(db);
        const rate = ExchangeRate.create({
            baseCurrencyId: 'cur-try',
            targetCurrencyId: 'cur-usd',
            rate: 0.03,
            fetchDate: new Date('2026-05-05T10:00:00.000Z'),
        });

        await repo.save(rate);

        expect((await repo.findRate('cur-try', 'cur-usd'))?.rate).toBe(0.03);
    });
});
