import { Category, CategoryType } from '../entities/category';
import { IRepository } from './repository.interface';

export interface ICategoryRepository extends IRepository<Category> {
    findByType(type: CategoryType): Promise<Category[]>;
    findSystem(): Promise<Category[]>;
    findCustom(): Promise<Category[]>;
    findByIds(ids: string[]): Promise<Category[]>;
    findByName(name: string): Promise<Category | null>;
    findByNameAndType(name: string, type: CategoryType): Promise<Category | null>;
}

