import { BaseMigration } from "./base-migration";
import { DatabaseAdapter } from "@/domain";

export class CreateCurrenciesTable extends BaseMigration {
    version = 1;
    name = "create_currencies_table";

    async up(db: DatabaseAdapter): Promise<void> {
            await this.createTable(db, "currencies",  [
            { name: "id", type: "TEXT", primaryKey: true, unique: true },
            { name: "code", type: "TEXT", notNull: true, unique: true },
            { name: "name", type: "TEXT", notNull: true },
            { name: "symbol", type: "TEXT", notNull: true },
            { name: "country", type: "TEXT", notNull: true },
        ]);
    }

    async down(db: DatabaseAdapter): Promise<void> {
        await this.dropTable(db, "currencies");
    }
}
