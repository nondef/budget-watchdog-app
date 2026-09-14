import { Icon } from '@/domain/value-objects/icon';
import { ISavingGoalRepository } from '@/domain/interfaces/saving-goal-repository.interface';
import { EntityNotFoundException } from '@/domain/exceptions/domain.exception';
import { UpdateSavingGoalInput, UpdateSavingGoalOutput } from '@/application/dto/saving-goal.dto';
import { SavingGoalMapper } from '@/application/mappers/saving-goal.mapper';
import { IUnitOfWork } from '@/domain';

export class UpdateSavingGoalUseCase {
    constructor(
        private savingGoalRepository: ISavingGoalRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: UpdateSavingGoalInput): Promise<UpdateSavingGoalOutput> {
        return this.unitOfWork.run(async () => {
            const savingGoal = await this.savingGoalRepository.findById(input.id);

            if (!savingGoal) {
                throw new EntityNotFoundException('SavingGoal', input.id);
            }

            savingGoal.updateDetails({
                name: input.name,
                targetAmount: input.targetAmount,
                ...('targetDate' in input ? { targetDate: input.targetDate } : {}),
                description: input.description
            });

            if (input.icon !== undefined || input.iconColor !== undefined) {
                savingGoal.changeIcon(Icon.create(
                    input.icon ?? savingGoal.icon.name,
                    input.iconColor ?? savingGoal.icon.color
                ));
            }

            await this.savingGoalRepository.save(savingGoal);
            return { savingGoal: SavingGoalMapper.toDTO(savingGoal) };
        })
    }
}
