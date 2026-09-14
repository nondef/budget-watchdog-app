/**
 * Percentage Value Object
 * Yüzdelik değerleri güvenli şekilde yönetir (0-100 arası)
 */
export interface IPercentage {
    value: number
}

export class Percentage {
    private constructor(public readonly value: number) {
        if (value < 0 || value > 100) {
            throw new Error('Percentage must be between 0 and 100');
        }
    }

    static create(value: number): Percentage {
        return new Percentage(value);
    }

    static zero(): Percentage {
        return new Percentage(0);
    }

    static full(): Percentage {
        return new Percentage(100);
    }

    /**
     * Decimal'den yüzde oluştur (0.75 -> 75%)
     */
    static fromDecimal(decimal: number): Percentage {
        return new Percentage(decimal * 100);
    }

    /**
     * İki değerin oranından yüzde oluştur
     */
    static fromRatio(part: number, whole: number): Percentage {
        if (whole === 0) return Percentage.zero();
        const value = Math.min(100, Math.max(0, (part / whole) * 100));
        return new Percentage(value);
    }

    /**
     * Decimal olarak (75% -> 0.75)
     */
    toDecimal(): number {
        return this.value / 100;
    }

    /**
     * Bir değerin bu yüzdesini hesapla
     */
    of(amount: number): number {
        return amount * this.toDecimal();
    }

    /**
     * Bu yüzde eşik değerini aşmış mı?
     */
    isExceeded(current: number, total: number): boolean {
        if (total === 0) return false;
        const currentPercentage = (current / total) * 100;
        return currentPercentage >= this.value;
    }

    /**
     * Kalan yüzde
     */
    remaining(): Percentage {
        return new Percentage(100 - this.value);
    }

    isZero(): boolean {
        return this.value === 0;
    }

    isFull(): boolean {
        return this.value >= 100;
    }

    isGreaterThan(other: Percentage): boolean {
        return this.value > other.value;
    }

    isLessThan(other: Percentage): boolean {
        return this.value < other.value;
    }

    equals(other: Percentage): boolean {
        return this.value === other.value;
    }

    /**
     * Formatlı string
     */
    toString(): string {
        return `${Math.round(this.value)}%`;
    }

    /**
     * Ondalıklı formatlı string
     */
    toStringWithDecimals(decimals: number = 1): string {
        return `${this.value.toFixed(decimals)}%`;
    }
}

