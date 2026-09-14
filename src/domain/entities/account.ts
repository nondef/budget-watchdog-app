import { Money } from '@/domain/value-objects/money';
import { Icon, IIcon } from '@/domain/value-objects/icon';
import { BaseEntity } from '@/domain/entities/base-entity';
import {
    CurrencyMismatchException,
    InsufficientBalanceException,
    InvalidValueException,
    NegativeAmountException,
    OperationNotAllowedException,
    RequiredFieldException
} from '@/domain/exceptions/domain.exception';
import { uuid } from "@/shared/utils/id/uuid";

export type AccountType = 'cash' | 'bank' | 'credit' | 'investment' | 'savings';

export const ACCOUNT_TYPES: readonly AccountType[] = [
    'cash', 'bank', 'credit', 'investment', 'savings',
] as const

/** Oluşturulabilecek maksimum hesap sayısı. */
export const MAX_ACCOUNT_COUNT = 50

export interface CreateAccountProps {
    name: string;
    type: AccountType;
    currencyId: string;
    /** Currency metadata'sından use-case tarafından doldurulur. */
    minorUnit?: number;
    balance: number;
    icon: IIcon
    notes?: string;
}

export interface AccountProps {
    id: string;
    name: string;
    type: AccountType;
    balance: Money;
    icon: Icon;
    isActive: boolean;
    createdAt: Date;
    notes?: string;
    updatedAt: Date;
}

export class Account extends BaseEntity {
    private _name: string;
    private _type: AccountType;
    private _balance: Money;
    private _icon: Icon;
    private _notes?: string;
    private _isActive: boolean;

    private constructor(props: AccountProps) {
        super(props.id, props.createdAt, props.updatedAt);
        this._name = props.name;
        this._type = props.type;
        this._balance = props.balance;
        this._icon = props.icon;
        this._notes = props.notes;
        this._isActive = props.isActive;
    }

    static create(props: CreateAccountProps): Account {
        const id = uuid()
        const now = new Date();

        if (!props.name || props.name.trim().length === 0) {
            throw new RequiredFieldException('name')
        }

        if (!ACCOUNT_TYPES.includes(props.type)) {
            throw new InvalidValueException('type', props.type)
        }

        if (!props.currencyId || props.currencyId.trim().length === 0) {
            throw new RequiredFieldException('currencyId')
        }

        if (!Number.isFinite(props.balance)) {
            throw new InvalidValueException('balance', String(props.balance))
        }

        // Kredi hesabı mevcut borcuyla açılabilir; diğer tipler eksiye düşemez.
        // Kural `allowsNegativeBalance` ile aynı yerden okunur ki açılış ve
        // sonraki harcamalar aynı şeyi söylesin.
        if (props.balance < 0 && !Account.typeAllowsNegativeBalance(props.type)) {
            throw new NegativeAmountException('Initial balance')
        }

        return new Account({
            id,
            name: props.name.trim(),
            type: props.type,
            balance: Money.create(props.balance ?? 0, props.currencyId, props.minorUnit),
            icon: Icon.create(props.icon.name, props.icon.color),
            notes: props.notes,
            isActive: true,
            createdAt: now,
            updatedAt: now
        })
    }

    static reconstitute(props: AccountProps): Account {
        return new Account(props);
    }

    /** Kredi hesapları borç bakiyesi taşır; diğer tipler eksiye düşemez. */
    static typeAllowsNegativeBalance(type: AccountType): boolean {
        return type === 'credit';
    }

    allowsNegativeBalance(): boolean {
        return Account.typeAllowsNegativeBalance(this._type);
    }

    private assertUsableAmount(amount: Money, operation: string): void {
        if (!amount.hasSameCurrency(this._balance)) {
            throw new CurrencyMismatchException(this._balance.currencyId, amount.currencyId);
        }

        if (amount.amount <= 0) {
            throw new NegativeAmountException(operation);
        }
    }

