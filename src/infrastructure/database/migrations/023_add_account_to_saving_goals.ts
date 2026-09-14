import { BaseMigration } from "./base-migration";
import { DatabaseAdapter } from "@/domain";

/**
 * Birikim hedeflerini bir fon hesabına bağlar: hedefe para eklendiğinde bu
 * hesaptan düşülür, geri çekildiğinde/hedef silindiğinde iade edilir. Böylece
 * "biriken tutar" hesap bakiyeleriyle çift sayılmaz.
 *
 * Nullable: bu migration'dan önce oluşturulmuş hedefler hesapsız kalır ve
 * eski (sanal) davranışı sürdürür — repository onları `undefined` account'a
 * hydrate eder, use-case'ler para hareketini atlar.
 *
 * FK verilmez: SQLite'ın eski Android sürümlerinde `ALTER TABLE ADD COLUMN`
 * ile REFERENCES güvenilir değil (020 de kolonları FK'sız ekledi). Hesap
 * silindiğinde bağlı hedef kalırsa `DeleteAccountUseCase` guard'ı devreye girer.
 */
export class AddAccountToSavingGoals extends BaseMigration {
    version = 23;
    name = "add_account_to_saving_goals";

    async up(db: DatabaseAdapter): Promise<void> {
        await db.run(`ALTER TABLE saving_goals ADD COLUMN account_id TEXT`);
    }

    async down(_db: DatabaseAdapter): Promise<void> {
        // SQLite ALTER TABLE DROP COLUMN sınırlı; no-op.
    }
}
