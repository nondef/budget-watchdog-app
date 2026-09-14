import { BaseMigration, ColumnDefinition } from "./base-migration";
import { DatabaseAdapter } from "@/domain";

export class CreateCategoriesTable extends BaseMigration {
    version = 2;
    name = "create_categories_table";

    async up(db: DatabaseAdapter): Promise<void> {
        const columns: ColumnDefinition[] = [
            { name: "id", type: "TEXT", primaryKey: true, unique: true },
            { name: "name", type: "TEXT", notNull: true },
            { name: "icon", type: "TEXT" },
            { name: "color", type: "TEXT" },
            { name: "type", type: "TEXT", notNull: true, check: "type IN ('income', 'expense', 'transfer')" },
        ];

        await this.createTable(db, "categories", columns);
    }

    async down(db: DatabaseAdapter): Promise<void> {
        await this.dropTable(db, "categories");
    }
}
