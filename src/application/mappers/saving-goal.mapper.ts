import { SavingGoal } from '@/domain/entities/saving-goal'
import { SavingGoalDTO } from "@/application";

/**
 * SavingGoal entity → plain DTO (SavingGoalDTO) dönüşümü.
 */
export const SavingGoalMapper = {
    toDTO(entity: SavingGoal): SavingGoalDTO {
        return {
            id: entity.id,
            name: entity.name,
            targetAmount: entity.targetAmount.toPlainObject(),
            savedAmount: entity.savedAmount.toPlainObject(),
            targetDate: entity.targetDate,
            status: entity.status,
            icon: entity.icon.toPlainObject(),
            description: entity.description,
            accountId: entity.accountId,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        }
    },

    toDTOList(entities: SavingGoal[]): SavingGoalDTO[] {
        return entities.map(entity => this.toDTO(entity))
    },
}
