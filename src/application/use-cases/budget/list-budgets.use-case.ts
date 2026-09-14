import { IBudgetRepository } from '@/domain/interfaces/budget-repository.interface';
import { BudgetMapper } from '@/application/mappers/budget.mapper';
import { ListBudgetsInput, ListBudgetsOutput } from '@/application/dto/budget.dto';

export class ListBudgetsUseCase {
    constructor(private budgetRepository: IBudgetRepository) {}

    async execute(input: ListBudgetsInput = {}): Promise<ListBudgetsOutput> {
        const budgets = await this.load(input)

        // Repository sorguları tek kriter alıyor; kalan filtreler bellekte
        // uygulanır. Eskiden `load` ilk eşleşen kriteri seçip diğerlerini
        // sessizce düşürüyordu (status + type birlikte verilince type yok
        // sayılıyordu).
        const filtered = budgets.filter(budget =>
            (!input.status || budget.status === input.status) &&
            (!input.type || budget.type === input.type) &&
            (!input.categoryId || budget.hasCategory(input.categoryId))
        )

        return { budgets: BudgetMapper.toDTOList(filtered) }
    }

    /** En seçici kriteri SQL'e taşır; gerisini `execute` bellekte daraltır. */
    private async load(input: ListBudgetsInput) {
        if (input.categoryId) {
            return this.budgetRepository.findByCategory(input.categoryId)
        }

        if (input.status) {
            return this.budgetRepository.findByStatus(input.status)
        }

        if (input.type) {
            return this.budgetRepository.findByType(input.type)
        }

        return this.budgetRepository.findAll()
    }
}
