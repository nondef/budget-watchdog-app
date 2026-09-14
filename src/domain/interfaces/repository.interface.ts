/**
 * Generic Repository Interface
 * Domain katmanında tanımlanır, Infrastructure'da implement edilir
 */
export interface IRepository<T, TId = string> {
    findById(id: TId): Promise<T | null>;
    findAll(): Promise<T[]>;
    save(entity: T): Promise<void>;
    delete(id: TId): Promise<boolean>;
    exists(id: TId): Promise<boolean>;
}

/**
 * Offset tabanlı sayfa sonucu. Sayfa ve toplam tek sorgu çiftinden üretilir;
 * `hasNext` çağıranın ayrıca hesaplamasına gerek kalmadan verilir.
 */
export interface PageResult<T> {
    data: T[];
    total: number;
    limit: number;
    offset: number;
    hasNext: boolean;
}

/**
 * Query specification for complex queries
 */
export interface QuerySpecification<T> {
    where?: Partial<Record<keyof T, any>>;
    orderBy?: keyof T;
    orderDirection?: 'ASC' | 'DESC';
    limit?: number;
    offset?: number;
}

