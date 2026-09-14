import { BaseMigration } from './base-migration';
import { DatabaseAdapter } from '@/domain';

const MAX_SAFE_MAJOR_AMOUNT = 9_007_199_254_740;

/**
 * 021'in `accounts` guard'ı `NEW.balance < 0` görünce koşulsuz ABORT ediyordu,
 * ama domain kredi hesaplarında borç bakiyesini açıkça meşru sayıyor (bkz.
 * `Account.typeAllowsNegativeBalance` ve `withdraw`'ın kredi hesabında bakiye
 * kontrolünü atlaması). Sonuç: kredi kartına bakiyesinden büyük bir harcama
 * girmek — özelliğin bütün varlık sebebi — `save()` sırasında
 * 'invalid monetary amount in accounts' ile patlıyordu.
 *
 * Guard tamamen kaldırılmıyor: kredi dışı tiplerde eksi bakiye hâlâ hata, ve
 * büyüklük sınırı bütün tiplerde geçerli kalıyor.
 *
 * Trigger'lar 021'de `IF NOT EXISTS` ile kurulduğu için sahadaki kurulumlarda
 * yeniden yazılmıyor; önce DROP edilip yeniden yaratılıyorlar.
 */
export class AllowCreditAccountNegativeBalance extends BaseMigration {
    version = 28;
    name = 'allow_credit_account_negative_balance';

    /** Kredi hesabı eksiye düşebilir; diğer tipler düşemez. Sınır her tipte aynı. */
    private readonly condition =
        `NEW.balance IS NULL OR ` +
        `(NEW.balance < 0 AND NEW.type != 'credit') OR ` +
        `ABS(NEW.balance) > ${MAX_SAFE_MAJOR_AMOUNT}`;

    async up(db: DatabaseAdapter): Promise<void> {
        for (const operation of ['INSERT', 'UPDATE'] as const) {
            const triggerName = `validate_accounts_money_${operation.toLowerCase()}`;

            await db.execute(`DROP TRIGGER IF EXISTS ${triggerName}`);
            await db.execute(`
                CREATE TRIGGER ${triggerName}
                BEFORE ${operation} ON accounts
                FOR EACH ROW
                WHEN ${this.condition}
                BEGIN
                    SELECT RAISE(ABORT, 'invalid monetary amount in accounts');
                END
            `);
        }
    }

    /** 021'in koşulsuz guard'ını geri kurar. */
    async down(db: DatabaseAdapter): Promise<void> {
        const original =
            `NEW.balance IS NULL OR NEW.balance < 0 OR ` +
            `ABS(NEW.balance) > ${MAX_SAFE_MAJOR_AMOUNT}`;

        for (const operation of ['INSERT', 'UPDATE'] as const) {
            const triggerName = `validate_accounts_money_${operation.toLowerCase()}`;

            await db.execute(`DROP TRIGGER IF EXISTS ${triggerName}`);
            await db.execute(`
                CREATE TRIGGER ${triggerName}
                BEFORE ${operation} ON accounts
                FOR EACH ROW
                WHEN ${original}
                BEGIN
                    SELECT RAISE(ABORT, 'invalid monetary amount in accounts');
                END
            `);
        }
    }
}
