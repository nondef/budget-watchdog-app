// src/infrastructure/database/migrations/012_add_appearance_columns_to_app_settings.ts
import { BaseMigration } from "./base-migration";
import { DatabaseAdapter } from "@/domain";

export class AddAppearanceColumnsToAppSettings extends BaseMigration {
    version = 12;
    name = "add_appearance_columns_to_app_settings";

    async up(db: DatabaseAdapter): Promise<void> {
        await db.run(`ALTER TABLE app_settings ADD COLUMN hide_amounts INTEGER DEFAULT 0`);
        await db.run(`ALTER TABLE app_settings ADD COLUMN currency_position TEXT DEFAULT 'end'`);
        await db.run(`ALTER TABLE app_settings ADD COLUMN use_digit_grouping INTEGER DEFAULT 1`);
        await db.run(`ALTER TABLE app_settings ADD COLUMN show_decimal_places INTEGER DEFAULT 1`);
        await db.run(`ALTER TABLE app_settings ADD COLUMN decimal_places INTEGER DEFAULT 2`);
        await db.run(`ALTER TABLE app_settings ADD COLUMN week_start_day TEXT DEFAULT 'monday'`);
    }

    async down(_db: DatabaseAdapter): Promise<void> {
        // SQLite ALTER TABLE DROP COLUMN sınırlı; şimdilik no-op.
    }
}
