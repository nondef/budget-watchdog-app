// src/infrastructure/database/migrations/011_add_exchange_rate_buy_sell_columns.ts
import { BaseMigration } from "./base-migration";
import { DatabaseAdapter } from "@/domain";
export class AddExchangeRateBuySellColumns extends BaseMigration {
    version = 11;
    name = "add_exchange_rate_buy_sell_columns";
    async up(db: DatabaseAdapter): Promise<void> {
        await db.run(`ALTER TABLE exchange_rates ADD COLUMN buying_rate REAL`);
        await db.run(`ALTER TABLE exchange_rates ADD COLUMN selling_rate REAL`);
        await db.run(`ALTER TABLE exchange_rates ADD COLUMN change_rate REAL`);
    }
    async down(_db: DatabaseAdapter): Promise<void> {
        // SQLite ALTER TABLE DROP COLUMN sınırlı; şimdilik no-op ya da tablo yeniden oluştur
    }
}
