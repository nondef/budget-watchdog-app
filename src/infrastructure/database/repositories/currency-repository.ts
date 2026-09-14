import { BaseRepository } from './base-repository';
import { Currency } from '@/domain/entities/currency';
import { DatabaseAdapter } from '@/domain/interfaces/database-adapter';
import { ICurrencyRepository } from "@/domain";

export class CurrencyRepository extends BaseRepository<Currency> implements ICurrencyRepository {
    protected readonly table = 'currencies';
    protected readonly timestamps = false;
    protected readonly entityClass = Currency;

    constructor(db: DatabaseAdapter) {
        super(db);
    }

    // ========== Custom Queries ==========

    async findByCode(code: string): Promise<Currency | null> {
        return this.findOne({ code: code.toUpperCase() });
    }

    async findPopular(): Promise<Currency[]> {
        return this.find({ code: ['TRY', 'USD', 'EUR', 'GBP'] });
    }

    /**
     * Raw SQL: builder OR mantığını ve LIKE'ı tek bir kolon için destekliyor;
     * 3 kolon arası OR-LIKE'ı tek find çağrısında ifade edemiyoruz.
     */
    async search(term: string): Promise<Currency[]> {
        const query = `
            SELECT * FROM ${this.tableName}
            WHERE name LIKE ? ESCAPE '\\'
               OR code LIKE ? ESCAPE '\\'
               OR country LIKE ? ESCAPE '\\'
            ORDER BY code
        `;
        // Kullanıcı girdisindeki % ve _ wildcard sayılmamalı: "50%" araması
        // aksi hâlde tüm kayıtları döndürüyordu.
        const like = `%${term.replace(/[\\%_]/g, ch => `\\${ch}`)}%`;
        const result = await this.db.query(query, [like, like, like]);
        return this.hydrate(result.rows ?? []);
    }

    async findByIds(ids: string[]): Promise<Currency[]> {
        if (ids.length === 0) return [];
        return this.find({ id: [...new Set(ids)] });
    }
}
