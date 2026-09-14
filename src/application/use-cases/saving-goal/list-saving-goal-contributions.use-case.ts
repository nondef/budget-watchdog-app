import { ICurrencyRepository, ISavingGoalContributionRepository, IUnitOfWork } from '@/domain';
import { SavingGoalContributionMapper } from '@/application/mappers/saving-goal-contribution.mapper';
import {
    ListSavingGoalContributionsInput,
    ListSavingGoalContributionsOutput,
} from '@/application/dto/saving-goal.dto';

/**
 * Bir hedefin hareket geçmişi (en yeni önce).
 *
 * Kardeş okuma use-case'leriyle aynı desen: `read()` varsa liste tek snapshot
 * içinde okunur, yoksa iş doğrudan çalışır.
 */
export class ListSavingGoalContributionsUseCase {
    constructor(
        private contributionRepository: ISavingGoalContributionRepository,
        private currencyRepository: ICurrencyRepository,
        private unitOfWork?: IUnitOfWork
    ) {}

    async execute(input: ListSavingGoalContributionsInput): Promise<ListSavingGoalContributionsOutput> {
        const runRead =
            this.unitOfWork?.read?.bind(this.unitOfWork)
            ?? this.unitOfWork?.run?.bind(this.unitOfWork)
            ?? (<T>(work: () => Promise<T>) => work());

        return runRead(async () => {
            const entries = await this.contributionRepository.findByGoal(input.goalId);

            // `minorUnit` defterde tutulmuyor; para birimi başına bir kez okunur.
            const minorUnits = new Map<string, number>();
            for (const currencyId of new Set(entries.map(e => e.currencyId))) {
                const currency = await this.currencyRepository.findById(currencyId);
                minorUnits.set(currencyId, currency?.minorUnit ?? 2);
            }

            return {
                contributions: SavingGoalContributionMapper.toDTOList(
                    entries,
                    currencyId => minorUnits.get(currencyId) ?? 2
                ),
            };
        });
    }
}
