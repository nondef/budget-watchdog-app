import { ISavingGoalRepository } from '@/domain/interfaces/saving-goal-repository.interface';
import { SavingGoalDTO } from '@/application/dto/saving-goal.dto';
import { SavingGoalMapper } from '@/application/mappers/saving-goal.mapper';

/**
 * Tek hedefi DTO olarak getirir (`GetAccountUseCase` ile aynı sözleşme:
 * bulunamazsa `null`).
 */
export class GetSavingGoalUseCase {
    constructor(private readonly savingGoalRepository: ISavingGoalRepository) {}

    async execute(input: { id: string }): Promise<SavingGoalDTO | null> {
        const goal = await this.savingGoalRepository.findById(input.id);

        return goal ? SavingGoalMapper.toDTO(goal) : null;
    }
}
