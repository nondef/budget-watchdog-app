/**
 * Progress Value Object
 * Yüzdelik ilerleme değeri - %100'ü aşabilir (bütçe aşımı gibi durumlar için)
 */
export class Progress {
    private constructor(public readonly value: number) {
        if (value < 0) {
            throw new Error('Progress cannot be negative');
        }
    }

    static create(value: number): Progress {
        return new Progress(value);
    }

    static zero(): Progress {
        return new Progress(0);
    }

    static full(): Progress {
        return new Progress(100);
    }

    /**
     * Decimal'den progress oluştur (0.75 -> 75)
     */
    static fromDecimal(decimal: number): Progress {
        return new Progress(decimal * 100);
    }

    /**
     * İki değerin oranından progress oluştur
     * Limitli değil - %100'ü aşabilir
     */
    static fromRatio(part: number, whole: number): Progress {
        if (whole === 0) return Progress.zero();
        return new Progress((part / whole) * 100);
    }

    /**
     * Decimal olarak (75 -> 0.75)
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
     * Sıfır mı?
     */
    isZero(): boolean {
        return this.value === 0;
    }

    /**
     * %100 veya daha fazla mı?
     */
    isComplete(): boolean {
        return this.value >= 100;
    }

    /**
     * %100'ü aştı mı?
     */
    isExceeded(): boolean {
        return this.value > 100;
    }

    /**
     * Belirli bir eşiği aştı mı?
     */
    hasReached(threshold: number): boolean {
        return this.value >= threshold;
    }

    /**
     * Kalan yüzde (negatif olabilir)
     */
    remaining(): number {
        return 100 - this.value;
    }

    /**
     * Capped değer (0-100 arası)
     */
    capped(): number {
        return Math.min(100, Math.max(0, this.value));
    }

    isGreaterThan(other: Progress): boolean {
        return this.value > other.value;
    }

    isLessThan(other: Progress): boolean {
        return this.value < other.value;
    }

    isGreaterThanOrEqual(other: Progress): boolean {
        return this.value >= other.value;
    }

    isLessThanOrEqual(other: Progress): boolean {
        return this.value <= other.value;
    }

    equals(other: Progress): boolean {
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

    /**
     * Capped formatlı string (max 100%)
     */
    toCappedString(): string {
        return `${Math.round(this.capped())}%`;
    }
}

