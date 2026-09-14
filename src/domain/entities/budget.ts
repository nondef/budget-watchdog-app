import { Money } from '../value-objects/money';
import { DateRange } from '../value-objects/date-range';
import { Percentage } from '../value-objects/percentage';
import { Icon, IIcon } from '../value-objects/icon';
import { BaseEntity } from './base-entity';
import {
    BudgetInactiveException,
    BudgetPeriodException,
    CurrencyMismatchException,
    NegativeAmountException,
    OperationNotAllowedException,
    RequiredFieldException,
    ValidationException,
} from '../exceptions/domain.exception';
import { uuid } from "@/shared/utils/id/uuid";
import { assertValidDate } from '../validation';

export type BudgetType = 'daily' | 'once' | 'weekly' | 'monthly' | 'yearly';
export type BudgetStatus = 'active' | 'paused' | 'completed' | 'draft';

export const BUDGET_TYPES: readonly BudgetType[] = [
    'daily', 'once', 'weekly', 'monthly', 'yearly',
] as const

export interface DailySpent {
    id?: string;
    date: string;
    amount: number;
}

export interface CreateBudgetProps {
    name: string;
    amount: number;
    accountId: string;
    currencyId: string;
    /** Currency metadata'sından use-case tarafından doldurulur. */
    minorUnit?: number;
    type: BudgetType;
    categoryIds: string[];
    startDate: Date;
    endDate?: Date;
    warningPercentage?: number;
    enableNotifications?: boolean;
    icon: IIcon,
    note?: string;
}

