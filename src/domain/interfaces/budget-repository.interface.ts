import { Budget, BudgetType, BudgetStatus } from '../entities/budget';
import { IRepository } from './repository.interface';

export interface IBudgetRepository extends IRepository<Budget> {
    findActive(): Promise<Budget[]>;
    findByStatus(status: BudgetStatus): Promise<Budget[]>;
    findByType(type: BudgetType): Promise<Budget[]>;
    findByCategory(categoryId: string): Promise<Budget[]>;
    findByAccount(accountId: string): Promise<Budget[]>;
    /** @param now Karşılaştırma anı; verilmezse "şimdi". */
    findNeedingReset(now?: Date): Promise<Budget[]>;
}

