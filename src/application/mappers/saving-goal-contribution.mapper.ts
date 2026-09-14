import { SavingGoalContribution } from '@/domain';
import { SavingGoalContributionDTO } from '@/application/dto/saving-goal.dto';

/**
 * Defter satırı → DTO.
 *
 * `minorUnit` satırda tutulmaz (defter tutarları hedefin para biriminde ve
 * hedefle aynı ondalık hassasiyette yazılır); çağıran use-case ilgili
 * currency'nin `minorUnit`'ini geçirir ki presentation `IMoney`'i eksiksiz
 * alsın.
 */
export const SavingGoalContributionMapper = {
    toDTO(entry: SavingGoalContribution, minorUnit: number): SavingGoalContributionDTO {
        return {
            id: entry.id,
            goalId: entry.goalId,
            accountId: entry.accountId,
            type: entry.type,
            amount: {
                amount: entry.amount,
                currencyId: entry.currencyId,
                minorUnit,
            },
            balanceAfter: {
                amount: entry.balanceAfter,
                currencyId: entry.currencyId,
                minorUnit,
            },
            note: entry.note,
            occurredAt: entry.occurredAt,
        };
    },

    toDTOList(
        entries: SavingGoalContribution[],
        minorUnitOf: (currencyId: string) => number
    ): SavingGoalContributionDTO[] {
        return entries.map(entry => this.toDTO(entry, minorUnitOf(entry.currencyId)));
    },
};
