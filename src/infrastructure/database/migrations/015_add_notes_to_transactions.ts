import { BaseMigration } from "./base-migration";
import { DatabaseAdapter } from "@/domain";

export class AddNotesToTransactions extends BaseMigration {
    version = 15;
    name = "add_notes_to_transactions";

    async up(db: DatabaseAdapter): Promise<void> {
        await db.run(`ALTER TABLE transactions ADD COLUMN notes TEXT`);
    }

    async down(_db: DatabaseAdapter): Promise<void> {
        // SQLite ALTER TABLE DROP COLUMN sınırlı; şimdilik no-op.
    }
}
