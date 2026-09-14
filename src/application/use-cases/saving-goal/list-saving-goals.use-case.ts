import { ISavingGoalRepository } from '@/domain/interfaces/saving-goal-repository.interface';
import { ListSavingGoalsInput, ListSavingGoalsOutput } from '@/application/dto/saving-goal.dto';
import { SavingGoalMapper } from '@/application/mappers/saving-goal.mapper';

/**
 * Hedefleri listeler.
 *
 * `ListSavingGoalsInput/Output` DTO'ları tanımlıydı ama karşılık gelen use-case
 * yoktu; store doğrudan repository + mapper kullanıyordu. Diğer modüllerin
 * (`ListBudgets`, `ListAccounts`, `ListCategories`) sözleşmesine hizalandı.
 */
export class ListSavingGoalsUseCase {
    constructor(private readonly savingGoalRepository: ISavingGoalRepository) {}

    async execute(input: ListSavingGoalsInput = {}): Promise<ListSavingGoalsOutput> {
        const goals = input.status
            ? await this.savingGoalRepository.findByStatus(input.status)
            : await this.savingGoalRepository.findAll();

        // `IRepository.findAll()` sıralama parametresi almıyor; store bunu
        // yalnızca somut sınıfa bağlı olduğu için yapabiliyordu. En yeni önce —
        // liste hedef sayısıyla sınırlı, bellekte sıralamak yeterli.
        const sorted = [...goals].sort(
            (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
        );

        return { savingGoals: SavingGoalMapper.toDTOList(sorted) };
    }
}
