import { BaseMigration, ColumnDefinition } from "./base-migration";
import { DatabaseAdapter } from "@/domain";

export class CreateTransactionsTable extends BaseMigration {
    version = 6;
    name = "create_transactions_table";

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
                name: "to_account_id",
                type: "TEXT",
                notNull: false,
                references: { table: "accounts", column: "id", onDelete: "RESTRICT" }
            },
            { 
                name: "category_id", 
                type: "TEXT", 
                notNull: false,
                references: { table: "categories", column: "id", onDelete: "RESTRICT" }
            },
            { 
                name: "currency_id", 
                type: "TEXT", 
                notNull: true,
                references: { table: "currencies", column: "id", onDelete: "RESTRICT" }
            },
            { name: "title", type: "TEXT", notNull: true },
            { name: "amount", type: "REAL", notNull: true },
            { name: "description", type: "TEXT", notNull: false },
            { name: "date", type: "TIMESTAMP", notNull: true },
            { name: "type", type: "TEXT", notNull: true, check: "type IN ('income', 'expense', 'transfer')" },
            { name: "created_at", type: "TEXT", default: "CURRENT_TIMESTAMP" },
            { name: "updated_at", type: "TEXT", default: "CURRENT_TIMESTAMP" },
        ];

        await this.createTable(db, "transactions", columns);

        await this.createIndexes(db, [
            { name: "idx_transactions_date", table: "transactions", columns: "date" },
            { name: "idx_transactions_type", table: "transactions", columns: "type" },
            { name: "idx_transactions_category", table: "transactions", columns: "category_id" },
        ]);
    }

    async down(db: DatabaseAdapter): Promise<void> {
        await this.dropIndexes(db, [
            "idx_transactions_date",
            "idx_transactions_type",
            "idx_transactions_category",
        ]);
        await this.dropTable(db, "transactions");
    }
}
