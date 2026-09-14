import { BaseRepository } from './base-repository';
import { Account, AccountType } from '@/domain/entities/account';
import { MoneyCast, IconCast, BooleanCast } from './casts';
import { DatabaseAdapter } from '@/domain/interfaces/database-adapter';
import { IAccountRepository } from '@/domain/interfaces/account-repository.interface';

export class AccountRepository extends BaseRepository<Account> implements IAccountRepository {
    protected readonly table = 'accounts';
    protected readonly entityClass = Account;
    protected readonly currencyScopedColumns = ['balance'] as const;
    protected readonly casts = {
        balance:  MoneyCast('balance', 'currency_id', 'TRY', 'minor_unit'),
        icon:     IconCast('icon', 'color'),
        isActive: BooleanCast('is_active', true),
    };

    constructor(db: DatabaseAdapter) {
        super(db);
    }

    async findActive(currencyId?: string): Promise<Account[]> {
        return this.find(
            { isActive: true, currencyId },
            { direction: 'DESC', orderBy: 'createdAt' }
        )
    }

    async findByType(type: AccountType): Promise<Account[]> {
        return this.find(
            { isActive: true, type },
            { direction: 'DESC', orderBy: 'balance' }
        )
    }

    async findByCurrency(currencyId: string): Promise<Account[]> {
        return this.find(
            { isActive: true, currencyId },
            { direction: 'DESC', orderBy: 'balance' }
        )
    }

    /**
     * `currencyId` zorunlu: filtresiz toplam farklı para birimlerini toplayıp
     * anlamsız bir sayı üretirdi. Para birimi bağımsız toplam için
     * `getBalanceByCurrency()` + kur çevrimi kullan.
     */
    async getTotalBalance(currencyId: string): Promise<number> {
        return this.sum('balance', { isActive: true, currencyId })
    }

    async getBalanceByCurrency(): Promise<Map<string, number>> {
        return this.sumGroupBy('balance', 'currency_id', {
            isActive: true
        })
    }

    async getBalanceByType(currencyId: string): Promise<Map<AccountType, number>> {
        return this.sumGroupBy<AccountType>('balance', 'type', {
            isActive: true,
            currencyId
        })
    }
}

