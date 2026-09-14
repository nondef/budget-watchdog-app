import { BaseMigration, ColumnDefinition } from "./base-migration";
import { DatabaseAdapter } from "@/domain";

export class CreateSavingGoalsTable extends BaseMigration {
    version = 9;
    name = "create_saving_goals_table";

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

    async down(db: DatabaseAdapter): Promise<void> {
        await this.dropIndexes(db, [
            "idx_saving_goals_deadline",
            "idx_saving_goals_currency",
        ]);
        await this.dropTable(db, "saving_goals");
    }
}
