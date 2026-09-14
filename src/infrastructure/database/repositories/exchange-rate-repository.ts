import { BaseRepository } from "@/infrastructure/database/repositories/base-repository";
import { ExchangeRate } from "@/domain/entities/exchange-rate";
import { DatabaseAdapter, IExchangeRateRepository } from "@/domain";

export class ExchangeRateRepository extends BaseRepository<ExchangeRate> implements IExchangeRateRepository {
    protected readonly table = 'exchange_rates';
    protected readonly timestamps = false;
    // VO yok → base'in default convention'ı yeterli.
    protected readonly entityClass = ExchangeRate;

    constructor(db: DatabaseAdapter) {
        super(db);
    }

    async findRate(baseId: string, targetId: string): Promise<ExchangeRate | null> {
        if (baseId === targetId) return null;

        const [rate] = await this.find(
            { baseCurrencyId: baseId, targetCurrencyId: targetId },
            { orderBy: 'fetchDate', direction: 'DESC', limit: 1 }
        );
        return rate ?? null;
    }

    findAllByBase(baseId: string): Promise<ExchangeRate[]> {
        return this.find({ baseCurrencyId: baseId });
    }

    async upsertMany(rates: ExchangeRate[]): Promise<void> {
        for (const rate of rates) {
            const existing = await this.findRate(rate.baseCurrencyId, rate.targetCurrencyId);

            if (existing) {
                // Raw update: kompozit anahtarla (base+target) update, base.update() id-based.
                //
                // Alış/satış/değişim kolonları da yazılır: eskiden yalnızca `rate`
                // ve `fetch_date` set ediliyordu, dolayısıyla satır ilk INSERT'teki
                // alış-satış kurunu sonsuza dek taşıyordu. `fetch_date` tazelendiği
                // için veri güncel görünüyor ama gösterilen alış/satış eskiydi.
                const sql =
                    `UPDATE ${this.tableName} ` +
                    `SET rate = ?, buying_rate = ?, selling_rate = ?, change_rate = ?, fetch_date = ? ` +
                    `WHERE base_currency_id = ? AND target_currency_id = ?`;
                await this.db.run(sql, [
                    rate.rate,
                    rate.buyingRate,
                    rate.sellingRate,
                    rate.changeRate,
                    rate.fetchDate.toISOString(),
                    rate.baseCurrencyId,
                    rate.targetCurrencyId,
                ]);
            } else {
                await this.insert(rate);
            }
        }
    }

    async deleteByBase(baseId: string): Promise<void> {
        await this.deleteMany({ baseCurrencyId: baseId });
    }

    async replaceForBase(baseId: string, rates: ExchangeRate[]): Promise<void> {
        if (rates.some(rate => rate.baseCurrencyId !== baseId)) {
            throw new Error('All replacement rates must use the requested base currency');
        }

        await this.deleteByBase(baseId);

        for (const rate of rates) {
            await this.insert(rate);
        }
    }
}
