import { BaseMigration, ColumnDefinition } from "./base-migration";
import { DatabaseAdapter } from "@/domain";

export class CreateAppSettingsTable extends BaseMigration {
    version = 3;
    name = "create_app_settings_table";

    async up(db: DatabaseAdapter): Promise<void> {
        const columns: ColumnDefinition[] = [
            { name: 'id', type: 'TEXT', primaryKey: true, unique: true },
            { 
                name: "base_currency_id", 
                type: "TEXT", 
                notNull: true,
                unique: true,
                references: { table: "currencies", column: "id" }
            },
            { name: "onboarding_completed", type: "INTEGER", notNull: true, default: 0 },
            { name: "theme", type: "TEXT", default: "dark" },
            { name: "language", type: "TEXT", default: "tr" },
            { name: "created_at", type: "TIMESTAMP" },
        ];

        await this.createTable(db, "app_settings", columns);
    }

    async down(db: DatabaseAdapter): Promise<void> {
        await this.dropTable(db, "app_settings");
    }
}