    deposit(amount: Money): void {
        this.assertUsableAmount(amount, 'Deposit');

        this._balance = this._balance.add(amount);
        this.touch()
    }

    /**
     * Yeni bir para çıkışı uygular.
     *
     * Bakiye guard'ı kredi hesaplarında işlemez: kredi kartına bakiyesinden
     * büyük harcama girmek normaldir, borç bakiyesi beklenen sonuçtur.
     *
     * Kayıtlı bir girişi geri almak için bu değil `reverseDeposit` kullanılmalı.
     */
    withdraw(amount: Money): void {
        this.assertUsableAmount(amount, 'Withdrawal');

        if (!this.allowsNegativeBalance() && this._balance.isLessThan(amount)) {
            throw new InsufficientBalanceException(this.id, amount.amount, this._balance.amount);
        }

        this._balance = this._balance.subtract(amount);
        this.touch()
    }

    /**
     * Kayıtlı bir para girişini bakiyeden geri alır (işlem silme/güncelleme).
     *
     * `withdraw`'un aksine yetersiz bakiye guard'ı yoktur: bu bir düzeltme
     * işlemidir, yeni bir para çıkışı değil — `Budget.removeSpending` ile aynı
     * gerekçe. Guard buraya da uygulandığında kullanıcı harcadığı bir geliri
     * silemiyor, önce ona dayanan bütün giderleri silmeden düzeltemediği bir
     * kayda kilitleniyordu. Sonuç eksiye düşebilir: düzeltilmiş geçmiş "olmayan
     * parayı harcamışsın" diyorsa doğru olan bunu göstermektir.
     */
    reverseDeposit(amount: Money): void {
        this.assertUsableAmount(amount, 'Reversal');

        this._balance = this._balance.subtract(amount);
        this.touch()
    }

    setBalance(newBalance: Money): void {
        if (!newBalance.hasSameCurrency(this._balance)) {
            throw new CurrencyMismatchException(this._balance.currencyId, newBalance.currencyId);
        }

        this._balance = newBalance;
        this.touch();
    }

    rename(newName: string): void {
        if (!newName || newName.trim().length === 0) {
            throw new RequiredFieldException('account name');
        }

        this._name = newName.trim();
        this.touch();
    }

    changeIcon(icon: Icon): void {
        this._icon = icon;
        this.touch();
    }

    /**
     * Hesap tipini değiştirir.
     *
     * Borç bakiyesi yalnızca kredi hesabında geçerli olduğu için, eksideki bir
     * hesabı bunu taşıyamayan bir tipe çevirmek engellenir; aksi halde
     * `withdraw`'un guard'ı ile hesabın mevcut hali çelişirdi.
     */
    changeType(type: AccountType): void {
        if (this._balance.isNegative() && !Account.typeAllowsNegativeBalance(type)) {
            throw new OperationNotAllowedException(
                'changeType',
                'an account carrying debt cannot change to a type that disallows a negative balance'
            );
        }

        this._type = type;
        this.touch();
    }

    deactivate(): void {
        if (!this._isActive) return;
        this._isActive = false;
        this.touch()
    }

    activate(): void {
        if (this._isActive) return;
        this._isActive = true;
        this.touch()
    }

    updateNotes(notes: string | undefined): void {
        this._notes = notes?.trim();
        this.touch();
    }

    get name(): string { 
        return this._name; 
    }
    
    get type(): AccountType { 
        return this._type; 
    }
    
    get balance(): Money { 
        return this._balance; 
    }
    
    get icon(): Icon { 
        return this._icon; 
    }
    
    get notes(): string | undefined { 
        return this._notes; 
    }
    
    get isActive(): boolean { 
        return this._isActive; 
    }
    
    get currencyId(): string { 
        return this._balance.currencyId; 
    }

    hasPositiveBalance(): boolean {
        return this._balance.isPositive();
    }

    hasNegativeBalance(): boolean {
        return this._balance.isNegative();
    }

    isZeroBalance(): boolean {
        return this._balance.isZero();
    }
}
