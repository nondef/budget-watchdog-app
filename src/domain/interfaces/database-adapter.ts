export interface QueryResult<T = any> {
    rows: T[]
    rowsAffected: number
    insertId?: string | number
    error?: string
    executionTime?: number
}

export interface DatabaseAdapter {
    initialize(): Promise<void>;
    execute(sql: string): Promise<QueryResult>;
    executeBatch(statements: { sql: string; params?: any[] }[]): Promise<void>;
    query(sql: string, params?: any[]): Promise<QueryResult>;
    run(sql: string, params?: any[]): Promise<QueryResult>
    /**
     * Transaction API'si zorunlu.
     *
     * Eskiden dördü de opsiyoneldi ve `BaseRepository.transactional()` dışarıda
     * (UnitOfWork) açılmış bir transaction'ı yalnızca `isTransactionActive` ile
     * tespit edebiliyordu. Metodu sunmayan bir adapter'da tespit sessizce
     * kapanıyor, repo iç içe BEGIN deniyor ve "cannot start a transaction within
     * a transaction" ile patlıyordu — test adapter'ında tam olarak bu oluyordu,
     * yani "mevcut transaction'a katıl" yolunun hiç testi yoktu.
     */
    beginTransaction(): Promise<void>
    commitTransaction(): Promise<void>
    rollbackTransaction(): Promise<void>
    isTransactionActive(): Promise<boolean>
    close(): Promise<void>;
    isReady(): boolean;
}