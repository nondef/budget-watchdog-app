import { BaseRepository, PageResult } from './base-repository';
import { Transaction, TransactionType } from '@/domain/entities/transaction';
import { MoneyCast, OptionalMoneyCast } from './casts';
import { DatabaseAdapter } from '@/domain/interfaces/database-adapter';
import {
    ITransactionRepository,
    TransactionFilter,
    TransactionPageOptions
} from '@/domain/interfaces/transaction-repository.interface';

export class TransactionRepository extends BaseRepository<Transaction> implements ITransactionRepository {
    protected readonly table = 'transactions';
    protected readonly entityClass = Transaction;
    // `to_amount` transferin hedef bacağı: para birimi `currency_id` değil
    // `to_currency_id`. Düz string verildiğinde guard yanlış kolonu kontrol
    // ediyor ve farklı hedef para birimlerini toplayabiliyordu.
    protected readonly currencyScopedColumns = [
        'amount',
        { column: 'to_amount', currencyColumn: 'to_currency_id', minorUnitColumn: 'to_minor_unit' },
    ];
    protected readonly casts = {
        amount: MoneyCast('amount', 'currency_id', 'TRY', 'minor_unit'),
        toAmount: OptionalMoneyCast('to_amount', 'to_currency_id', 'to_minor_unit'),
    };

    constructor(db: DatabaseAdapter) {
        super(db);
    }

    async findByType(type: TransactionType): Promise<Transaction[]> {
        return this.find({ type }, { orderBy: 'date', direction: 'DESC' });
    }

    async findByCategory(categoryId: string): Promise<Transaction[]> {
        return this.find({ categoryId }, { orderBy: 'date', direction: 'DESC' });
    }

    /**
     * Raw SQL: builder OR mantığını desteklemiyor (account_id OR to_account_id).
     */
    async findByAccount(accountId: string): Promise<Transaction[]> {
        const query = `SELECT * FROM ${this.tableName} WHERE account_id = ? OR to_account_id = ? ORDER BY date DESC`;
        const result = await this.db.query(query, [accountId, accountId]);
        return this.hydrate(result.rows);
    }

    async findByIds(ids: string[]): Promise<Transaction[]> {
        if (!ids.length) return [];

        return this.find({ id: ids }, { orderBy: 'date', direction: 'DESC' });
    }

    async findByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
        return this.find(
            { date: { gte: startDate, lte: endDate } },
            { orderBy: 'date', direction: 'DESC' }
        );
    }

    async findRecent(limit: number = 10): Promise<Transaction[]> {
        return this.findAll({ orderBy: 'date', direction: 'DESC', limit });
    }

    /**
     * Sayfa + toplam tek where'den üretilir; ikisi ayrı çağrılarla alınırken
     * filtrelerin zamanla ayrışması riski kalmaz.
     */
    async findPage(
        filter: TransactionFilter,
        options: TransactionPageOptions = {}
    ): Promise<PageResult<Transaction>> {
        return this.paginate(this.toWhere(filter), {
            // `id` tie-breaker: aynı `date`'e sahip satırlarda sıra deterministik
            // olmazsa sayfalar arasında kayıt tekrarlanır/atlanır.
            orderBy: [
                { column: 'date', direction: 'DESC' },
                { column: 'id', direction: 'DESC' },
            ],
            limit: options.limit ?? 50,
            offset: options.offset ?? 0,
        });
    }

    /**
     * `TransactionFilter` → base where objesi. Verilmeyen alanlar `undefined`
     * kaldığı için filtrelemez. Transfer'in her iki bacağı da eşleşmeli:
     * hesap ya `account_id`'de ya `to_account_id`'dedir.
     */
    private toWhere(filter: TransactionFilter): Record<string, any> {
        const where: Record<string, any> = {
            type: filter.type,
            categoryId: filter.categoryId,
        };

        if (filter.accountId) {
            where.$or = [
                { accountId: filter.accountId },
                { toAccountId: filter.accountId },
            ];
        }

        if (filter.startDate || filter.endDate) {
            where.date = { gte: filter.startDate, lte: filter.endDate };
        }

        return where;
    }

    async findByBudgetCriteria(
        categoryIds: string[],
        accountId: string,
        startDate: Date,
        endDate?: Date
    ): Promise<Transaction[]> {
        if (!categoryIds.length) return [];

        return this.find(
            {
                type: 'expense' as TransactionType,
                accountId,
                categoryId: categoryIds,
                date: endDate
                    ? { gte: startDate, lte: endDate }
                    : { gte: startDate },
            },
            { orderBy: 'date', direction: 'DESC' }
        );
    }

    /** `currencyId` zorunlu: filtresiz toplam farklı para birimlerini toplardı. */
    async getTotalByType(type: TransactionType, currencyId: string): Promise<number> {
        return this.sum('amount', { type, currencyId });
    }

    /** `currencyId` zorunlu: filtresiz toplam farklı para birimlerini toplardı. */
    async getTotalByTypeAndDateRange(
        type: TransactionType,
        startDate: Date,
        endDate: Date,
        currencyId: string
    ): Promise<number> {
        return this.sum('amount', {
            type,
            currencyId,
            date: { gte: startDate, lte: endDate },
        });
    }

    async getCountByCategory(categoryId: string): Promise<number> {
        return this.count({ categoryId });
    }

    async findThisMonth(): Promise<Transaction[]> {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        return this.findByDateRange(startOfMonth, endOfMonth);
    }

    async findThisWeek(): Promise<Transaction[]> {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        return this.findByDateRange(startOfWeek, endOfWeek);
    }

    async findToday(): Promise<Transaction[]> {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        return this.findByDateRange(startOfDay, endOfDay);
    }
}
