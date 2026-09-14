import {
    savingGoalCanWithdraw,
    savingGoalDaysRemaining,
    savingGoalOverdue,
    savingGoalProgress,
    savingGoalReached,
    savingGoalRemaining,
} from '../services/saving-goal-metrics';
import { Money } from '../value-objects/money';
import { Percentage } from '../value-objects/percentage';
import { Icon } from '../value-objects/icon';
import { uuid } from "@/shared/utils/id/uuid";
import { BaseEntity } from './base-entity';
import {
    CurrencyMismatchException,
    InsufficientBalanceException,
    NegativeAmountException,
    OperationNotAllowedException,
    RequiredFieldException,
    SavingGoalCompletedException,
    SavingGoalInactiveException,
    ValidationException,
} from '../exceptions/domain.exception';
import { assertValidDate } from '../validation';

export type SavingGoalStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export interface CreateSavingGoalProps {
    name: string;
    targetAmount: number;
    currencyId: string;
    /** Currency metadata'sından use-case tarafından doldurulur. */
    minorUnit?: number;
    targetDate?: Date;
    icon: string;
    iconColor: string;
    description?: string;
    initialAmount?: number;
    /**
     * Hedefin fon hesabı. Para ekleme/çekme bu hesaptan yürür. Eski (bu
     * özellikten önceki) hedeflerde yoktur; use-case o durumda parayı sanal tutar.
     */
    accountId?: string;
}

export interface SavingGoalProps {
    id: string;
    name: string;
    targetAmount: Money;
    savedAmount: Money;
    targetDate?: Date;
    status: SavingGoalStatus;
    icon: Icon;
    description?: string;
    accountId?: string;
    createdAt: Date;
    updatedAt: Date;
}

export class SavingGoal extends BaseEntity {
    private _name: string;
    private _targetAmount: Money;
    private _savedAmount: Money;
    private _targetDate?: Date;
    private _status: SavingGoalStatus;
    private _icon: Icon;
    private _description?: string;
    private _accountId?: string;

    private constructor(props: SavingGoalProps) {
        super(props.id, props.createdAt, props.updatedAt);
        this._name = props.name;
        this._targetAmount = props.targetAmount;
        this._savedAmount = props.savedAmount;
        this._targetDate = props.targetDate;
        this._status = props.status;
        this._icon = props.icon;
        this._description = props.description;
        this._accountId = props.accountId;
    }

    // ========== Factory Methods ==========

    static create(props: CreateSavingGoalProps): SavingGoal {
        const id = uuid()
        const now = new Date();

        if (!props.name || props.name.trim().length === 0) {
            throw new RequiredFieldException('Saving goal name');
        }

        if (props.targetAmount <= 0) {
            throw new NegativeAmountException('Target');
        }

        // `Money` negatifi kabul ediyor; doğrulama olmadan eksi bakiyeli bir
        // hedef oluşturulabiliyordu.
        if (props.initialAmount !== undefined && props.initialAmount < 0) {
            throw new NegativeAmountException('Initial saving');
        }
        if (props.targetDate !== undefined) {
            assertValidDate(props.targetDate, 'targetDate');
        }

        const targetAmount = Money.create(props.targetAmount, props.currencyId, props.minorUnit);
        const savedAmount = Money.create(props.initialAmount ?? 0, props.currencyId, props.minorUnit);

        const goal = new SavingGoal({
            id,
            name: props.name.trim(),
            targetAmount,
            savedAmount,
            targetDate: props.targetDate,
            // Başlangıç tutarı hedefi karşılıyorsa hedef zaten tamamlanmıştır:
            // `addSaving` ve `updateDetails` bu geçişi yapıyordu, `create`
            // yapmıyor ve hedef "aktif ama %100" halinde takılı kalıyordu.
            status: savedAmount.isGreaterThanOrEqual(targetAmount) ? 'completed' : 'active',
            icon: Icon.create(props.icon, props.iconColor),
            description: props.description?.trim(),
            accountId: props.accountId,
            createdAt: now,
            updatedAt: now
        });

        return goal;
    }

    static reconstitute(props: SavingGoalProps): SavingGoal {
        return new SavingGoal(props);
    }

    // ========== Domain Behaviors ==========

    addSaving(amount: Money): void {
        if (this._status !== 'active') {
            throw new SavingGoalInactiveException(this.id);
        }

        if (!amount.hasSameCurrency(this._targetAmount)) {
            throw new CurrencyMismatchException(this._targetAmount.currencyId, amount.currencyId);
        }

        if (amount.amount <= 0) {
            throw new NegativeAmountException('Saving');
        }

        this._savedAmount = this._savedAmount.add(amount);
        this.touch();

        // Check if goal is reached
        if (this._savedAmount.isGreaterThanOrEqual(this._targetAmount)) {
            this._status = 'completed';
        }
    }

    withdrawSaving(amount: Money): void {
        // Tamamlanmış hedeften de para çekilebilmeli: hedefe ulaşan kullanıcı,
        // biriktirdiği paraya erişemeden kilitleniyordu. Paused/cancelled hâlâ
        // kapalı — onlar bilinçli olarak durdurulmuş durumlar.
        if (!savingGoalCanWithdraw(this._status)) {
            throw new SavingGoalInactiveException(this.id);
        }

        if (!amount.hasSameCurrency(this._savedAmount)) {
            throw new CurrencyMismatchException(this._savedAmount.currencyId, amount.currencyId);
        }

        if (amount.amount <= 0) {
            throw new NegativeAmountException('Withdrawal');
        }

        if (this._savedAmount.isLessThan(amount)) {
            throw new InsufficientBalanceException(this.id, amount.amount, this._savedAmount.amount);
        }

        this._savedAmount = this._savedAmount.subtract(amount);

        // Hedefin altına düşüldüyse tamamlanmış hedef yeniden aktifleşir; böylece
        // tekrar biriktirme yapılabilir (`updateDetails`'teki simetrik kuralla aynı).
        if (this._status === 'completed' && this._savedAmount.isLessThan(this._targetAmount)) {
            this._status = 'active';
        }

        this.touch();
    }

