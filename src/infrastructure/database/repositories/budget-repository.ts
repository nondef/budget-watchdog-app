import { BaseRepository } from './base-repository';
import { Budget, BudgetType, BudgetStatus, DailySpent } from '@/domain/entities/budget';
import {
    MoneyCast,
    IconCast,
    DateRangeCast,
    PercentageCast,
    BooleanCast,
    DateCast,
    OptionalDateCast
} from './casts';
import { DatabaseAdapter } from '@/domain/interfaces/database-adapter';
import { IBudgetRepository } from '@/domain/interfaces/budget-repository.interface';
import { uuid } from '@/shared/utils/id/uuid';

export class BudgetRepository extends BaseRepository<Budget> implements IBudgetRepository {
    protected readonly table = 'budgets';
    // categoryIds/dailySpent junction tablolarında tutulur (budget_categories,
    // budget_daily_spent); budgets tablosunda kolon karşılıkları yok.
    protected readonly transientFields = ['categoryIds', 'dailySpent'] as const;
    protected readonly currencyScopedColumns = ['amount', 'spent_amount'] as const;
    protected readonly casts = {
        amount:              MoneyCast('amount', 'currency_id', 'TRY', 'minor_unit'),
        spentAmount:         MoneyCast('spent_amount', 'currency_id', 'TRY', 'minor_unit'),
        icon:                IconCast('icon', 'icon_bg_color', { color: 'bg-blue-500' }),
        dateRange:           DateRangeCast('start_date', 'end_date'),
        warningPercentage:   PercentageCast('warning_percentage', 80),
        enableNotifications: BooleanCast('enable_notifications', true),
        periodStart:         DateCast('period_start'),
        trackingStartDate:   OptionalDateCast('tracking_start_date'),
    };

    constructor(db: DatabaseAdapter) {
        super(db);
    }

    /**
     * Junction'ları (categoryIds, dailySpent) tek sorguda yükler.
     *
     * `toDomain` yerine `hydrateRows` override ediliyor: base'in bütün okuma
     * metotları (`find`, `findOne`, `findById`, `paginate`, `findAll`) buradan
     * geçtiği için hepsi birden tam hydrate olur. Eskiden yalnızca `findById` ve
     * `findAll` override edilmişti; `find`/`findOne`/`paginate` çağıranlara
     * kategorisi boş bütçe dönüyordu ve hiçbir yerde hata görünmüyordu.
     *
     * Dönen dizi giriş sırasını korur: base `updated_at` damgasını indeksle
     * eşleştiriyor.
     */
    protected async hydrateRows(rows: Record<string, any>[]): Promise<Budget[]> {
        if (rows.length === 0) return [];

        await this.loadTableColumns();

        const budgetIds = rows.map(row => row.id);
        const [categoryMap, dailySpentMap] = await Promise.all([
            this.loadCategoryIdsForBudgets(budgetIds),
            this.loadDailySpentForBudgets(budgetIds),
        ]);

        return rows.map(row => this.rowToBudget(
            row,
            categoryMap.get(row.id) ?? [],
            dailySpentMap.get(row.id) ?? []
        ));
    }

    // İlişkisiz tek satır dönüşümü. Normal okuma yolu `hydrate`'ten geçer.
    protected toDomain(row: Record<string, any>): Budget {
        return this.rowToBudget(row, [], []);
    }

    private rowToBudget(row: Record<string, any>, categoryIds: string[], dailySpent: DailySpent[]): Budget {
        const props = this.buildPropsFromRow(row);

        return Budget.reconstitute({
            ...props,
            periodStart: props.periodStart,
            categoryIds,
            dailySpent,
        } as any);
    }

    // ========== Relation Loaders (junction tables) ==========

    private async loadCategoryIdsForBudgets(budgetIds: string[]): Promise<Map<string, string[]>> {
        const map = new Map<string, string[]>();
        if (budgetIds.length === 0) return map;

        for (const id of budgetIds) {
            map.set(id, []);
        }

        const placeholders = budgetIds.map(() => '?').join(', ');
        const query = `SELECT budget_id, category_id
                       FROM budget_categories
                       WHERE budget_id IN (${placeholders})`;
        const result = await this.db.query(query, budgetIds);

        for (const row of result.rows) {
            map.get(row.budget_id)?.push(row.category_id);
        }

        return map;
    }

    private async loadDailySpentForBudgets(budgetIds: string[]): Promise<Map<string, DailySpent[]>> {
        const map = new Map<string, DailySpent[]>();
        if (budgetIds.length === 0) return map;

        for (const id of budgetIds) {
            map.set(id, []);
        }

        const placeholders = budgetIds.map(() => '?').join(', ');
        const query = `
            SELECT id, budget_id, date, amount
            FROM budget_daily_spent
            WHERE budget_id IN (${placeholders})
            ORDER BY date DESC
        `;
        const result = await this.db.query(query, budgetIds);

        for (const row of result.rows) {
            const list = map.get(row.budget_id);
            if (list && list.length < 30) {
                list.push({ id: row.id, date: row.date, amount: row.amount });
            }
        }

        return map;
    }

    // ========== Relation Sync ==========

