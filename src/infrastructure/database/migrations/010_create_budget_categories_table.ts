import { BaseMigration, ColumnDefinition } from "./base-migration"
import { DatabaseAdapter } from "@/domain"

export class CreateBudgetCategoriesTable extends BaseMigration {
    version = 10;
    name = "create_budget_categories_table";
    async up(db: DatabaseAdapter): Promise<void> {
        const columns: ColumnDefinition[] = [
            {
                name: "budget_id",
                type: "TEXT",
                notNull: true,
                references: { table: "budgets", column: "id", onDelete: "CASCADE" }
            },
            {
                name: "category_id",
                type: "TEXT",
                notNull: true,
                references: { table: "categories", column: "id", onDelete: "RESTRICT" }
            },
        ];
        await this.createTable(db, "budget_categories", columns);
        await this.createIndex(db, "idx_budget_categories_budget_id", "budget_categories", "budget_id");
        await this.createIndex(db, "idx_budget_categories_category_id", "budget_categories", "category_id");
    }
    async down(db: DatabaseAdapter): Promise<void> {
        await this.dropIndex(db, "idx_budget_categories_category_id");
        await this.dropIndex(db, "idx_budget_categories_budget_id");
        await this.dropTable(db, "budget_categories");
    }
}