import { Money } from '../value-objects/money';
import { BaseEntity } from './base-entity';
import {
    BusinessRuleViolationException,
    NegativeAmountException,
    RequiredFieldException,
    TransferRequiresDestinationException, TransferSameAccountException
} from '../exceptions/domain.exception';
import { uuid } from "@/shared/utils/id/uuid";
import { assertValidDate } from '../validation';

export type TransactionType = 'income' | 'expense' | 'transfer';

export const TRANSACTION_TYPE_VALUES: readonly TransactionType[] = [
    'income', 'expense', 'transfer',
] as const

export interface CreateTransactionProps {
    title: string;
    amount: number;
    currencyId: string;
    /** Currency metadata'sından use-case tarafından doldurulur. */
    minorUnit?: number;
    toAccountId?: string;
    /**
     * Transfer'in hedef bacağı — farklı para birimindeki hesaba yapılan
     * transferde hedef hesabın para biriminde ne kadar yatacağı. Verilmezse
     * (aynı-para transfer) `amount`/`currencyId` kullanılır. Silme/güncelleme
     * geri almalarının doğru olması için hedef tutar kalıcı saklanır.
     */
    toAmount?: number;
    toCurrencyId?: string;
    toMinorUnit?: number;
    description?: string;
    /** Transfer dışındaki türlerde zorunlu; transfer'de kategori kavramı yok. */
    categoryId?: string;
    date: Date;
    type: TransactionType;
    accountId?: string;
    notes?: string;
}

export interface TransactionProps {
    id: string;
    title: string;
    amount: Money;
    /** Transfer'in hedef bacağı; transfer olmayan işlemlerde `undefined`. */
    toAmount?: Money;
    description?: string;
    categoryId?: string;
    toAccountId?: string;
    currencyId: string;
    date: Date;
    type: TransactionType;
    accountId?: string;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

export class Transaction extends BaseEntity {
    private _accountId?: string;
    private _toAccountId?: string;
    private _categoryId?: string;
    private _currencyId: string
    private _title: string;
    private _amount: Money;
    private _toAmount?: Money;
    private _description?: string;
    private _date: Date;
    private _type: TransactionType;
    private _notes?: string;

    private constructor(props: TransactionProps) {
        super(props.id, props.createdAt, props.updatedAt);
        this._title = props.title;
        this._amount = props.amount;
        this._toAmount = props.toAmount;
        this._description = props.description;
        this._categoryId = props.categoryId;
        this._currencyId = props.currencyId;
        this._date = props.date;
        this._type = props.type;
        this._accountId = props.accountId;
        this._toAccountId = props.toAccountId
        this._notes = props.notes;
    }

    // ========== Factory Methods ==========

