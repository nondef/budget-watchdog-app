import { CurrencyMismatchException, InvalidValueException } from '../exceptions/domain.exception';

/**
 * Money Value Object
 * Para tutarı ve para birimi birlikte taşınır
 * Immutable - her operasyon yeni instance döner
 */
export interface IMoney {
    amount: number
    currencyId: string
    minorUnit: number
}

export const DEFAULT_MINOR_UNIT = 2;
export const MAX_MINOR_UNIT = 3;

/**
 * Tutarı kuruş hassasiyetine yuvarlar.
 *
 * IEEE-754 toplamı bu uygulamada birikimli hataya yol açıyordu: 0.1 + 0.2
 * bakiyeye 0.30000000000000004 olarak yazılıyor, sonra `isLessThan` gibi
 * karşılaştırmalar kıl payı kaybedip haksız `InsufficientBalance` fırlatıyordu.
 * Her operasyonun sonucu tek noktada normalize edilir.
 */
function roundAmount(amount: number, minorUnit: number): number {
    const factor = 10 ** minorUnit;

    // `Number.EPSILON` payı: 1.005 gibi ikili tabanda tam temsil edilemeyen
    // değerlerde Math.round'un aşağı yuvarlamasını engeller.
    const rounded = Math.round((amount + Number.EPSILON * Math.sign(amount)) * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
}

export class Money {
    private constructor(
        public readonly amount: number,
        public readonly currencyId: string,
        public readonly minorUnit: number
    ) {
        if (!currencyId || !currencyId.trim()) {
            throw new InvalidValueException('currencyId', 'must not be empty');
        }

        if (!Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > MAX_MINOR_UNIT) {
            throw new InvalidValueException(
                'minorUnit',
                `must be an integer between 0 and ${MAX_MINOR_UNIT}`
            );
        }

        if (!Number.isFinite(amount)) {
            throw new InvalidValueException('amount', 'must be finite');
        }

        const factor = 10 ** minorUnit;

        if (Math.abs(amount) * factor > Number.MAX_SAFE_INTEGER) {
            throw new InvalidValueException(
                'amount',
                `exceeds the safe range for ${minorUnit} decimal places`
            );
        }
    }

    static create(
        amount: number,
        currencyId: string,
        minorUnit: number = DEFAULT_MINOR_UNIT
    ): Money {
        return new Money(roundAmount(amount, minorUnit), currencyId, minorUnit);
    }

    static zero(currencyId: string, minorUnit: number = DEFAULT_MINOR_UNIT): Money {
        return new Money(0, currencyId, minorUnit);
    }

    add(other: Money): Money {
        this.assertSameCurrency(other);
        return Money.create(this.amount + other.amount, this.currencyId, this.minorUnit);
    }

    subtract(other: Money): Money {
        this.assertSameCurrency(other);
        return Money.create(this.amount - other.amount, this.currencyId, this.minorUnit);
    }

    multiply(factor: number): Money {
        if (!Number.isFinite(factor)) {
            throw new InvalidValueException('factor', 'must be finite');
        }
        return Money.create(this.amount * factor, this.currencyId, this.minorUnit);
    }

    divide(divisor: number): Money {
        if (!Number.isFinite(divisor) || divisor === 0) {
            throw new InvalidValueException('divisor', 'must be finite and non-zero');
        }
        return Money.create(this.amount / divisor, this.currencyId, this.minorUnit);
    }

    isZero(): boolean {
        return this.amount === 0;
    }

    isPositive(): boolean {
        return this.amount > 0;
    }

    isNegative(): boolean {
        return this.amount < 0;
    }

    isLessThan(other: Money): boolean {
        this.assertSameCurrency(other);
        return this.amount < other.amount;
    }

    isLessThanOrEqual(other: Money): boolean {
        this.assertSameCurrency(other);
        return this.amount <= other.amount;
    }

    isGreaterThan(other: Money): boolean {
        this.assertSameCurrency(other);
        return this.amount > other.amount;
    }

    isGreaterThanOrEqual(other: Money): boolean {
        this.assertSameCurrency(other);
        return this.amount >= other.amount;
    }

    hasSameCurrency(other: Money): boolean {
        return this.currencyId === other.currencyId;
    }

    convertTo(
        targetCurrencyId: string,
        rate: number,
        targetMinorUnit: number = this.minorUnit
    ): Money {
        if (this.currencyId === targetCurrencyId) {
            return this
        }

        if (!Number.isFinite(rate) || rate <= 0) {
            throw new InvalidValueException('exchangeRate', 'must be finite and greater than 0');
        }

        return Money.create(this.amount * rate, targetCurrencyId, targetMinorUnit)
    }

    private assertSameCurrency(other: Money): void {
        if (!this.hasSameCurrency(other)) {
            throw new CurrencyMismatchException(this.currencyId, other.currencyId);
        }
        if (this.minorUnit !== other.minorUnit) {
            throw new InvalidValueException(
                'minorUnit',
                `currency ${this.currencyId} has conflicting scales`
            );
        }
    }

    equals(other: Money): boolean {
        return this.amount === other.amount &&
            this.currencyId === other.currencyId &&
            this.minorUnit === other.minorUnit;
    }

    /**
     * Yüzdelik hesaplama
     */
    percentageOf(total: Money): number {
        this.assertSameCurrency(total);
        if (total.amount === 0) return 0;
        return (this.amount / total.amount) * 100;
    }

    /**
     * Formatlı string
     */
    toString(): string {
        return `${this.amount} ${this.currencyId}`;
    }

    toPlainObject(): IMoney {
        return {
            amount: this.amount,
            currencyId: this.currencyId,
            minorUnit: this.minorUnit
        }
    }
}