    updateDetails(updates: {
        name?: string;
        targetAmount?: number;
        targetDate?: Date | null;
        description?: string;
    }): void {
        if (updates.name !== undefined) {
            if (!updates.name.trim()) {
                throw new ValidationException('Goal name cannot be empty', 'name');
            }
            this._name = updates.name.trim();
        }

        if (updates.targetAmount !== undefined) {
            if (updates.targetAmount <= 0) {
                throw new NegativeAmountException('Target');
            }
            this._targetAmount = Money.create(
                updates.targetAmount,
                this._targetAmount.currencyId,
                this._targetAmount.minorUnit
            );
            
            if (
                this._savedAmount.isGreaterThanOrEqual(this._targetAmount) &&
                (this._status === 'active' || this._status === 'paused')
            ) {
                this._status = 'completed';
            } else if (
                this._status === 'completed' &&
                this._savedAmount.isLessThan(this._targetAmount)
            ) {
                // Tamamlanmış hedef yükseltildiyse yeniden biriktirilebilir.
                this._status = 'active';
            }
        }

        if (updates.targetDate !== undefined) {
            if (updates.targetDate !== null) {
                assertValidDate(updates.targetDate, 'targetDate');
            }
            this._targetDate = updates.targetDate ?? undefined;
        }

        if (updates.description !== undefined) {
            this._description = updates.description.trim() || undefined;
        }

        this.touch();
    }

    changeIcon(icon: Icon): void {
        this._icon = icon;
        this.touch();
    }

    pause(): void {
        if (this._status !== 'active') {
            throw new OperationNotAllowedException('pause', 'only active goals can be paused');
        }
        this._status = 'paused';
        this.touch();
    }

    resume(): void {
        if (this._status !== 'paused') {
            throw new OperationNotAllowedException('resume', 'only paused goals can be resumed');
        }
        this._status = 'active';
        this.touch();
    }

    complete(): void {
        if (this._status === 'completed' || this._status === 'cancelled') {
            throw new SavingGoalCompletedException(this.id);
        }
        this._status = 'completed';
        this.touch();
    }

    cancel(): void {
        if (this._status === 'completed' || this._status === 'cancelled') {
            throw new OperationNotAllowedException('cancel', 'goal is already completed or cancelled');
        }
        this._status = 'cancelled';
        this.touch();
    }

    /**
     * Ayrılmış fonu serbest bırakır: `savedAmount`'ı sıfırlar.
     *
     * Yalnızca use-case, parayı fon hesabına geri yatırdıktan sonra çağırmalı
     * (iptal akışı). Silme parayı iade edip kaydı tümden kaldırıyordu; iptalde
     * kayıt kaldığı için para iki yerde (hesap + hedef) görünmesin diye hedef
     * tarafındaki tutar burada düşülür. `Budget.clearSpending` ile aynı gerekçe.
     */
    releaseSavedFunds(): void {
        this._savedAmount = Money.zero(this._savedAmount.currencyId, this._savedAmount.minorUnit);
        this.touch();
    }

    // ========== Getters ==========

    get name(): string { return this._name; }
    get targetAmount(): Money { return this._targetAmount; }
    get savedAmount(): Money { return this._savedAmount; }
    get targetDate(): Date | undefined { return this._targetDate; }
    get status(): SavingGoalStatus { return this._status; }
    get icon(): Icon { return this._icon; }
    get description(): string | undefined { return this._description; }
    get currencyId(): string { return this._targetAmount.currencyId; }
    /** Hedefin fon hesabı; eski (sanal) hedeflerde `undefined`. */
    get accountId(): string | undefined { return this._accountId; }

    // ========== Query Methods ==========

    getProgress(): Percentage {
        return Percentage.create(savingGoalProgress(this._savedAmount.amount, this._targetAmount.amount));
    }

    getRemainingAmount(): Money {
        return savingGoalRemaining(this._targetAmount, this._savedAmount);
    }

    isCompleted(): boolean {
        return this._status === 'completed';
    }

    isActive(): boolean {
        return this._status === 'active';
    }

    isPaused(): boolean {
        return this._status === 'paused';
    }

    isCancelled(): boolean {
        return this._status === 'cancelled';
    }

    /**
     * Hedef tarihe ulaşmak için aylık ne kadar biriktirmek gerekiyor?
     */
    getRequiredMonthlySaving(): Money | null {
        if (!this._targetDate) return null;
        if (this._status !== 'active') return null;

        const now = new Date();
        const monthsRemaining = 
            (this._targetDate.getFullYear() - now.getFullYear()) * 12 +
            (this._targetDate.getMonth() - now.getMonth());

        if (monthsRemaining <= 0) {
            return this.getRemainingAmount();
        }

        const remaining = this.getRemainingAmount();
        return remaining.divide(monthsRemaining);
    }

    /**
     * Hedef tarih geçti mi?
     */
    isOverdue(): boolean {
        return savingGoalOverdue(this._targetDate, this._status);
    }

    /**
     * Hedefe ulaşıldı mı?
     */
    isGoalReached(): boolean {
        return savingGoalReached(this._savedAmount, this._targetAmount);
    }

    /**
     * Kalan gün sayısı
     */
    getDaysRemaining(): number | null {
        return savingGoalDaysRemaining(this._targetDate);
    }
}

