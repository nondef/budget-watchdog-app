import { Category } from '@/domain/entities/category';
import { ICategoryRepository } from '@/domain/interfaces/category-repository.interface';
import { EntityAlreadyExistsException } from '@/domain/exceptions/domain.exception';
import { CategoryDTO, CreateCategoryInput } from '@/application/dto/category.dto';
import { CategoryMapper } from '@/application/mappers';
import { IUnitOfWork } from '@/domain';
import { normalizeCategoryName as normalizeName } from '@/shared/utils/string/normalize';

export class CreateCategoryUseCase {
    constructor(
        private categoryRepository: ICategoryRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: CreateCategoryInput): Promise<CategoryDTO> {
        return this.unitOfWork.run(async () => {
            const name = input.name.trim();
            const normalized = normalizeName(name);
            const existing = (await this.categoryRepository.findAll())
                .find(category =>
                    category.type === input.type &&
                    normalizeName(category.name) === normalized
                );

            if (existing) {
                throw new EntityAlreadyExistsException('Category', { name, type: input.type });
            }

            const category = Category.create({
                name,
                type: input.type,
                icon: input.icon.name,
                color: input.icon.color
            });

            await this.categoryRepository.save(category);
            return CategoryMapper.toDTO(category);
        })
    }
}
