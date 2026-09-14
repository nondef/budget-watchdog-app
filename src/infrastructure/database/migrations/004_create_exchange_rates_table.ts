import { BaseMigration, ColumnDefinition } from "./base-migration";
import { DatabaseAdapter } from "@/domain";

export class CreateExchangeRatesTable extends BaseMigration {
    version = 4;
    name = "create_exchange_rates_table";

    async up(db: DatabaseAdapter): Promise<void> {
        const columns: ColumnDefinition[] = [
            { name: "id", type: "TEXT", primaryKey: true, unique: true },
            { 
                name: "base_currency_id", 
                type: "TEXT", 
                notNull: true,
                references: { table: "currencies", column: "id" }
            },
            { 
                name: "target_currency_id", 
                type: "TEXT", 
                notNull: true,
                references: { table: "currencies", column: "id" }
            },
            { name: "rate", type: "REAL", notNull: true },
            { name: "fetch_date", type: "TIMESTAMP", notNull: true },
        ];

        await this.createTable(db, "exchange_rates", columns);

        await this.createIndexes(db, [
            { name: "idx_exchange_rates_base_currency", table: "exchange_rates", columns: "base_currency_id" },
            { name: "idx_exchange_rates_target_currency", table: "exchange_rates", columns: "target_currency_id" },
            { name: "idx_exchange_rates_fetch_date", table: "exchange_rates", columns: "fetch_date" },
        ]);
    }

    async down(db: DatabaseAdapter): Promise<void> {
        await this.dropIndexes(db, [
            "idx_exchange_rates_base_currency",
            "idx_exchange_rates_target_currency",
            "idx_exchange_rates_fetch_date",
        ]);
        await this.dropTable(db, "exchange_rates");
    }
}
