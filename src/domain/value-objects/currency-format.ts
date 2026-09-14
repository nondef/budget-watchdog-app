/**
 * CurrencyFormat Value Object
 * Para birimi gösterim formatı tercihleri
 */
export type CurrencyPosition = 'start' | 'end';
export type DecimalPlaces = 0 | 1 | 2;

export interface CurrencyFormatProps {
    position: CurrencyPosition;
    useDigitGrouping: boolean;
    showDecimalPlaces: boolean;
    decimalPlaces: DecimalPlaces;
}

export class CurrencyFormat {
    private constructor(
        public readonly position: CurrencyPosition,
        public readonly useDigitGrouping: boolean,
        public readonly showDecimalPlaces: boolean,
        public readonly decimalPlaces: DecimalPlaces,
    ) {}

    static default(): CurrencyFormat {
        return new CurrencyFormat('end', true, true, 2);
    }

    static create(props: Partial<CurrencyFormatProps>): CurrencyFormat {
        const base = CurrencyFormat.default();
        return new CurrencyFormat(
            props.position ?? base.position,
            props.useDigitGrouping ?? base.useDigitGrouping,
            props.showDecimalPlaces ?? base.showDecimalPlaces,
            (props.decimalPlaces ?? base.decimalPlaces) as DecimalPlaces,
        );
    }

    static from(raw: Partial<CurrencyFormatProps> | null | undefined): CurrencyFormat {
        if (!raw) return CurrencyFormat.default();
        return CurrencyFormat.create(raw);
    }

    withPosition(position: CurrencyPosition): CurrencyFormat {
        return new CurrencyFormat(position, this.useDigitGrouping, this.showDecimalPlaces, this.decimalPlaces);
    }

    withDigitGrouping(useDigitGrouping: boolean): CurrencyFormat {
        return new CurrencyFormat(this.position, useDigitGrouping, this.showDecimalPlaces, this.decimalPlaces);
    }

    withShowDecimals(showDecimalPlaces: boolean): CurrencyFormat {
        return new CurrencyFormat(this.position, this.useDigitGrouping, showDecimalPlaces, this.decimalPlaces);
    }

    withDecimalPlaces(decimalPlaces: DecimalPlaces): CurrencyFormat {
        return new CurrencyFormat(this.position, this.useDigitGrouping, this.showDecimalPlaces, decimalPlaces);
    }

    equals(other: CurrencyFormat): boolean {
        return (
            this.position === other.position &&
            this.useDigitGrouping === other.useDigitGrouping &&
            this.showDecimalPlaces === other.showDecimalPlaces &&
            this.decimalPlaces === other.decimalPlaces
        );
    }

    toJSON(): CurrencyFormatProps {
        return {
            position: this.position,
            useDigitGrouping: this.useDigitGrouping,
            showDecimalPlaces: this.showDecimalPlaces,
            decimalPlaces: this.decimalPlaces,
        };
    }

    /**
     * Verilen tutarı formatlanmış string'e çevir.
     * Locale tr-TR varsayılan (1.234,56).
     */
    format(amount: number, symbol = '₺', locale = 'tr-TR'): string {
        const fractionDigits = this.showDecimalPlaces ? this.decimalPlaces : 0;
        const numberPart = new Intl.NumberFormat(locale, {
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits,
            useGrouping: this.useDigitGrouping,
        }).format(amount);

        return this.position === 'start' ? `${symbol} ${numberPart}` : `${numberPart} ${symbol}`;
    }
}
