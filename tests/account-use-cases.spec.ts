import { describe, expect, it } from 'vitest';
import {
    Account,
    AccountBalanceService,
    AccountType,
    Currency,
    DomainErrorCode,
    MAX_ACCOUNT_COUNT,
    Money,
} from '@/domain';
import { CreateAccountUseCase } from '@/application/use-cases/account/create-account.use-case';
import { UpdateAccountUseCase } from '@/application/use-cases/account/update-account.use-case';
import { GetAccountUseCase } from '@/application/use-cases/account/get-account.use-case';
import { ListAccountsUseCase } from '@/application/use-cases/account/list-accounts.use-case';
import { GetAccountSummaryUseCase } from '@/application/use-cases/account/get-account-summary.use-case';

const immediateUow = {
    async run<T>(work: () => Promise<T>): Promise<T> {
        return work();
    },
};

function currency(id = 'try-id', code = 'TRY', minorUnit = 2): Currency {
    return Currency.create({
        id,
        code,
        name: code,
        symbol: code,
        country: 'Test',
        minorUnit,
    });
}

function account(id = 'account-1', currencyId = 'try-id'): Account {
    return Account.reconstitute({
        id,
        name: 'Kasa',
        type: 'cash',
        balance: (currencyId === 'kwd-id')
            ? Account.create({
                name: 'KWD',
                type: 'cash',
                currencyId,
                minorUnit: 3,
                balance: 1.005,
                icon: { name: 'wallet-outline', color: 'blue' },
            }).balance
            : Account.create({
                name: 'TRY',
                type: 'cash',
                currencyId,
                balance: 100,
                icon: { name: 'wallet-outline', color: 'blue' },
            }).balance,
        icon: Account.create({
            name: 'Icon',
            type: 'cash',
            currencyId,
            balance: 0,
            icon: { name: 'wallet-outline', color: 'blue' },
        }).icon,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
}

describe('Account bakiye kuralları', () => {
    function withBalance(balance: number, type: AccountType = 'bank') {
        return Account.create({
            name: 'Test',
            type,
            currencyId: 'try-id',
            balance,
            icon: { name: 'wallet-outline', color: 'blue' },
        });
    }

    const lira = (amount: number) => Money.create(amount, 'try-id', 2);

    it('kredi hesabı bakiyesinin üstünde harcamaya izin verir', () => {
        const card = withBalance(0, 'credit');

        card.withdraw(lira(250));

        // Kredi kartında borç bakiyesi beklenen sonuç; guard tipe bakmadığı
        // için bu hesap tipi pratikte kullanılamıyordu.
        expect(card.balance.amount).toBe(-250);
    });

    it('kredi dışı hesapta yetersiz bakiye guard’ı korunur', () => {
        const cash = withBalance(100);

        expect(() => cash.withdraw(lira(250)))
            .toThrowError(expect.objectContaining({
                code: DomainErrorCode.INSUFFICIENT_BALANCE,
            }));
        expect(cash.balance.amount).toBe(100);
    });

    it('reverseDeposit guard’sızdır: harcanmış gelir geri alınabilir', () => {
        // 1000 gelir geldi, 900'ü harcandı; geriye 100 kaldı.
        const wallet = withBalance(100);

        wallet.reverseDeposit(lira(1000));

        // Düzeltilmiş geçmiş "olmayan parayı harcamışsın" diyor; doğru olan
        // bunu göstermek, kaydı silinemez kılmak değil.
        expect(wallet.balance.amount).toBe(-900);
    });

    it('kredi hesabı mevcut borcuyla açılabilir', () => {
        const card = withBalance(-5000, 'credit');

        // Kredi kartını devreden borcuyla kaydetmenin başka yolu yoktu.
        expect(card.balance.amount).toBe(-5000);
    });

    it('kredi dışı hesap negatif başlangıç bakiyesiyle açılamaz', () => {
        expect(() => withBalance(-100, 'bank'))
            .toThrowError(expect.objectContaining({
                code: DomainErrorCode.NEGATIVE_AMOUNT,
            }));
    });

    it('borçlu kredi hesabının türü değiştirilemez', () => {
        const card = withBalance(-5000, 'credit');

        // Aksi halde 'bank' tipinde eksi bakiyeli bir hesap kalır ve
        // `withdraw`'un guard'ı hesabın mevcut haliyle çelişirdi.
        expect(() => card.changeType('bank'))
            .toThrowError(expect.objectContaining({
                code: DomainErrorCode.OPERATION_NOT_ALLOWED,
            }));
        expect(card.type).toBe('credit');
    });

    it('borcu kapanmış kredi hesabının türü değiştirilebilir', () => {
        const card = withBalance(0, 'credit');

        card.changeType('bank');

        expect(card.type).toBe('bank');
    });

    it('reverseDeposit para birimi ve pozitiflik kontrollerini korur', () => {
        const wallet = withBalance(100);

        expect(() => wallet.reverseDeposit(Money.create(50, 'usd-id', 2))).toThrowError();
        expect(() => wallet.reverseDeposit(lira(0))).toThrowError();
        expect(wallet.balance.amount).toBe(100);
    });
});

describe('Account use-cases', () => {
    it('CreateAccount currency minor-unit bilgisini oluşturulan bakiyeye taşır', async () => {
        let saved: Account | undefined;
        const useCase = new CreateAccountUseCase(
            {
                async findAll() { return []; },
                async save(value: Account) { saved = value; },
            } as any,
            { async findById() { return currency('kwd-id', 'KWD', 3); } } as any,
            immediateUow
        );

        const result = await useCase.execute({
            name: 'KWD hesabı',
            type: 'cash',
            currencyId: 'kwd-id',
            balance: 1.005,
            icon: { name: 'wallet-outline', color: 'blue' },
        });

        expect(saved?.balance.minorUnit).toBe(3);
        expect(result.balance.amount).toBe(1.005);
    });

    it('CreateAccount limite yalnız aktif hesapları sayar', async () => {
        // Arşivlenmiş (pasif) hesaplar slot tüketmemeli; aksi halde geçmişi
        // olduğu için silinemeyen hesaplar kullanıcının slot'larını kalıcı
        // tüketirdi.
        const archived = Array.from({ length: MAX_ACCOUNT_COUNT }, () => ({ isActive: false }));
        let saved = false;
        const useCase = new CreateAccountUseCase(
            { async findAll() { return archived; }, async save() { saved = true; } } as any,
            { async findById() { return currency(); } } as any,
            immediateUow
        );

        await useCase.execute({
            name: 'Yeni',
            type: 'cash',
            currencyId: 'try-id',
            balance: 0,
            icon: { name: 'wallet-outline', color: 'blue' },
        });
        expect(saved).toBe(true);
    });

    it('CreateAccount aktif hesap limiti dolunca hata verir', async () => {
        const active = Array.from({ length: MAX_ACCOUNT_COUNT }, () => ({ isActive: true }));
        const useCase = new CreateAccountUseCase(
            { async findAll() { return active; }, async save() {} } as any,
            { async findById() { return currency(); } } as any,
            immediateUow
        );

        await expect(useCase.execute({
            name: 'X',
            type: 'cash',
            currencyId: 'try-id',
            balance: 0,
            icon: { name: 'wallet-outline', color: 'blue' },
        })).rejects.toThrowError(expect.objectContaining({
            code: DomainErrorCode.ACCOUNT_LIMIT_EXCEEDED,
        }));
    });

    it('UpdateAccount değişiklikleri kaydeder', async () => {
        const entity = account();
        let saved = false;
        const useCase = new UpdateAccountUseCase(
            {
                async findById() { return entity; },
                async save() { saved = true; },
            } as any,
            { async findByAccount() { return []; } } as any,
            { async findByAccount() { return []; } } as any,
            immediateUow
        );

        const result = await useCase.execute({ id: entity.id, name: 'Yeni Kasa' });

        expect(result.name).toBe('Yeni Kasa');
        expect(saved).toBe(true);
    });

    it('UpdateAccount bakiyesi olan hesabı pasifleştiremez', async () => {
        // Pasif hesap toplam bakiyeye girmez; bakiyeli hesabı pasifleştirmek o
        // parayı net toplamdan sessizce düşürürdü.
        const entity = account(); // 100 bakiye, aktif
        const useCase = new UpdateAccountUseCase(
            { async findById() { return entity; }, async save() {} } as any,
            { async findByAccount() { return []; } } as any,
            { async findByAccount() { return []; } } as any,
            immediateUow
        );

        await expect(useCase.execute({ id: entity.id, isActive: false }))
            .rejects.toThrowError(expect.objectContaining({
                code: DomainErrorCode.BUSINESS_RULE_VIOLATION,
            }));
        expect(entity.isActive).toBe(true);
    });

    it('UpdateAccount bakiyesi sıfır hesabı pasifleştirebilir', async () => {
        const entity = Account.create({
            name: 'Bos',
            type: 'cash',
            currencyId: 'try-id',
            balance: 0,
            icon: { name: 'wallet-outline', color: 'blue' },
        });
        let saved = false;
        const useCase = new UpdateAccountUseCase(
            { async findById() { return entity; }, async save() { saved = true; } } as any,
            { async findByAccount() { return []; } } as any,
            { async findByAccount() { return []; } } as any,
            immediateUow
        );

        const result = await useCase.execute({ id: entity.id, isActive: false });
        expect(result.isActive).toBe(false);
        expect(saved).toBe(true);
    });

    it('GetAccount entity bulunmadığında null döner', async () => {
        const useCase = new GetAccountUseCase({ async findById() { return null; } } as any);
        expect(await useCase.execute({ id: 'missing' })).toBeNull();
    });

    it('ListAccounts pasifler istendiğinde currency filtresini korur', async () => {
        const tryAccount = account('try', 'try-id');
        const kwdAccount = account('kwd', 'kwd-id');
        const useCase = new ListAccountsUseCase({
            async findAll() { return [tryAccount, kwdAccount]; },
        } as any);

        const result = await useCase.execute({ activeOnly: false, currencyId: 'kwd-id' });
        expect(result.map(item => item.id)).toEqual(['kwd']);
    });

    it('GetAccountSummary currency varlığını doğrular ve doğru ölçekli sıfır döner', async () => {
        const useCase = new GetAccountSummaryUseCase(
            { async findActive() { return []; } } as any,
            { async findById() { return currency('jpy-id', 'JPY', 0); } } as any,
            new AccountBalanceService()
        );

        const result = await useCase.execute('jpy-id');
        expect(result.totalBalance).toEqual({
            amount: 0,
            currencyId: 'jpy-id',
            minorUnit: 0,
        });
    });
});
