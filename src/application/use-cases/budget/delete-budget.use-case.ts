import { IBudgetRepository } from '@/domain/interfaces/budget-repository.interface';
import { EntityNotFoundException } from '@/domain/exceptions/domain.exception';
import { IUnitOfWork } from '@/domain';

export class DeleteBudgetUseCase {
    constructor(
        private budgetRepository: IBudgetRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: { id: string }): Promise<void> {
        await this.unitOfWork.run(async () => {
            const budget = await this.budgetRepository.findById(input.id);

            if (!budget) {
                throw new EntityNotFoundException('Budget', input.id);
            }

            await this.budgetRepository.delete(input.id);
        });
    }
}
