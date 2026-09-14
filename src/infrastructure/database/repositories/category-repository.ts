import { BaseRepository } from './base-repository';
import { Category, CategoryType } from '@/domain/entities/category';
import { IconCast, BooleanCast } from './casts';
import { DatabaseAdapter } from '@/domain/interfaces/database-adapter';
import { ICategoryRepository } from '@/domain/interfaces/category-repository.interface';

export class CategoryRepository extends BaseRepository<Category> implements ICategoryRepository {
    protected readonly table = 'categories';
    protected readonly entityClass = Category;
    protected readonly casts = {
        icon:     IconCast('icon', 'color', { name: 'folder-outline' }),
        isSystem: BooleanCast('is_system', false),
    };

    constructor(db: DatabaseAdapter) {
        super(db);
    }

    // ========== Custom Queries ==========

    async findByType(type: CategoryType): Promise<Category[]> {
        return this.find({ type }, { orderBy: 'name', direction: 'ASC' });
    }

    findExpenseCategories(): Promise<Category[]> {
        return this.findByType('expense');
    }

    findIncomeCategories(): Promise<Category[]> {
        return this.findByType('income');
    }

    async findSystemCategories(): Promise<Category[]> {
        return this.find({ isSystem: true }, { orderBy: 'name', direction: 'ASC' });
    }

    findSystem(): Promise<Category[]> {
        return this.findSystemCategories();
    }

    async findUserCategories(): Promise<Category[]> {
        return this.find({ isSystem: false }, { orderBy: 'name', direction: 'ASC' });
    }

    findCustom(): Promise<Category[]> {
        return this.findUserCategories();
    }

    async findByIds(ids: string[]): Promise<Category[]> {
        if (ids.length === 0) return [];
        return this.find({ id: [...new Set(ids)] });
    }

    findByName(name: string): Promise<Category | null> {
        return this.findOne({ name });
    }

    /**
     * Ad + tür ikilisiyle arar.
     *
     * `findByName` tek kayıt döndürdüğü için aynı ada sahip gelir ve gider
     * kategorileri bir arada bulunduğunda hangisinin döneceği sıralamaya
     * kalıyordu; duplicate kontrolü bu yüzden kaçabiliyordu.
     */
    findByNameAndType(name: string, type: CategoryType): Promise<Category | null> {
        return this.findOne({ name, type });
    }
}
