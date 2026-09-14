import { BaseMigration, ColumnDefinition } from "./base-migration";
import { DatabaseAdapter } from "@/domain";

/**
 * 009'daki şema (deadline/color/notes/is_completed) SavingGoalRepository'nin
 * beklediği kolonlarla uyumsuzdu. Tablo o güne dek hiç yazılmadığı için
 * (özellik localStorage üzerinde çalışıyordu) veri kaybı olmadan yeniden kurulur.
 */
export class RecreateSavingGoalsTable extends BaseMigration {
    version = 13;
    name = "recreate_saving_goals_table";

    async up(db: DatabaseAdapter): Promise<void> {
        await this.dropIndexes(db, [
            "idx_saving_goals_deadline",
            "idx_saving_goals_currency",
        ]);
        await this.dropTable(db, "saving_goals");

        const columns: ColumnDefinition[] = [
            { name: "id", type: "TEXT", primaryKey: true, unique: true },
            {
                name: "currency_id",
                type: "TEXT",
                notNull: true,
                references: { table: "currencies", column: "id", onDelete: "RESTRICT" }
            },
            { name: "name", type: "TEXT", notNull: true },
            { name: "target_amount", type: "REAL", notNull: true },
            { name: "saved_amount", type: "REAL", notNull: true, default: 0 },
            { name: "target_date", type: "TIMESTAMP" },
            { name: "status", type: "TEXT", notNull: true, default: "active", check: "status IN ('active', 'paused', 'completed', 'cancelled')" },
            { name: "icon", type: "TEXT" },
            { name: "icon_color", type: "TEXT" },
            { name: "description", type: "TEXT" },
            { name: "created_at", type: "TEXT", default: "CURRENT_TIMESTAMP" },
            { name: "updated_at", type: "TEXT", default: "CURRENT_TIMESTAMP" },
        ];

        await this.createTable(db, "saving_goals", columns);

        await this.createIndexes(db, [
            { name: "idx_saving_goals_status", table: "saving_goals", columns: "status" },
            { name: "idx_saving_goals_target_date", table: "saving_goals", columns: "target_date" },
            { name: "idx_saving_goals_currency_id", table: "saving_goals", columns: "currency_id" },
        ]);
    }

    async down(db: DatabaseAdapter): Promise<void> {
        await this.dropIndexes(db, [
            "idx_saving_goals_status",
            "idx_saving_goals_target_date",
            "idx_saving_goals_currency_id",
        ]);
        await this.dropTable(db, "saving_goals");

        // 009'daki eski şemayı geri kur
        const columns: ColumnDefinition[] = [
            { name: "id", type: "TEXT", primaryKey: true, unique: true },
            {
                name: "currency_id",
                type: "TEXT",
                notNull: true,
                references: { table: "currencies", column: "id", onDelete: "RESTRICT" }
            },
            { name: "name", type: "TEXT", notNull: true },
            { name: "target_amount", type: "REAL", notNull: true },
            { name: "deadline", type: "TIMESTAMP" },
            { name: "icon", type: "TEXT" },
            { name: "color", type: "TEXT" },
            { name: "notes", type: "TEXT" },
            { name: "is_completed", type: "INTEGER", notNull: true, default: 0 },
            { name: "created_at", type: "TEXT", default: "CURRENT_TIMESTAMP" },
            { name: "updated_at", type: "TEXT", default: "CURRENT_TIMESTAMP" },
        ];

        await this.createTable(db, "saving_goals", columns);

        await this.createIndexes(db, [
            { name: "idx_saving_goals_deadline", table: "saving_goals", columns: "deadline" },
            { name: "idx_saving_goals_currency", table: "saving_goals", columns: "currency_id" },
        ]);
    }
}
