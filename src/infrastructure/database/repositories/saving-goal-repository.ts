import { BaseRepository } from './base-repository';
import { SavingGoal, SavingGoalStatus } from '@/domain/entities/saving-goal';
import { MoneyCast, IconCast } from './casts';
import { DatabaseAdapter } from '@/domain/interfaces/database-adapter';
import { ISavingGoalRepository } from '@/domain/interfaces/saving-goal-repository.interface';

export class SavingGoalRepository extends BaseRepository<SavingGoal> implements ISavingGoalRepository {
    protected readonly table = 'saving_goals';
    protected readonly entityClass = SavingGoal;
    protected readonly currencyScopedColumns = ['target_amount', 'saved_amount'] as const;
    protected readonly casts = {
        targetAmount: MoneyCast('target_amount', 'currency_id', 'TRY', 'minor_unit'),
        savedAmount:  MoneyCast('saved_amount',  'currency_id', 'TRY', 'minor_unit'),
        icon:         IconCast('icon', 'icon_color', { name: 'flag-outline', color: 'bg-blue-500' }),
    };

    constructor(db: DatabaseAdapter) {
        super(db);
    }

    // ========== Custom Queries ==========

    async findActive(): Promise<SavingGoal[]> {
        return this.find(
            { status: 'active' as SavingGoalStatus },
            { orderBy: 'createdAt', direction: 'DESC' }
        );
    }

    async findByAccount(accountId: string): Promise<SavingGoal[]> {
        return this.find({ accountId }, { orderBy: 'createdAt', direction: 'DESC' });
    }

    async findByStatus(status: SavingGoalStatus): Promise<SavingGoal[]> {
        return this.find({ status }, { orderBy: 'createdAt', direction: 'DESC' });
    }

    async findCompleted(): Promise<SavingGoal[]> {
        return this.findByStatus('completed');
    }

    /**
     * Raw SQL: kolon-kolon karşılaştırma (`saved_amount < target_amount`)
     * where builder'ı tarafından ifade edilemiyor.
     *
     * "Şimdi" değeri SQL'den değil parametre olarak gelir (bkz.
     * `BudgetRepository.findNeedingReset`): tarihler kolona `toISOString()` ile
     * (`2026-08-21T00:00:00.000Z`) yazılıyor ve migration 026 eldeki bütün tarih
     * kolonlarını bu formata normalize etti; `datetime('now')` ise
     * `2026-08-21 09:00:00` üretiyordu. SQLite bunları metin olarak
     * karşılaştırdığı için 11. karakterde `'T'`(84) > `' '`(32) çıkıyor ve
     * deadline'ı bugün içinde geçmiş hedef gün boyunca sorgunun dışında
     * kalıyordu.
     */
    async findOverdue(now: Date = new Date()): Promise<SavingGoal[]> {
        const query = `
            SELECT * FROM ${this.tableName}
            WHERE status = 'active'
              AND target_date IS NOT NULL
              AND target_date < ?
              AND saved_amount < target_amount
            ORDER BY target_date ASC
        `;
        const result = await this.db.query(query, [now.toISOString()]);
        return this.hydrate(result.rows);
    }

    /**
     * Raw SQL: kolon-kolon karşılaştırma (`saved_amount < target_amount`).
     *
     * Alt sınır da üst sınır gibi parametreyle gelir: `datetime('now')` ile
     * karışık format kullanmak `findOverdue`'nun kaçırdığı aynı-gün hedeflerini
     * buraya sızdırıyordu — geçmiş bir deadline "yaklaşıyor" diye listeleniyordu.
     */
    async findNearingDeadline(daysAhead: number = 7, now: Date = new Date()): Promise<SavingGoal[]> {
        const futureDate = new Date(now.getTime());
        futureDate.setDate(futureDate.getDate() + daysAhead);

        const query = `
            SELECT * FROM ${this.tableName}
            WHERE status = 'active'
              AND target_date IS NOT NULL
              AND target_date <= ?
              AND target_date >= ?
              AND saved_amount < target_amount
            ORDER BY target_date ASC
        `;
        const result = await this.db.query(query, [futureDate.toISOString(), now.toISOString()]);
        return this.hydrate(result.rows);
    }

    /** `currencyId` zorunlu: filtresiz toplam farklı para birimlerini toplardı. */
    async getTotalSaved(currencyId: string): Promise<number> {
        return this.sum('savedAmount', { status: 'active' as SavingGoalStatus, currencyId });
    }

    /** `currencyId` zorunlu: filtresiz toplam farklı para birimlerini toplardı. */
    async getTotalTarget(currencyId: string): Promise<number> {
        return this.sum('targetAmount', { status: 'active' as SavingGoalStatus, currencyId });
    }
}
