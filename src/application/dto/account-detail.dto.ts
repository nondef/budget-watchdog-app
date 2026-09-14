import { IMoney } from '@/domain';
import { AccountDTO } from '@/application/dto/account.dto';
import { BudgetDTO } from '@/application/dto/budget.dto';
import { TransactionDTO } from '@/application/dto/transaction.dto';
import { SavingGoalContributionDTO, SavingGoalDTO } from '@/application/dto/saving-goal.dto';

/**
 * Hesap hareketinin kaynağı.
 *
 * `savingGoal` satırları `transactions` tablosunda YOKTUR: birikim hedefine
 * para ayırmak bir gider değildir (bütçe/nakit akışı hesaplarına girmemeli),
 * ama hesap bakiyesini değiştirir. Bu iki kaynağı yalnızca burada, gösterim
 * için birleştiriyoruz.
 */
export type AccountMovementKind = 'transaction' | 'savingGoal';

/** Hesap açısından paranın yönü. */
export type AccountMovementDirection = 'in' | 'out';

export interface AccountMovementBudgetRef {
    budgetId: string;
    budgetName: string;
    /** İşlemin o bütçeye yansıyan tutarı. */
    amount: IMoney;
}

export interface AccountMovementDTO {
    /** Kaynak kaydın id'si; liste anahtarı olarak kullanılır. */
    id: string;
    kind: AccountMovementKind;
    direction: AccountMovementDirection;
    /** Hareketin bu hesaba yansıyan tutarı (her zaman pozitif). */
    amount: IMoney;
    occurredAt: Date;

    /** kind === 'transaction' */
    transaction?: TransactionDTO;
    /**
     * İşlemin hangi bütçe(ler)e yazıldığı. Yalnızca giderlerde dolu olur;
     * `transaction_budget_effects` defterinden gelir, yeniden eşleştirme
     * yapılmaz — bütçeye gerçekten ne yazıldığının tek kaydı odur.
     */
    budgets?: AccountMovementBudgetRef[];

    /** kind === 'savingGoal' */
    contribution?: SavingGoalContributionDTO;
    savingGoalName?: string;
}

export interface AccountDetailTotals {
    income: IMoney;
    expense: IMoney;
    /** Birikim hedeflerine ayrılan net tutar (eklenen − geri çekilen). */
    allocatedToGoals: IMoney;
    transactionCount: number;
    movementCount: number;
}

export interface GetAccountDetailInput {
    accountId: string;
    /** Hareket listesinde gösterilecek azami kayıt (varsayılan 100). */
    movementLimit?: number;
}

export interface GetAccountDetailOutput {
    account: AccountDTO;
    movements: AccountMovementDTO[];
    /** Bu hesaba bağlı bütçeler. */
    budgets: BudgetDTO[];
    /** Fon hesabı bu olan birikim hedefleri. */
    savingGoals: SavingGoalDTO[];
    totals: AccountDetailTotals;
    /** Hareket sayısı `movementLimit`e takıldıysa true. */
    hasMoreMovements: boolean;
}
