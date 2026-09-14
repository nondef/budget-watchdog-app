import { BaseMigration, ColumnDefinition } from "./base-migration"
import { DatabaseAdapter } from "@/domain"

export class CreateBudgetsTable extends BaseMigration {
    version = 7;
    name = "create_budgets_table";

    async up(db: DatabaseAdapter): Promise<void> {
        const columns: ColumnDefinition[] = [
            { name: "id", type: "TEXT", primaryKey: true, unique: true },
            {
                name: "account_id",
                type: "TEXT",
                notNull: true,
                references: { table: "accounts", column: "id", onDelete: "RESTRICT" }
            },
            {
                name: "currency_id",
                type: "TEXT",
                notNull: true,
                references: { table: "currencies", column: "id", onDelete: "RESTRICT" }
            },
            { name: "name", type: "TEXT", notNull: true },
            { name: "amount", type: "REAL", notNull: true },
            { name: "spent_amount", type: "REAL", notNull: true, default: 0 },
            { name: "type", type: "TEXT", notNull: true, check: "type IN ('daily', 'once', 'weekly', 'monthly', 'yearly')" },
            { name: "icon", type: "TEXT" },
            { name: "icon_bg_color", type: "TEXT" },
            { name: "start_date", type: "TIMESTAMP" },
            { name: "end_date", type: "TIMESTAMP" },
            { name: "enable_notifications", type: "INTEGER", notNull: true, default: 0 },
            { name: "warning_percentage", type: "INTEGER", notNull: true, default: 80 },
            { name: "note", type: "TEXT" },
            { name: "status", type: "TEXT", notNull: true, default: "active", check: "status IN ('active', 'paused', 'completed', 'draft')" },
            { name: "last_reset_date", type: "TIMESTAMP" },
            { name: "next_reset_date", type: "TIMESTAMP" },
            { name: "created_at", type: "TEXT", default: "CURRENT_TIMESTAMP" },
            { name: "updated_at", type: "TEXT", default: "CURRENT_TIMESTAMP" },
        ];

        await this.createTable(db, "budgets", columns);
        await this.createIndex(db, "idx_budgets_status", "budgets", "status");
        await this.createIndex(db, "idx_budgets_account_id", "budgets", "account_id");
        await this.createIndex(db, "idx_budgets_currency_id", "budgets", "currency_id");
    }

    async down(db: DatabaseAdapter): Promise<void> {
        await this.dropIndex(db, "idx_budgets_status");
        await this.dropIndex(db, "idx_budgets_account_id");
        await this.dropIndex(db, "idx_budgets_currency_id");
        await this.dropTable(db, "budgets");
    }
}
