import { Transaction, TransactionType } from '../entities/transaction';
import { IRepository, PageResult } from './repository.interface';

/** `findFiltered` için birleşik arama kriteri. Verilmeyen alanlar filtrelemez. */
export interface TransactionFilter {
    type?: TransactionType;
    categoryId?: string;
    accountId?: string;
    startDate?: Date;
    endDate?: Date;
}

export interface TransactionPageOptions {
    limit?: number;
    offset?: number;
}

export interface ITransactionRepository extends IRepository<Transaction> {
    /**
     * Filtreleri ve sayfalamayı SQL seviyesinde uygular; sayfa ile toplamı
     * tek filtreden üretir. Bellekte filtrelemeye göre büyük veri setlerinde
     * tek doğru yol.
     */
    findPage(filter: TransactionFilter, options?: TransactionPageOptions): Promise<PageResult<Transaction>>;
    findByType(type: TransactionType): Promise<Transaction[]>;
    findByCategory(categoryId: string): Promise<Transaction[]>;
    findByAccount(accountId: string): Promise<Transaction[]>;
    findByIds(ids: string[]): Promise<Transaction[]>;
    findByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]>;
    findRecent(limit?: number): Promise<Transaction[]>;
    findThisMonth(): Promise<Transaction[]>;
    findThisWeek(): Promise<Transaction[]>;
    findToday(): Promise<Transaction[]>;
    findByBudgetCriteria(
        categoryIds: string[],
        accountId: string,
        startDate: Date,
        endDate?: Date
    ): Promise<Transaction[]>;
    getTotalByType(type: TransactionType, currencyId: string): Promise<number>;
    getTotalByTypeAndDateRange(
        type: TransactionType,
        startDate: Date,
        endDate: Date,
        currencyId: string
    ): Promise<number>;
    getCountByCategory(categoryId: string): Promise<number>;
}

