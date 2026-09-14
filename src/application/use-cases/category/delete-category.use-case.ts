import { ICategoryRepository } from '@/domain/interfaces/category-repository.interface';
import { ITransactionRepository } from '@/domain/interfaces/transaction-repository.interface';
import { IBudgetRepository } from '@/domain/interfaces/budget-repository.interface';
import {
    CategoryInUseException,
    EntityNotFoundException,
    SystemCategoryException
} from '@/domain/exceptions/domain.exception';
import { DeleteCategoryInput } from '@/application/dto/category.dto';
import { IUnitOfWork } from '@/domain';

export class DeleteCategoryUseCase {
    constructor(
        private categoryRepository: ICategoryRepository,
        private transactionRepository: ITransactionRepository,
        private budgetRepository: IBudgetRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: DeleteCategoryInput): Promise<void> {
        await this.unitOfWork.run(async () => {
            const category = await this.categoryRepository.findById(input.id);

            if (!category) {
                throw new EntityNotFoundException('Category', input.id);
            }
            if (!category.canDelete()) {
                throw new SystemCategoryException('delete');
            }

            const [transactions, budgets] = await Promise.all([
                this.transactionRepository.findByCategory(input.id),
                this.budgetRepository.findByCategory(input.id)
            ]);

            if (transactions.length || budgets.length) {
                throw new CategoryInUseException(input.id);
            }

            await this.categoryRepository.delete(input.id);
        })
    }
}
