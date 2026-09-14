import {
    ISavingGoalContributionRepository,
    SavingGoalContribution,
    SavingGoalContributionType,
} from '@/domain';
import { SavingGoal } from '@/domain/entities/saving-goal';
import { uuid } from '@/shared/utils/id/uuid';

export interface RecordContributionInput {
    goal: SavingGoal;
    type: SavingGoalContributionType;
    /** Hareketin (pozitif) tutarı. */
    amount: number;
    note?: string;
    occurredAt?: Date;
}

/**
 * Hedef üzerindeki para hareketini deftere yazar.
 *
 * Çağıran use-case'ler bunu hedef **güncellendikten sonra** çağırır: satırdaki
 * `balanceAfter` entity'nin o anki `savedAmount`'ından okunur, ayrıca
 * hesaplanmaz. Böylece defter ile hedef toplamı aynı kaynaktan gelir.
 *
 * Repository opsiyoneldir: defter, para hareketinin kendisi için zorunlu
 * değildir — enjekte edilmemişse (eski çağrı yerleri, testler) kayıt atlanır ve
 * asıl iş bozulmaz.
 */
export async function recordSavingGoalContribution(
    repository: ISavingGoalContributionRepository | undefined,
    input: RecordContributionInput
): Promise<SavingGoalContribution | null> {
    if (!repository) return null;

    // Sıfır/negatif hareket deftere girmez: tabloda `amount > 0` kısıtı var ve
    // sıfır tutarlı bir satır kullanıcıya da bir şey anlatmaz.
    if (!(input.amount > 0)) return null;

    const contribution: SavingGoalContribution = {
        id: uuid(),
        goalId: input.goal.id,
        accountId: input.goal.accountId,
        type: input.type,
        amount: input.amount,
        currencyId: input.goal.savedAmount.currencyId,
        balanceAfter: input.goal.savedAmount.amount,
        note: input.note,
        occurredAt: input.occurredAt ?? new Date(),
    };

    await repository.save(contribution);

    return contribution;
}
