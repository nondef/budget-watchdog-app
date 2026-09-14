import { ICategoryRepository } from "@/domain";
import { CategoryMapper } from "@/application/mappers";
import { CategoryDTO } from "@/application/dto/category.dto";
import { CategoryType } from "@/domain/entities/category";

export interface ListCategoriesInput {
    type?: CategoryType
}

export class ListCategoriesUseCase {
    constructor(private readonly categoryRepository: ICategoryRepository) {}

    async execute(input: ListCategoriesInput = {}): Promise<CategoryDTO[]> {
        const categories = input.type
            ? await this.categoryRepository.findByType(input.type)
            : await this.categoryRepository.findAll()

        return CategoryMapper.toDTOList(categories)
    }
}
