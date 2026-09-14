import { BaseMigration } from "./base-migration";
import { DatabaseAdapter } from "@/domain";

const MAX_SAFE_MAJOR_AMOUNT = 9_007_199_254_740;

/**
 * Transfer'in hedef bacağını kalıcılaştırır: kur dönüşümlü transferde hedef
 * hesaba yatan tutar kaynaktan farklı olabilir (farklı para birimi/tutar).
 * Hedef tutar saklanmazsa silme/güncelleme geri almaları kaynağın tutarını
 * hedeften düşer ve bakiye bozulurdu.
 *
 * Kolonlar nullable: transfer olmayan işlemlerde ve bu migration'dan önce
 * oluşturulmuş (hep aynı-para) transferlerde NULL kalır; repository bunları
 * `undefined` hedef tutara hydrate eder ve geri alma kaynak tutara düşer.
 */
export class AddTransferDestinationAmount extends BaseMigration {
    version = 22;
    name = "add_transfer_destination_amount";

    async up(db: DatabaseAdapter): Promise<void> {
        await db.run(`ALTER TABLE transactions ADD COLUMN to_amount REAL`);
        await db.run(`ALTER TABLE transactions ADD COLUMN to_currency_id TEXT`);
        await db.run(
            `ALTER TABLE transactions ADD COLUMN to_minor_unit INTEGER`
        );

        // Hedef tutar dolu ise pozitif ve güvenli aralıkta olmalı — kaynak
        // `amount` için 021'de kurulan bütünlük guard'ıyla aynı çizgi.
        for (const operation of ['INSERT', 'UPDATE'] as const) {
            const triggerName = `validate_transactions_to_amount_${operation.toLowerCase()}`;
            await db.execute(`
                CREATE TRIGGER IF NOT EXISTS ${triggerName}
                BEFORE ${operation} ON transactions
                FOR EACH ROW
                WHEN NEW.to_amount IS NOT NULL AND
                     (NEW.to_amount <= 0 OR ABS(NEW.to_amount) > ${MAX_SAFE_MAJOR_AMOUNT})
                BEGIN
                    SELECT RAISE(ABORT, 'invalid destination amount in transactions');
                END
            `);
        }
    }

    async down(db: DatabaseAdapter): Promise<void> {
        await db.execute(`DROP TRIGGER IF EXISTS validate_transactions_to_amount_insert`);
        await db.execute(`DROP TRIGGER IF EXISTS validate_transactions_to_amount_update`);
        // SQLite ALTER TABLE DROP COLUMN sınırlı; kolonlar no-op bırakılır.
    }
}
