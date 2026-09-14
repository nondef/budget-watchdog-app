import { describe, expect, it } from 'vitest';
import { Category } from '@/domain';
import { CreateCategoryUseCase } from '@/application/use-cases/category/create-category.use-case';
import { UpdateCategoryUseCase } from '@/application/use-cases/category/update-category.use-case';
import { ListCategoriesUseCase } from '@/application/use-cases/category/list-categories.use-case';

const immediateUow = {
    async run<T>(work: () => Promise<T>): Promise<T> {
        return work();
    },
};

function category(name = 'Market', type: 'income' | 'expense' = 'expense'): Category {
    return Category.create({
        name,
        type,
        icon: 'cart-outline',
        color: 'blue',
    });
}

describe('Category use-cases', () => {
    it('CreateCategory normalize edilmiş duplicate yoksa kaydeder', async () => {
        let saved: Category | undefined;
        const useCase = new CreateCategoryUseCase(
            {
                async findAll() { return []; },
                async save(value: Category) { saved = value; },
            } as any,
            immediateUow
        );

        const result = await useCase.execute({
            name: ' Market ',
            type: 'expense',
            icon: { name: 'cart-outline', color: 'blue' },
        });

        expect(result.name).toBe('Market');
        expect(saved?.name).toBe('Market');
    });

    it('UpdateCategory kullanıcı kategorisinin adını ve ikonunu değiştirir', async () => {
        const entity = category();
        const useCase = new UpdateCategoryUseCase(
            {
                async findById() { return entity; },
                async findAll() { return [entity]; },
                async save() {},
            } as any,
            immediateUow
        );

        const result = await useCase.execute({
            id: entity.id,
            name: 'Gıda',
            icon: { name: 'restaurant-outline' },
        });

        expect(result.name).toBe('Gıda');
        expect(result.icon.name).toBe('restaurant-outline');
    });

    it('ListCategories type filtresini repository sorgusuna aktarır', async () => {
        const expense = category();
        let requestedType: string | undefined;
        const useCase = new ListCategoriesUseCase({
            async findByType(type: string) {
                requestedType = type;
                return [expense];
            },
        } as any);

        const result = await useCase.execute({ type: 'expense' });
        expect(requestedType).toBe('expense');
        expect(result).toHaveLength(1);
    });
});
