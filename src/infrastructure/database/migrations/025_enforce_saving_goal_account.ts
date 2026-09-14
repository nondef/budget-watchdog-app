import { BaseMigration } from './base-migration';
import { DatabaseAdapter } from '@/domain';

/**
 * `saving_goals.account_id` ALTER TABLE ile eklendiği için eski Android SQLite
 * sürümlerinde güvenilir bir FK tanımlanamadı. Bu trigger'lar yeni orphan
 * kayıtları ve bağlı hesabın DB seviyesinde silinmesini engeller.
 */
export class EnforceSavingGoalAccount extends BaseMigration {
    version = 25;
    name = 'enforce_saving_goal_account';

    async up(db: DatabaseAdapter): Promise<void> {
        await db.execute(`
            CREATE TRIGGER IF NOT EXISTS validate_saving_goal_account_insert
            BEFORE INSERT ON saving_goals
            FOR EACH ROW
            WHEN NEW.account_id IS NOT NULL
             AND NOT EXISTS (
                SELECT 1 FROM accounts WHERE id = NEW.account_id
             )
            BEGIN
                SELECT RAISE(ABORT, 'saving goal account does not exist');
            END
        `);

        await db.execute(`
            CREATE TRIGGER IF NOT EXISTS validate_saving_goal_account_update
            BEFORE UPDATE OF account_id ON saving_goals
            FOR EACH ROW
            WHEN NEW.account_id IS NOT NULL
             AND NOT EXISTS (
                SELECT 1 FROM accounts WHERE id = NEW.account_id
             )
            BEGIN
                SELECT RAISE(ABORT, 'saving goal account does not exist');
            END
        `);

        await db.execute(`
            CREATE TRIGGER IF NOT EXISTS restrict_account_delete_with_saving_goals
            BEFORE DELETE ON accounts
            FOR EACH ROW
            WHEN EXISTS (
                SELECT 1 FROM saving_goals WHERE account_id = OLD.id
            )
            BEGIN
                SELECT RAISE(ABORT, 'account is used by a saving goal');
            END
        `);
    }

    async down(db: DatabaseAdapter): Promise<void> {
        await db.execute(
            'DROP TRIGGER IF EXISTS validate_saving_goal_account_insert'
        );
        await db.execute(
            'DROP TRIGGER IF EXISTS validate_saving_goal_account_update'
        );
        await db.execute(
            'DROP TRIGGER IF EXISTS restrict_account_delete_with_saving_goals'
        );
    }
}
