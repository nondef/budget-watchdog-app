import { SavingGoal, SavingGoalStatus } from '../entities/saving-goal';
import { IRepository } from './repository.interface';

export interface ISavingGoalRepository extends IRepository<SavingGoal> {
    findActive(): Promise<SavingGoal[]>;
    findByAccount(accountId: string): Promise<SavingGoal[]>;
    findByStatus(status: SavingGoalStatus): Promise<SavingGoal[]>;
    findCompleted(): Promise<SavingGoal[]>;
    findOverdue(now?: Date): Promise<SavingGoal[]>;
    findNearingDeadline(daysAhead?: number, now?: Date): Promise<SavingGoal[]>;
    getTotalSaved(currencyId: string): Promise<number>;
    getTotalTarget(currencyId: string): Promise<number>;
}

