import { IBudgetRepository } from '@/domain/interfaces/budget-repository.interface';
import { BudgetDTO } from '@/application/dto/budget.dto';
import { BudgetMapper } from '@/application/mappers/budget.mapper';

/**
 * Tek bütçeyi DTO olarak getirir.
 *
 * Store bunu doğrudan repository + mapper ile yapıyordu; `GetAccountUseCase`
 * ile aynı sözleşmeye alındı (bulunamazsa `null`).
 */
export class GetBudgetUseCase {
    constructor(private readonly budgetRepository: IBudgetRepository) {}

    async execute(input: { id: string }): Promise<BudgetDTO | null> {
        const budget = await this.budgetRepository.findById(input.id);

        return budget ? BudgetMapper.toDTO(budget) : null;
    }
}
