import { BaseMigration } from './base-migration';
import { DatabaseAdapter } from '@/domain';

const MAX_SAFE_MAJOR_AMOUNT = 9_007_199_254_740;

/**
 * Birikim hedefi hareket defteri.
 *
 * `saving_goals.saved_amount` tek bir toplamdı: hedefe ne zaman ne kadar
 * eklendiği hiçbir yerde tutulmuyordu. Daha kötüsü, para ekleme/çekme fon
 * hesabının bakiyesini doğrudan değiştirdiği için (bkz. AddSavingUseCase)
 * hesap bakiyesi işlem geçmişiyle açıklanamaz şekilde oynuyordu — kullanıcı
 * "bu para nereye gitti" sorusunun cevabını bulamıyordu.
 *
 * Bu tablo o boşluğu kapatır: her hareket bir satır. `transactions`'a
 * dokunulmaz — birikim bir gider değildir, oraya yazmak bütçe ve nakit akışı
 * hesaplarını bozardı.
 *
 * `account_id` nullable: hesapsız (023 öncesi) legacy hedeflerde para hareketi
 * yalnızca hedef tarafında olur.
 *
 * `goal_id` CASCADE: hedef silindiğinde ayrılmış fonun tamamı hesaba iade
 * edilir (DeleteSavingGoalUseCase), yani o hedefin satırları net sıfırdır —
 * silinmeleri hesap geçmişinin toplamını bozmaz, aksine öksüz satır bırakmaz.
 *
 * `balance_after`: hareketten SONRA hedefte kalan tutar. Türetilebilir ama
 * satırın yazıldığı andaki entity durumundan alınır; listede "hedef o an ne
 * kadardı" bilgisi için her satırda yeniden toplama yapmayı gerektirmez.
 */
export class CreateSavingGoalContributionsTable extends BaseMigration {
    version = 29;
    name = 'create_saving_goal_contributions_table';

    async up(db: DatabaseAdapter): Promise<void> {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS saving_goal_contributions (
                id TEXT PRIMARY KEY,
                goal_id TEXT NOT NULL,
                account_id TEXT,
                type TEXT NOT NULL CHECK(type IN ('initial', 'deposit', 'withdrawal', 'refund')),
                amount REAL NOT NULL CHECK(amount > 0),
                currency_id TEXT NOT NULL,
                balance_after REAL NOT NULL CHECK(balance_after >= 0),
                note TEXT,
                occurred_at TIMESTAMP NOT NULL,
                FOREIGN KEY (goal_id) REFERENCES saving_goals(id) ON DELETE CASCADE,
                FOREIGN KEY (currency_id) REFERENCES currencies(id) ON DELETE RESTRICT
            )
        `);

        await this.createIndex(
            db,
            'idx_saving_goal_contributions_goal',
            'saving_goal_contributions',
            ['goal_id', 'occurred_at']
        );
        await this.createIndex(
            db,
            'idx_saving_goal_contributions_account',
            'saving_goal_contributions',
            ['account_id', 'occurred_at']
        );

        // 021'deki para bütünlüğü tetikleyicileriyle aynı koruma: CHECK
        // kısıtları tabloyla gelir ama üst sınır kontrolü tetikleyicide.
        for (const operation of ['INSERT', 'UPDATE'] as const) {
            await db.execute(`
                CREATE TRIGGER IF NOT EXISTS validate_saving_goal_contributions_money_${operation.toLowerCase()}
                BEFORE ${operation} ON saving_goal_contributions
                FOR EACH ROW
                WHEN NEW.amount IS NULL OR NEW.amount <= 0 OR
                     NEW.balance_after IS NULL OR NEW.balance_after < 0 OR
                     ABS(NEW.amount) > ${MAX_SAFE_MAJOR_AMOUNT} OR
                     ABS(NEW.balance_after) > ${MAX_SAFE_MAJOR_AMOUNT}
                BEGIN
                    SELECT RAISE(ABORT, 'invalid monetary amount in saving_goal_contributions');
                END
            `);
        }

        // Eldeki hedefler için açılış defteri. Gerçek hareket geçmişi kayıtlı
        // olmadığından tek bir "initial" satırı yazılır: mevcut birikimin
        // nereden geldiğini değil, ne zamandan beri orada olduğunu gösterir.
        // Sıfır bakiyeli hedefler atlanır (amount > 0 kısıtı).
        await db.execute(`
            INSERT INTO saving_goal_contributions
                (id, goal_id, account_id, type, amount, currency_id, balance_after, note, occurred_at)
            SELECT
                'seed-' || sg.id,
                sg.id,
                sg.account_id,
                'initial',
                sg.saved_amount,
                sg.currency_id,
                sg.saved_amount,
                NULL,
                COALESCE(sg.created_at, sg.updated_at)
            FROM saving_goals sg
            WHERE sg.saved_amount > 0
              AND COALESCE(sg.created_at, sg.updated_at) IS NOT NULL
        `);
    }

    async down(db: DatabaseAdapter): Promise<void> {
        await db.execute('DROP TRIGGER IF EXISTS validate_saving_goal_contributions_money_insert');
        await db.execute('DROP TRIGGER IF EXISTS validate_saving_goal_contributions_money_update');
        await this.dropIndex(db, 'idx_saving_goal_contributions_goal');
        await this.dropIndex(db, 'idx_saving_goal_contributions_account');
        await this.dropTable(db, 'saving_goal_contributions');
    }
}