    static create(props: CreateTransactionProps): Transaction {
        const id = uuid()
        const now = new Date();

        // Ham `Error` yerine domain exception: normalizeError yalnızca
        // DomainException'ın `code`'unu taşıyor, ham Error'lar UNKNOWN'a düşüp
        // kullanıcıya generic mesaj gösteriyordu.
        if (!props.title || props.title.trim().length === 0) {
            throw new RequiredFieldException('transaction title');
        }

        if (props.amount <= 0) {
            throw new NegativeAmountException('Transaction');
        }

        assertValidDate(props.date, 'transactionDate');

        // `transactions.account_id` şemada NOT NULL. Guard olmadan hesapsız bir
        // işlem domain'den geçip veritabanında ham constraint hatasına düşüyor,
        // kullanıcıya generic mesaj gösteriliyordu. Güncelleme yolu bu alanı
        // zaten zorunlu tutuyor.
        if (!props.accountId || props.accountId.trim().length === 0) {
            throw new RequiredFieldException('transaction account');
        }

        if (props.type === 'transfer') {
            // Hedefin yokluğu kontrol edilir — kaynağın değil.
            if (!props.toAccountId) {
                throw new TransferRequiresDestinationException()
            }

            if (props.accountId === props.toAccountId) {
                throw new TransferSameAccountException(props.toAccountId)
            }

            if (props.toAmount !== undefined && props.toAmount <= 0) {
                throw new NegativeAmountException('Transfer destination amount')
            }
        } else if (!props.categoryId || props.categoryId.trim().length === 0) {
            // Gelir/gider kategorisiz olamaz; transfer'de ise kategori kavramı
            // yok (form da alanı gizliyor) — boş string yerine `undefined`
            // saklanır ki `category_id` FK'sı ihlal edilmesin.
            throw new RequiredFieldException('transaction category');
        }

        // Hedef bacak yalnızca transfer'de vardır. Aynı-para transferde
        // `toAmount`/`toCurrencyId` verilmese de kaynak tutar/para birimi ile
        // doldurulur; böylece "transfer ⟺ toAmount tanımlı" değişmezi korunur ve
        // silme/güncelleme geri almaları tek koddan hedef bacağı okuyabilir.
        const toAmount = props.type === 'transfer'
            ? Money.create(
                props.toAmount ?? props.amount,
                props.toCurrencyId ?? props.currencyId,
                props.toMinorUnit ?? props.minorUnit
            )
            : undefined;

        return new Transaction({
            id,
            title: props.title.trim(),
            amount: Money.create(props.amount, props.currencyId, props.minorUnit),
            toAmount,
            description: props.description?.trim(),
            categoryId: props.type === 'transfer' ? undefined : props.categoryId,
            currencyId: props.currencyId,
            accountId: props.accountId,
            date: props.date,
            toAccountId: props.toAccountId,
            type: props.type,
            notes: props.notes?.trim() || undefined,
            createdAt: now,
            updatedAt: now
        })
    }

    static reconstitute(props: TransactionProps): Transaction {
        return new Transaction(props);
    }

    // ========== Domain Behaviors ==========

    updateDetails(updates: {
        title?: string;
        amount?: number;
        toAmount?: number;
        description?: string;
        categoryId?: string;
        categoryName?: string;
        date?: Date;
        notes?: string;
        accountId?: string;
        toAccountId?: string;
    }): void {
        if (updates.title !== undefined) {
            if (!updates.title.trim()) {
                throw new RequiredFieldException('transaction title')
            }

            this._title = updates.title.trim();
        }

        if (updates.amount !== undefined) {
            if (updates.amount <= 0) {
                throw new NegativeAmountException('Transaction amount must be positive')
            }
            this._amount = Money.create(
                updates.amount,
                this._amount.currencyId,
                this._amount.minorUnit
            );

            // Aynı-para transferde hedef bacak kaynakla birlikte hareket eder;
            // çağıranın ayrıca `toAmount` göndermesine gerek kalmaz. Kur
            // dönüşümlü transferde (farklı para) senkron yapılmaz — hedef tutar
            // ayrı gelmeli.
            if (this._toAmount && this._toAmount.hasSameCurrency(this._amount)) {
                this._toAmount = Money.create(
                    updates.amount,
                    this._toAmount.currencyId,
                    this._toAmount.minorUnit
                );
            }
        }

        if (updates.toAmount !== undefined) {
            if (this._type !== 'transfer' || !this._toAmount) {
                throw new BusinessRuleViolationException(
                    'Only transfers have a destination amount',
                    { transactionId: this.id }
                );
            }
            if (updates.toAmount <= 0) {
                throw new NegativeAmountException('Transfer destination amount must be positive')
            }
            this._toAmount = Money.create(
                updates.toAmount,
                this._toAmount.currencyId,
                this._toAmount.minorUnit
            );
        }

        if (updates.description !== undefined) {
            this._description = updates.description.trim() || undefined;
        }

        if (updates.categoryId !== undefined) {
            // Transfer'in kategorisi yoktur; güncelleme yoluyla da atanamaz.
            if (this._type === 'transfer') {
                throw new BusinessRuleViolationException(
                    'Transfer transactions cannot have a category',
                    { transactionId: this.id }
                );
            }

            if (!updates.categoryId.trim()) {
                throw new RequiredFieldException('transaction category');
            }

            this._categoryId = updates.categoryId;
        }

        if (updates.date !== undefined) {
            assertValidDate(updates.date, 'transactionDate');
            this._date = updates.date;
        }

        if (updates.notes !== undefined) {
            this._notes = updates.notes.trim() || undefined;
        }

        const nextAccountId = updates.accountId !== undefined
            ? updates.accountId.trim()
            : this._accountId

        if (updates.accountId !== undefined && !nextAccountId) {
            throw new RequiredFieldException('transaction account')
        }

        if (updates.toAccountId !== undefined) {
            if (this._type !== 'transfer') {
                throw new BusinessRuleViolationException('Only transfers have a toAccountId', { transactionId: this.id })
            }

            if (!updates.toAccountId.trim()) {
                throw new TransferRequiresDestinationException()
            }
        }

        const nextToAccountId = updates.toAccountId !== undefined
            ? updates.toAccountId.trim()
            : this._toAccountId

        if (this._type === 'transfer' && nextAccountId === nextToAccountId) {
            throw new TransferSameAccountException(nextAccountId ?? '')
        }

        this._accountId = nextAccountId
        this._toAccountId = nextToAccountId

        this.touch();
    }

