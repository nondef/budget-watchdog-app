import { BaseMigration, ColumnDefinition } from "./base-migration"
import { DatabaseAdapter } from "@/domain"

export class CreateBudgetDailySpentTable extends BaseMigration {
    version = 8;
    name = "create_budget_daily_spent_table";

    async up(db: DatabaseAdapter): Promise<void> {
        const columns: ColumnDefinition[] = [
            { name: "id", type: "TEXT", primaryKey: true, unique: true },
            {
                name: "budget_id",
                type: "TEXT",
                notNull: true,
                references: { table: "budgets", column: "id", onDelete: "CASCADE" }
            },
            { name: "date", type: "TIMESTAMP", notNull: true },
            { name: "amount", type: "REAL", notNull: true },
        ];

        await this.createTable(db, "budget_daily_spent", columns);
        await this.createIndex(db, "idx_budget_daily_spent_budget_id", "budget_daily_spent", "budget_id");
        await this.createIndex(db, "idx_budget_daily_spent_date", "budget_daily_spent", "date");
    }

    async down(db: DatabaseAdapter): Promise<void> {
        await this.dropIndex(db, "idx_budget_daily_spent_date");
        await this.dropIndex(db, "idx_budget_daily_spent_budget_id");
        await this.dropTable(db, "budget_daily_spent");
    }
}
