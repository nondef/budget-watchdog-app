import { Icon } from '@/domain/value-objects/icon';
import { ICategoryRepository } from '@/domain/interfaces/category-repository.interface';
import {
    EntityAlreadyExistsException,
    EntityNotFoundException,
    SystemCategoryException
} from '@/domain/exceptions/domain.exception';
import { CategoryDTO, UpdateCategoryInput } from '@/application/dto/category.dto';
import { CategoryMapper } from '@/application/mappers';
import { IUnitOfWork } from '@/domain';
import { normalizeCategoryName as normalizeName } from '@/shared/utils/string/normalize';

export class UpdateCategoryUseCase {
    constructor(
        private categoryRepository: ICategoryRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: UpdateCategoryInput): Promise<CategoryDTO> {
        return this.unitOfWork.run(async () => {
            const category = await this.categoryRepository.findById(input.id);

            if (!category) {
                throw new EntityNotFoundException('Category', input.id);
            }
            if (category.isSystem && input.name !== undefined) {
                throw new SystemCategoryException('rename');
            }

            if (input.name !== undefined) {
                const normalized = normalizeName(input.name);
                const duplicate = (await this.categoryRepository.findAll())
                    .find(other =>
                        other.id !== category.id &&
                        other.type === category.type &&
                        normalizeName(other.name) === normalized
                    );

                if (duplicate) {
                    throw new EntityAlreadyExistsException('Category', {
                        name: input.name.trim(),
                        type: category.type
                    });
                }

                category.rename(input.name);
            }

            if (input.icon !== undefined) {
                category.changeIcon(Icon.create(
                    input.icon.name ?? category.icon.name,
                    input.icon.color ?? category.icon.color
                ));
            }

            await this.categoryRepository.save(category);
            return CategoryMapper.toDTO(category);
        })
    }
}