    private async syncCategories(budget: Budget): Promise<void> {
        await this.db.run('DELETE FROM budget_categories WHERE budget_id = ?', [budget.id]);

        for (const categoryId of budget.categoryIds) {
            await this.db.run(
                'INSERT INTO budget_categories (budget_id, category_id) VALUES (?, ?)',
                [budget.id, categoryId]
            );
        }
    }

    private async syncDailySpent(budget: Budget): Promise<void> {
        await this.db.run('DELETE FROM budget_daily_spent WHERE budget_id = ?', [budget.id]);

        for (const ds of budget.dailySpent) {
            await this.db.run(
                'INSERT INTO budget_daily_spent (id, budget_id, date, amount) VALUES (?, ?, ?, ?)',
                [ds.id ?? uuid(), budget.id, ds.date, ds.amount]
            );
        }
    }

    // ========== CRUD Overrides ==========

    async findAll(): Promise<Budget[]> {
        return this.find({}, { orderBy: 'createdAt', direction: 'DESC' });
    }

    /**
     * Ana satır + iki junction tablosu tek transaction'da yazılır. Eskiden üç
     * bağımsız yazmaydı: `syncCategories` DELETE'i attıktan sonra INSERT'lerden
     * biri patlarsa bütçe kategorisiz kalıyordu.
     */
    async save(budget: Budget): Promise<void> {
        await this.transactional(() => this.writeBudget(budget));
    }

    /**
     * Base'in batch hâli yalnızca `budgets` tablosunu yazar; junction'lar
     * sessizce güncellenmeden kalırdı. Hepsi tek transaction'da yazılır.
     *
     * İçeride `save()` değil `writeBudget()` çağrılır: `transactional()` kendi
     * içinden yeniden çağrılamaz, kuyrukta kendi kilidini beklerdi.
     */
    async saveMany(budgets: Budget[]): Promise<void> {
        await this.transactional(async () => {
            for (const budget of budgets) {
                await this.writeBudget(budget);
            }
        });
    }

    /** Ana satır + junction'lar. Çağıran transaction sınırını açmış olmalı. */
    private async writeBudget(budget: Budget): Promise<void> {
        await this.write(budget);
        await this.syncCategories(budget);
        await this.syncDailySpent(budget);
    }

    async delete(id: string): Promise<boolean> {
        this.assertDeletableId(id);

        // Sıralı çalıştırılır: tek SQLite bağlantısı üzerinde, hele bir dış
        // transaction açıkken, paralel `run` çağrılarının araya girme sırası
        // garanti değil.
        return this.transactional(async () => {
            await this.db.run('DELETE FROM budget_categories WHERE budget_id = ?', [id]);
            await this.db.run('DELETE FROM budget_daily_spent WHERE budget_id = ?', [id]);

            const result = await this.db.run(
                `DELETE FROM "${this.tableName}" WHERE "id" = ?`, [id]
            );
            return result.rowsAffected > 0;
        });
    }

    // ========== Custom Queries ==========

    async findActive(): Promise<Budget[]> {
        return this.find(
            { status: 'active' as BudgetStatus },
            { orderBy: 'createdAt', direction: 'DESC' }
        );
    }

    async findByStatus(status: BudgetStatus): Promise<Budget[]> {
        return this.find({ status }, { orderBy: 'createdAt', direction: 'DESC' });
    }

    async findByType(type: BudgetType): Promise<Budget[]> {
        return this.find({ type }, { orderBy: 'createdAt', direction: 'DESC' });
    }

    async findByAccount(accountId: string): Promise<Budget[]> {
        return this.find({ accountId }, { orderBy: 'createdAt', direction: 'DESC' });
    }

    /**
     * Raw SQL: builder OR mantığını desteklemiyor
     * (next_reset_date IS NULL OR <= now).
     *
     * "Şimdi" değeri SQL'den değil parametre olarak gelir: tarihler kolona
     * `toISOString()` ile (`2026-07-24T00:00:00.000Z`) yazılıyor, `datetime('now')`
     * ise `2026-07-24 12:00:00` üretiyordu. SQLite bunları metin olarak
     * karşılaştırdığı için 10. karakterde `'T'`(84) > `' '`(32) çıkıyor ve
     * bütçe, sıfırlanması gereken gün boyunca sorgunun dışında kalıyordu.
     */
    async findNeedingReset(now: Date = new Date()): Promise<Budget[]> {
        const query = `
            SELECT *
            FROM ${this.tableName}
            WHERE status = 'active'
              AND type != 'once'
              AND (next_reset_date IS NULL OR next_reset_date <= ?)
        `;
        const result = await this.db.query(query, [now.toISOString()]);
        return this.hydrate(result.rows);
    }

    /**
     * Raw SQL: junction tablosuyla JOIN gerekiyor.
     */
    async findByCategory(categoryId: string): Promise<Budget[]> {
        const query = `
            SELECT DISTINCT b.*
            FROM ${this.tableName} b
                     INNER JOIN budget_categories bc ON b.id = bc.budget_id
            WHERE bc.category_id = ?
            ORDER BY b.created_at DESC
        `;
        const result = await this.db.query(query, [categoryId]);
        return this.hydrate(result.rows);
    }
}
