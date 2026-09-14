import { Category } from '@/domain/entities/category'
import { CategoryDTO } from "@/application";

/**
 * Category entity → plain DTO (CategoryDTO) dönüşümü.
 *
 * Entity'nin public getter'larını kullanır; private alanlara dokunmaz.
 * Icon value object'i kendi toPlainObject'i ile yaprak değere indirgenir.
 */
export const CategoryMapper = {
    toDTO(entity: Category): CategoryDTO {
        return {
            id: entity.id,
            name: entity.name,
            type: entity.type,
            icon: entity.icon.toPlainObject(),
            isSystem: entity.isSystem,
            createdAt: entity.createdAt!,
            updatedAt: entity.updatedAt!,
        }
    },

    toDTOList(entities: Category[]): CategoryDTO[] {
        return entities.map(entity => this.toDTO(entity))
    },
}
