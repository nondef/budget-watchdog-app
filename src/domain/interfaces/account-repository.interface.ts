import { Account, AccountType } from '../entities/account';
import { IRepository } from './repository.interface';

export interface IAccountRepository extends IRepository<Account> {
    findActive(currencyId?: string): Promise<Account[]>;
    findByType(type: AccountType): Promise<Account[]>;
    findByCurrency(currencyId: string): Promise<Account[]>;
    getTotalBalance(currencyId: string): Promise<number>;
    getBalanceByCurrency(): Promise<Map<string, number>>;
    getBalanceByType(currencyId: string): Promise<Map<AccountType, number>>;
}

