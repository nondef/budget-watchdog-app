import { Account } from '../entities/account';
import { Transaction } from '../entities/transaction';
import { Money } from '../value-objects/money';

export interface AccountSummary {
    account: Account;
    transactionCount: number;
    totalIncome: Money;
    totalExpense: Money;
}

/**
 * Account Balance Domain Service
 * Hesap bakiyesi işlemleri için domain logic
 */
export class AccountBalanceService {

    /**
     * Toplam bakiyeyi hesapla (tek para birimi)
     */
    calculateTotalBalance(
        accounts: Account[],
        currencyId: string,
        minorUnit: number = accounts.find(a => a.currencyId === currencyId)?.balance.minorUnit ?? 2
    ): Money {
        return accounts
            .filter(a => a.isActive && a.currencyId === currencyId)
            .reduce(
                (sum, a) => sum.add(a.balance),
                Money.zero(currencyId, minorUnit)
            );
    }

    /**
     * Para birimi bazlı bakiye dağılımı
     */
    getBalanceByCurrency(accounts: Account[]): Map<string, Money> {
        const balances = new Map<string, Money>();

        for (const account of accounts.filter(a => a.isActive)) {
            const existing = balances.get(account.currencyId);
            if (existing) {
                balances.set(account.currencyId, existing.add(account.balance));
            } else {
                balances.set(account.currencyId, account.balance);
            }
        }

        return balances;
    }

    /**
     * Hesap tipi bazlı bakiye dağılımı
     */
    getBalanceByAccountType(accounts: Account[], currencyId: string): Map<string, Money> {
        const balances = new Map<string, Money>();

        for (const account of accounts.filter(a => a.isActive && a.currencyId === currencyId)) {
            const existing = balances.get(account.type);
            if (existing) {
                balances.set(account.type, existing.add(account.balance));
            } else {
                balances.set(account.type, account.balance);
            }
        }

        return balances;
    }

    /**
     * Hesap özeti oluştur
     */
    getAccountSummary(
        account: Account, 
        transactions: Transaction[]
    ): AccountSummary {
        const accountTransactions = transactions.filter(t => t.accountId === account.id);
        
        const incomeTransactions = accountTransactions.filter(t => t.isIncome());
        const expenseTransactions = accountTransactions.filter(t => t.isExpense());

        const totalIncome = incomeTransactions.reduce(
            (sum, t) => sum.add(t.amount),
            Money.zero(account.currencyId, account.balance.minorUnit)
        );

        const totalExpense = expenseTransactions.reduce(
            (sum, t) => sum.add(t.amount),
            Money.zero(account.currencyId, account.balance.minorUnit)
        );

        return {
            account,
            transactionCount: accountTransactions.length,
            totalIncome,
            totalExpense
        };
    }

    /**
     * Negatif bakiyeli hesapları bul
     */
    findNegativeBalanceAccounts(accounts: Account[]): Account[] {
        return accounts.filter(a => a.isActive && a.hasNegativeBalance());
    }

    /**
     * Boş bakiyeli hesapları bul
     */
    findZeroBalanceAccounts(accounts: Account[]): Account[] {
        return accounts.filter(a => a.isActive && a.isZeroBalance());
    }
}

