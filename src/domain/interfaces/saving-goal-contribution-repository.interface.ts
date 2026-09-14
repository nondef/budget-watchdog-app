/**
 * Birikim hedefi hareket türü.
 *
 * - `initial`   : hedef oluşturulurken konan başlangıç tutarı
 * - `deposit`   : hedefe sonradan eklenen para
 * - `withdrawal`: hedeften kullanıcı isteğiyle geri çekilen para
 * - `refund`    : hedef iptal edildiğinde fon hesabına dönen kalan tutar
 */
export type SavingGoalContributionType = 'initial' | 'deposit' | 'withdrawal' | 'refund';

/** Hedeften para ÇIKARAN (fon hesabına iade eden) hareket türleri. */
export const OUTGOING_CONTRIBUTION_TYPES: readonly SavingGoalContributionType[] = [
    'withdrawal',
    'refund',
];

export interface SavingGoalContribution {
    id: string;
    goalId: string;
    /** Fon hesabı; hesapsız (legacy) hedeflerde yok. */
    accountId?: string;
    type: SavingGoalContributionType;
    /** Her zaman pozitif; yön `type` ile belirlenir. */
    amount: number;
    currencyId: string;
    /** Hareketten sonra hedefte kalan tutar. */
    balanceAfter: number;
    note?: string;
    occurredAt: Date;
}

export interface ISavingGoalContributionRepository {
    findByGoal(goalId: string): Promise<SavingGoalContribution[]>;
    /** Hesap hareket geçmişi için; `limit` verilmezse tümü. */
    findByAccount(accountId: string, limit?: number): Promise<SavingGoalContribution[]>;
    /** Birden çok hedefin hareketleri (hesap detayında tek sorguda ad eşlemesi için). */
    findByGoals(goalIds: string[]): Promise<SavingGoalContribution[]>;
    save(contribution: SavingGoalContribution): Promise<void>;
    deleteByGoal(goalId: string): Promise<void>;
}