export interface BudgetProps {
    id: string;
    accountId: string;
    name: string;
    amount: Money;
    spentAmount: Money;
    type: BudgetType;
    status: BudgetStatus;
    categoryIds: string[];
    currencyId: string;
    dateRange: DateRange;
    warningPercentage: Percentage;
    enableNotifications: boolean;
    icon: Icon;
    note?: string;
    dailySpent: DailySpent[];
    periodStart: Date;
    /**
     * Manuel reset sonrası bu tarihten eski işlemler mevcut dönemde sayılmaz.
     * Rollover olduğunda temizlenir.
     */
    trackingStartDate?: Date;
    nextResetDate?: Date;
    lastResetDate?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export class Budget extends BaseEntity {
    /** Grafik için saklanan en yeni gün sayısı. */
    private static readonly MAX_DAILY_SPENT_DAYS = 31;

    private _name: string;
    private _amount: Money;
    private _spentAmount: Money;
    private _type: BudgetType;
    private _status: BudgetStatus;
    private _categoryIds: string[];
    private _currencyId: string;
    private _accountId: string;
    private _dateRange: DateRange;
    private _warningPercentage: Percentage;
    private _enableNotifications: boolean;
    private _icon: Icon;
    private _note?: string;
    private _dailySpent: DailySpent[];
    private _periodStart: Date;
    private _trackingStartDate?: Date;
    private _nextResetDate?: Date;
    private _lastResetDate?: Date;

    private constructor(props: BudgetProps) {
        super(props.id, props.createdAt, props.updatedAt);
        this._name = props.name;
        this._amount = props.amount;
        this._spentAmount = props.spentAmount;
        this._type = props.type;
        this._status = props.status;
        this._categoryIds = props.categoryIds;
        this._currencyId = props.currencyId;
        this._accountId = props.accountId;
        this._dateRange = props.dateRange;
        this._warningPercentage = props.warningPercentage;
        this._enableNotifications = props.enableNotifications;
        this._icon = props.icon;
        this._note = props.note;
        this._dailySpent = props.dailySpent;
        this._periodStart = props.periodStart;
        this._trackingStartDate = props.trackingStartDate;
        this._nextResetDate = props.nextResetDate;
        this._lastResetDate = props.lastResetDate;
    }

    /**
     * @param props
     * @param now Referans an. `reset`/`changePeriod` ile aynı gerekçe: sıfırlama
     *   sınırı "şimdi"ye göre hesaplandığı için test edilebilir olmalı.
     */
    static create(props: CreateBudgetProps, now: Date = new Date()): Budget {
        if (!props.name || props.name.trim().length === 0) {
            throw new RequiredFieldException('Budget Name');
        }

        if (props.amount <= 0) {
            throw new NegativeAmountException('Budget Amount must be positive');
        }

        if (!props.categoryIds|| !Array.isArray(props.categoryIds) || props.categoryIds.length === 0) {
            throw new RequiredFieldException('At least one category is required');
        }

        if (!props.currencyId || props.currencyId.trim().length === 0) {
            throw new RequiredFieldException('Currency ID is required');
        }

        assertValidDate(props.startDate, 'startDate');
        if (props.endDate !== undefined) {
            assertValidDate(props.endDate, 'endDate');
        }

        if (props.endDate !== undefined && props.startDate > props.endDate) {
            throw new ValidationException('End date cannot be earlier than start date');
        }

        if (!props.accountId || props.accountId.trim().length === 0) {
            throw new RequiredFieldException('Account ID is required');
        }

        const id = uuid()

        const period = Budget.calculatePeriodBounds(props.type, props.startDate, now);

        return new Budget({
            id,
            accountId: props.accountId,
            name: props.name.trim(),
            amount: Money.create(props.amount, props.currencyId, props.minorUnit),
            spentAmount: Money.zero(props.currencyId, props.minorUnit),
            type: props.type,
            status: 'active',
            categoryIds: [...new Set(props.categoryIds)],
            currencyId: props.currencyId,
            dateRange: DateRange.create(props.startDate, props.endDate),
            warningPercentage: Percentage.create(props.warningPercentage ?? 80),
            enableNotifications: props.enableNotifications ?? true,
            icon: Icon.create(props.icon.name ?? 'wallet-outline', props.icon.color ?? 'bg-blue-500'),
            note: props.note,
            dailySpent: [],
            periodStart: period.start,
            trackingStartDate: undefined,
            nextResetDate: period.end,
            lastResetDate: undefined,
            createdAt: now,
            updatedAt: now
        })
    }

    static reconstitute(props: BudgetProps): Budget {
        return new Budget(props);
    }

    private static addPeriods(type: BudgetType, anchor: Date, count: number): Date | undefined {
        if (type === 'once') return undefined;

        const baseDate = new Date(anchor);
        baseDate.setHours(0, 0, 0, 0);

        switch (type) {
            case 'daily':
                baseDate.setDate(baseDate.getDate() + count);
                break;
            case 'weekly':
                baseDate.setDate(baseDate.getDate() + (7 * count));
                break;
            case 'monthly': {
                const day = baseDate.getDate();
                const targetMonth = baseDate.getMonth() + count;
                baseDate.setDate(1);
                baseDate.setMonth(targetMonth);
                const lastDay = new Date(
                    baseDate.getFullYear(),
                    baseDate.getMonth() + 1,
                    0
                ).getDate();
                baseDate.setDate(Math.min(day, lastDay));
                break;
            }
            case 'yearly': {
                const month = baseDate.getMonth();
                const day = baseDate.getDate();
                baseDate.setDate(1);
                baseDate.setFullYear(baseDate.getFullYear() + count);
                baseDate.setMonth(month);
                const lastDay = new Date(
                    baseDate.getFullYear(),
                    month + 1,
                    0
                ).getDate();
                baseDate.setDate(Math.min(day, lastDay));
                break;
            }
        }

        return baseDate;
    }

    private static calculatePeriodBounds(
        type: BudgetType,
        anchor: Date,
        now: Date
    ): { start: Date; end?: Date } {
        if (type === 'once') {
            return { start: new Date(anchor) };
        }

        let start = new Date(anchor);
        let count = 1;
        let end = Budget.addPeriods(type, anchor, count);

        while (end && end <= now) {
            start = end;
            count++;
            end = Budget.addPeriods(type, anchor, count);
        }

        return { start, end };
    }

    /**
     * @param occurredAt Harcamanın gerçekleştiği tarih (işlemin kendi tarihi).
     *   Günlük harcama kovasını bu belirler. Verilmezse "şimdi" varsayılır —
     *   ama geriye dönük tarihli bir işlemde çağıran mutlaka işlemin tarihini
     *   geçmeli, aksi halde harcama bugünün kovasına düşer.
     */
    addSpending(amount: Money, occurredAt: Date = new Date()): void {
        assertValidDate(occurredAt, 'occurredAt');

        if (this._status !== 'active') {
            throw new BudgetInactiveException(this.id);
        }

        if (!amount.hasSameCurrency(this._amount)) {
            throw new CurrencyMismatchException(this._amount.currencyId, amount.currencyId);
        }

        if (amount.amount <= 0) {
            throw new NegativeAmountException('Spending');
        }

        if (!this.coversSpendingAt(occurredAt)) {
            throw new BudgetPeriodException(
                'Spending date is outside the current budget period',
                { budgetId: this.id, occurredAt: occurredAt.toISOString() }
            );
        }

        this._spentAmount = this._spentAmount.add(amount);
        this.touch();

        this.recordDailySpent(Budget.toDateKey(occurredAt), amount.amount);
    }

    /**
     * Harcamayı geri alır (işlem silme/güncelleme sırasında).
     *
     * `addSpending`'in aksine dönem/aktiflik guard'ları yoktur: bu bir düzeltme
     * işlemidir, yeni harcama değil. Tutarsız veride negatife düşmemek için sıfıra
     * clamp'lenir.
     *
     * @param occurredAt Geri alınan harcamanın tarihi. Verilirse günlük harcama
     *   kovasından da düşülür; verilmezse yalnızca `_spentAmount` düzeltilir ve
     *   günlük dağılım (grafik) o kadar sapar.
     */
    removeSpending(amount: Money, occurredAt?: Date): void {
        if (!amount.hasSameCurrency(this._spentAmount)) {
            throw new CurrencyMismatchException(this._spentAmount.currencyId, amount.currencyId);
        }

        if (amount.amount <= 0) {
            throw new NegativeAmountException('Spending');
        }

        const reduced = this._spentAmount.subtract(amount);

        this._spentAmount = reduced.isNegative()
            ? Money.zero(this._spentAmount.currencyId, this._spentAmount.minorUnit)
            : reduced;

        if (occurredAt) {
            this.recordDailySpent(Budget.toDateKey(occurredAt), -amount.amount);
        }

        this.touch();
    }

    /**
     * Güncel dönem toplamını işlem ledger'ından yeniden kurar.
     *
     * Bütçenin kategori/hesap/dönem kapsamı düzenlendiğinde eski aggregate'i
     * taşımak veya yalnızca sıfırlamak yerine source-of-truth işlemlerden
     * mutabakat yapılır. Paused bütçeler de düzenlenebildiği için bu bakım
     * işlemi `addSpending`'in aktiflik guard'ını bilinçli olarak kullanmaz.
     */
    reconcileSpending(entries: ReadonlyArray<{ amount: Money; occurredAt: Date }>): void {
        this._spentAmount = Money.zero(this._amount.currencyId, this._amount.minorUnit);
        this._dailySpent = [];

        for (const entry of entries) {
            if (!entry.amount.hasSameCurrency(this._amount)) {
                throw new CurrencyMismatchException(this._amount.currencyId, entry.amount.currencyId);
            }
            if (entry.amount.amount <= 0) {
                throw new NegativeAmountException('Spending');
            }
            if (!this.coversSpendingAt(entry.occurredAt)) {
                throw new BudgetPeriodException(
                    'Spending date is outside the current budget period',
                    { budgetId: this.id, occurredAt: entry.occurredAt.toISOString() }
                );
            }

            this._spentAmount = this._spentAmount.add(entry.amount);
            this.recordDailySpent(Budget.toDateKey(entry.occurredAt), entry.amount.amount);
        }

        this.touch();
    }

    /**
     * Günlük kova anahtarı (YYYY-MM-DD), **yerel** takvim gününe göre.
     *
     * `toISOString()` kullanılmaz: UTC+ saat dilimlerinde gece yarısına yakın
     * işlemler bir önceki güne düşerdi. Dönem sıfırlaması da (bkz.
     * `calculateNextResetDate`) yerel gece yarısını esas alıyor — ikisi tutarlı.
     */
    private static toDateKey(date: Date): string {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${date.getFullYear()}-${month}-${day}`;
    }

    /**
     * Günlük harcama kovasını günceller.
     *
     * Kovalar yalnızca **grafik** içindir; dönem toplamının kaynağı
     * `_spentAmount`'tır. Bu yüzden en yeni `MAX_DAILY_SPENT_DAYS` gün tutulur
     * ve eskiler düşer — kovaların toplamı ile `_spentAmount` bilinçli olarak
     * her zaman eşit olmayabilir.
     */
    private recordDailySpent(date: string, amount: number): void {
        const existingDay = this._dailySpent.find(d => d.date === date);

        if (existingDay) {
            // Geri alma negatif tutarla gelir; kova negatife düşmesin.
            existingDay.amount = Math.max(0, existingDay.amount + amount);

            // Sıfırlanan kovayı listede tutmak grafikte boş sütun bırakıyor ve
            // kırpma sınırından yer çalıyordu.
            if (existingDay.amount === 0) {
                this._dailySpent = this._dailySpent.filter(d => d !== existingDay);
            }
        } else if (amount > 0) {
            this._dailySpent.push({ date, amount });
        }

        if (this._dailySpent.length > Budget.MAX_DAILY_SPENT_DAYS) {
            // Tarihe göre azalan sırala, en eskileri at. Geriye dönük tarihli
            // bir işlem eklendiğinde de doğru kayıt düşer.
            this._dailySpent = [...this._dailySpent]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, Budget.MAX_DAILY_SPENT_DAYS);
        }
    }

    /**
     * Bütçeyi yeni döneme alır.
     *
     * Yeni dönem başlangıcı **bir önceki dönem sınırından** ilerletilir, "şimdi"den
     * değil: uygulama üç gün açılmazsa aylık bütçenin dönem başı üç gün kayıyordu.
     * Arada birden fazla dönem geçtiyse sınır bugünü aşana kadar ilerletilir.
     *
     * @param now Sıfırlama anı (test edilebilirlik için).
     */
    reset(now: Date = new Date()): void {
        if (this._type === 'once') {
            throw new OperationNotAllowedException('reset', 'one-time budgets cannot be reset');
        }

        const period = Budget.calculatePeriodBounds(
            this._type,
            this._dateRange.startDate,
            now
        );

        this._spentAmount = Money.zero(this._amount.currencyId, this._amount.minorUnit);
        this._periodStart = period.start;
        this._trackingStartDate = undefined;
        this._lastResetDate = period.start;
        this._dailySpent = [];
        this._nextResetDate = period.end;

        this.touch();
    }

    /**
     * Kullanıcının manuel reset'i. Mevcut dönem değişmez; bu andan eski
     * transaction tarihleri artık bütçeye alınmaz.
     */
    clearSpending(now: Date = new Date()): void {
        assertValidDate(now, 'trackingStartDate');

        this._spentAmount = Money.zero(this._amount.currencyId, this._amount.minorUnit);
        this._dailySpent = [];
        this._trackingStartDate = new Date(now);
        this.touch();
    }

    shouldReset(now: Date = new Date()): boolean {
        if (this._type === 'once') return false;
        if (this._status !== 'active') return false;
        if (!this._nextResetDate) return true;

        return now >= this._nextResetDate;
    }

    pause(): void {
        if (this._status !== 'active') {
            throw new OperationNotAllowedException('pause', 'only active budgets can be paused');
        }
        this._status = 'paused';
        this.touch();
    }

    resume(): void {
        if (this._status !== 'paused') {
            throw new OperationNotAllowedException('resume', 'only paused budgets can be resumed');
        }
        this._status = 'active';
        this.touch();
    }

    complete(): void {
        // `SavingGoal.complete()` ile aynı kural: tamamlanmış bir kaydı yeniden
        // tamamlamak sessizce başarılı olup `updatedAt`'i kirletiyordu.
        if (this._status === 'completed') {
            throw new OperationNotAllowedException('complete', 'budget is already completed');
        }

        this._status = 'completed';
        this.touch();
    }

    updateDetails(updates: {
        name?: string;
        amount?: number;
        warningPercentage?: number;
        enableNotifications?: boolean;
        note?: string;
        categoryIds?: string[];
    }): void {
        if (updates.name !== undefined) {
            if (!updates.name.trim()) {
                throw new ValidationException('Budget name cannot be empty', 'name');
            }
            this._name = updates.name.trim();
        }

        if (updates.amount !== undefined) {
            if (updates.amount <= 0) {
                throw new NegativeAmountException('Budget');
            }
            this._amount = Money.create(
                updates.amount,
                this._amount.currencyId,
                this._amount.minorUnit
            );
        }

        if (updates.warningPercentage !== undefined) {
            this._warningPercentage = Percentage.create(updates.warningPercentage);
        }

        if (updates.enableNotifications !== undefined) {
            this._enableNotifications = updates.enableNotifications;
        }

        if (updates.note !== undefined) {
            this._note = updates.note;
        }

        if (updates.categoryIds !== undefined) {
            if (updates.categoryIds.length === 0) {
                throw new ValidationException('At least one category is required', 'categoryIds');
            }
            this._categoryIds = [...new Set(updates.categoryIds)];
        }

        this.touch();
    }

    changeIcon(icon: Icon): void {
        this._icon = icon;
        this.touch();
    }

    /**
     * Bütçenin bağlı olduğu hesabı değiştirir.
     *
     * Para birimi denetimi use-case'in işi (hesap deposunu o biliyor); burada
     * yalnızca boş değer engellenir.
     */
    changeAccount(accountId: string): void {
        if (!accountId || accountId.trim().length === 0) {
            throw new RequiredFieldException('Account ID is required');
        }

        this._accountId = accountId;
        this.touch();
    }

    /**
     * Dönemi (tür + tarih aralığı) yeniden kurar ve bir sonraki sıfırlama
     * tarihini buna göre hesaplar.
     *
     * Harcanan tutar korunur: dönem düzeltmesi geçmiş harcamayı silmez.
     * Sıfırlama isteniyorsa `reset()` ayrıca çağrılmalı.
     *
     * Sıfırlama sınırı `startDate`'ten tek adım değil, **bugünü aşana kadar**
     * ilerletilir. Düzenleme formu her kaydetmede orijinal `startDate`'i geri
     * gönderdiği için tek adımlık hesap sınırı geçmişe düşürüyor, bütçe bir
     * sonraki açılışta sıfırlanıp o dönemin harcamasını kaybediyordu.
     *
     * @param now Referans an (test edilebilirlik için).
     */
    changePeriod(type: BudgetType, startDate: Date, endDate?: Date, now: Date = new Date()): void {
        assertValidDate(startDate, 'startDate');
        if (endDate !== undefined) {
            assertValidDate(endDate, 'endDate');
        }
        assertValidDate(now, 'now');

        if (endDate !== undefined && startDate > endDate) {
            throw new ValidationException('End date cannot be earlier than start date');
        }

        const periodChanged =
            type !== this._type ||
            startDate.getTime() !== this._dateRange.startDate.getTime() ||
            (endDate?.getTime() ?? null) !== (this._dateRange.endDate?.getTime() ?? null);

        this._type = type;
        this._dateRange = DateRange.create(startDate, endDate);

        const period = Budget.calculatePeriodBounds(type, startDate, now);
        this._periodStart = period.start;
        this._nextResetDate = period.end;

        if (periodChanged) {
            this._spentAmount = Money.zero(this._amount.currencyId, this._amount.minorUnit);
            this._dailySpent = [];
            this._trackingStartDate = undefined;
        }

        this.touch();
    }

    // ========== Getters ==========

    get name(): string { return this._name; }
    get accountId(): string { return this._accountId; }
    get amount(): Money { return this._amount; }
    get spentAmount(): Money { return this._spentAmount; }
    get type(): BudgetType { return this._type; }
    get status(): BudgetStatus { return this._status; }
    get categoryIds(): string[] { return [...this._categoryIds]; }
    get dateRange(): DateRange { return this._dateRange; }
    get warningPercentage(): Percentage { return this._warningPercentage; }
    get enableNotifications(): boolean { return this._enableNotifications; }
    get icon(): Icon { return this._icon; }
    get note(): string | undefined { return this._note; }
    get dailySpent(): DailySpent[] { return [...this._dailySpent]; }
    get periodStart(): Date { return this._periodStart; }
    get trackingStartDate(): Date | undefined {
        return this._trackingStartDate
            ? new Date(this._trackingStartDate)
            : undefined;
    }
    /** Transaction sorgularının kullanacağı gerçek alt sınır. */
    get spendingStartDate(): Date {
        if (
            this._trackingStartDate &&
            this._trackingStartDate > this._periodStart
        ) {
            return new Date(this._trackingStartDate);
        }

        return new Date(this._periodStart);
    }
    get nextResetDate(): Date | undefined { return this._nextResetDate; }
    get lastResetDate(): Date | undefined { return this._lastResetDate; }
    get currencyId(): string { return this._amount.currencyId; }

    getProgress(): Percentage {
        return Percentage.fromRatio(this._spentAmount.amount, this._amount.amount);
    }

    getRemainingAmount(): Money {
        return this._amount.subtract(this._spentAmount);
    }

    /**
     * Limit aşımının TEK tanımı. `isExceeded` ve `wouldExceedWith` bunun
     * üzerinden gider ki eşik değişirse ikisi birden değişsin — "aşılacak mı"
     * sorusunu ayrı bir yerde yeniden yazmak, onay diyaloğu ile kaydın gerçek
     * sonucunun sessizce ayrışması demekti.
     */
    private exceedsLimit(spent: Money): boolean {
        return spent.isGreaterThanOrEqual(this._amount);
    }

    isExceeded(): boolean {
        return this.exceedsLimit(this._spentAmount);
    }

    /**
     * `asOf` anında geçerli sayılacak harcama: dönemi dolmuşsa sıfır, çünkü
     * bir sonraki `reset()` onu sıfırlayacak. Harcamayı işleyen akışlar zaten
     * eşleştirmeden önce devretme yapıyor (bkz. `rolloverDueBudgets`); bunu
     * hesaba katmayan bir okuma, devri henüz yapılmamış bütçede kapanmış
     * dönemin dolu harcamasını görürdü.
     */
    spentAmountAsOf(asOf: Date = new Date()): Money {
        return this.shouldReset(asOf)
            ? Money.zero(this._amount.currencyId, this._amount.minorUnit)
            : this._spentAmount;
    }

    /**
     * Bu harcama eklenirse limit aşılır mı?
     *
     * Saf sorgu — durumu DEĞİŞTİRMEZ. Kaydetmeden önce uyarı göstermek için
     * var (bkz. PreviewTransactionBudgetImpactUseCase): `addSpending` çağırıp
     * sonucu okumak, repository'den gelen entity'yi kirletiyordu.
     *
     * Harcamanın bu bütçeye gerçekten yazılabilir olduğunu (aktiflik, dönem,
     * para birimi) çağıran doğrular; burada yalnızca tutar sorusu yanıtlanır.
     *
     * @param replacing Bu bütçede ZATEN sayılmış olup yerine `amount` geçecek
     *   tutar — işlem düzenlemede kullanılır. Güncelleme akışı eski etkiyi
     *   `removeSpending` ile geri alıp yenisini eklediği için (bkz.
     *   UpdateTransactionUseCase) önizleme de aynı farkı görmeli; verilmezse
     *   tutar iki kez sayılır ve olmayan bir aşım raporlanır.
     */
    wouldExceedWith(amount: Money, asOf: Date = new Date(), replacing?: Money): boolean {
        return this.exceedsLimit(this.spentAmountWith(amount, asOf, replacing));
    }

    /**
     * `wouldExceedWith` ile aynı hesabın tutar hâli: harcama uygulandığında
     * bütçenin ulaşacağı toplam. Diyalog metni bu değeri gösterir; ayrı bir
     * yerde yeniden hesaplanırsa gösterilen tutar ile verilen karar ayrışırdı.
     */
    spentAmountWith(amount: Money, asOf: Date = new Date(), replacing?: Money): Money {
        if (!amount.hasSameCurrency(this._amount)) {
            throw new CurrencyMismatchException(this._amount.currencyId, amount.currencyId);
        }
        if (replacing && !replacing.hasSameCurrency(this._amount)) {
            throw new CurrencyMismatchException(this._amount.currencyId, replacing.currencyId);
        }

        const base = replacing
            // Tutarsız defterde negatife düşmemek için sıfıra clamp —
            // `removeSpending` da aynısını yapıyor.
            ? this.subtractClamped(this.spentAmountAsOf(asOf), replacing)
            : this.spentAmountAsOf(asOf);

        return base.add(amount);
    }

    private subtractClamped(from: Money, value: Money): Money {
        const result = from.subtract(value);
        return result.isNegative()
            ? Money.zero(this._amount.currencyId, this._amount.minorUnit)
            : result;
    }

    isWarning(): boolean {
        const progress = this.getProgress();
        return progress.value >= this._warningPercentage.value && !this.isExceeded();
    }

    isActive(): boolean {
        return this._status === 'active';
    }

    getDailyAllowance(): Money {
        const daysRemaining = this._dateRange.getDaysRemaining();
        if (!daysRemaining || daysRemaining <= 0) {
            return Money.zero(this._amount.currencyId, this._amount.minorUnit);
        }

        const remaining = this.getRemainingAmount();
        if (remaining.isNegative()) {
            return Money.zero(this._amount.currencyId, this._amount.minorUnit);
        }

        return remaining.divide(daysRemaining);
    }

    hasCategory(categoryId: string): boolean {
        return this._categoryIds.includes(categoryId);
    }

    /**
     * Bu tarihteki bir harcama bütçenin **güncel** dönemine mi ait?
     *
     * `dateRange.contains()` tek başına yetmiyor: tekrarlayan bütçelerde bitiş
     * tarihi olmadığı için aralık açık uçlu ve `reset()` yalnızca `spentAmount`'ı
     * sıfırlıyor, aralığı ilerletmiyor. Son sıfırlamadan önceki harcamalar
     * `spentAmount`'tan zaten silinmiş durumda; onları hâlâ "eşleşiyor" saymak
     *
     *  - geriye dönük tarihli bir işlemin kapanmış bir dönemi güncel döneme
     *    eklemesine,
     *  - eski bir işlemin silinmesinin güncel dönemin harcamasını düşürmesine
     *
     * yol açıyordu. Ekleme ve geri alma aynı kuralı kullandığı için simetri korunur.
     */
    coversSpendingAt(date: Date): boolean {
        if (!this._dateRange.contains(date)) {
            return false;
        }

        if (date < this.spendingStartDate) {
            return false;
        }

        return !this._nextResetDate || date < this._nextResetDate;
    }
}