    changeTransferDestination(
        toAccountId: string,
        toAmount: Money
    ): void {
        if (!this.isTransfer()) {
            throw new BusinessRuleViolationException(
                'Only transfers have a destination account',
                { transactionId: this.id }
            );
        }

        if (!toAccountId || !toAccountId.trim()) {
            throw new TransferRequiresDestinationException();
        }

        if (toAccountId === this._accountId) {
            throw new TransferSameAccountException(toAccountId);
        }

        if (toAmount.amount <= 0) {
            throw new NegativeAmountException(
                'Transfer destination amount must be positive'
            );
        }

        this._toAccountId = toAccountId;
        this._toAmount = toAmount;
        this.touch();
    }

    // ========== Getters ==========

    get title(): string { return this._title; }

    get amount(): Money { return this._amount; }

    /** Transfer'in hedef bacağı (hedef hesabın para biriminde); değilse `undefined`. */
    get toAmount(): Money | undefined { return this._toAmount; }

    /** Transfer hedef para birimi kaynaktan farklı mı? */
    isCrossCurrency(): boolean {
        return this._toAmount !== undefined && !this._toAmount.hasSameCurrency(this._amount);
    }

    get description(): string | undefined { return this._description; }

    get categoryId(): string | undefined { return this._categoryId; }

    get date(): Date { return this._date; }

    get type(): TransactionType { return this._type; }

    get accountId(): string | undefined { return this._accountId; }

    get currencyId(): string { return this._amount.currencyId; }

    get toAccountId(): string | undefined { return this._toAccountId }

    get notes(): string | undefined { return this._notes; }

    // ========== Query Methods ==========

    isIncome(): boolean {
        return this._type === 'income';
    }

    isExpense(): boolean {
        return this._type === 'expense';
    }

    isTransfer(): boolean {
        return this._type === 'transfer';
    }

    /**
     * İşlemin gerçekleştiği tarihi formatlı string olarak döner
     */
    getDisplayDate(): string {
        return this._date.toLocaleDateString('tr-TR');
    }

    getDisplayTime(): string {
        return this._date.toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    getDisplayDateTime(): string {
        return `${this.getDisplayDate()} ${this.getDisplayTime()}`;
    }

    /**
     * İşlem belirtilen tarih aralığında mı?
     */
    isInDateRange(startDate: Date, endDate: Date): boolean {
        return this._date >= startDate && this._date <= endDate;
    }

    isToday(): boolean {
        const today = new Date();
        return (
            this._date.getDate() === today.getDate() &&
            this._date.getMonth() === today.getMonth() &&
            this._date.getFullYear() === today.getFullYear()
        );
    }

    isThisMonth(): boolean {
        const today = new Date();
        return (
            this._date.getMonth() === today.getMonth() &&
            this._date.getFullYear() === today.getFullYear()
        );
    }

    isThisWeek(): boolean {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        return this._date >= startOfWeek && this._date <= endOfWeek;
    }
}

