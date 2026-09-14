import { BaseMigration, ColumnDefinition } from "./base-migration";
import { DatabaseAdapter } from "@/domain";

export class CreateAccountsTable extends BaseMigration {
    version = 5;
    name = "create_accounts_table";

    async up(db: DatabaseAdapter): Promise<void> {
        const columns: ColumnDefinition[] = [
            { name: "id", type: "TEXT", primaryKey: true, unique: true },
            { 
                name: "currency_id", 
                type: "TEXT", 
                notNull: true,
                references: { table: "currencies", column: "id", onDelete: "RESTRICT" }
            },
            { name: "name", type: "TEXT", notNull: true },
            { name: "type", type: "TEXT", notNull: true, check: "type IN ('cash', 'bank', 'credit', 'investment', 'savings')" },
            { name: "balance", type: "REAL", notNull: true, default: 0 },
            { name: "color", type: "TEXT", notNull: true },
            { name: "icon", type: "TEXT", notNull: true },
            { name: "notes", type: "TEXT", notNull: false },
            { name: "is_active", type: "INTEGER", notNull: true, default: 1 },
            { name: "created_at", type: "TEXT", default: "CURRENT_TIMESTAMP" },
            { name: "updated_at", type: "TEXT", default: "CURRENT_TIMESTAMP" },
        ];

        await this.createTable(db, "accounts", columns);
        await this.createIndex(db, "idx_accounts_is_active", "accounts", "is_active");
    }

    async down(db: DatabaseAdapter): Promise<void> {
        await this.dropIndex(db, "idx_accounts_is_active");
        await this.dropTable(db, "accounts");
    }
}
