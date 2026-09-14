import { BaseEntity } from './base-entity';
import { InvalidValueException, RequiredFieldException } from '../exceptions/domain.exception';
import { DEFAULT_MINOR_UNIT, MAX_MINOR_UNIT } from '../value-objects/money';

const ZERO_MINOR_UNIT_CODES = new Set(['JPY', 'KRW', 'CLP', 'VND']);
const THREE_MINOR_UNIT_CODES = new Set(['KWD', 'BHD', 'OMR', 'JOD']);

export function minorUnitForCurrencyCode(code: string): number {
    const normalized = code.trim().toUpperCase();
    if (ZERO_MINOR_UNIT_CODES.has(normalized)) return 0;
    if (THREE_MINOR_UNIT_CODES.has(normalized)) return 3;
    return DEFAULT_MINOR_UNIT;
}

export interface CurrencyProps {
    id: string;
    name: string;
    code: string;
    symbol: string;
    country: string;
    minorUnit?: number;
}

/**
 * Currency Entity
 * Para birimi bilgilerini tutar
 */
export class Currency extends BaseEntity {
    private _name: string;
    private _code: string;
    private _symbol: string;
    private _country: string;
    private _minorUnit: number;

    private constructor(props: CurrencyProps & { createdAt: Date; updatedAt: Date }) {
        super(props.id, props.createdAt, props.updatedAt);
        this._name = props.name;
        this._code = props.code;
        this._symbol = props.symbol;
        this._country = props.country;
        this._minorUnit = props.minorUnit ?? minorUnitForCurrencyCode(props.code);
    }

    static create(props: CurrencyProps): Currency {
        const now = new Date();

        if (!props.code || props.code.trim().length === 0) {
            throw new RequiredFieldException('Currency code')
        }

        if (!props.name || props.name.trim().length === 0) {
            throw new RequiredFieldException('Currency name')
        }

        const minorUnit = props.minorUnit ?? minorUnitForCurrencyCode(props.code);
        if (!Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > MAX_MINOR_UNIT) {
            throw new InvalidValueException(
                'minorUnit',
                `must be an integer between 0 and ${MAX_MINOR_UNIT}`
            )
        }

        return new Currency({
            ...props,
            code: props.code.toUpperCase(),
            minorUnit,
            createdAt: now,
            updatedAt: now
        });
    }

    static reconstitute(props: CurrencyProps & { createdAt?: Date; updatedAt?: Date }): Currency {
        return new Currency({
            ...props,
            minorUnit: props.minorUnit ?? minorUnitForCurrencyCode(props.code),
            createdAt: props.createdAt ?? new Date(),
            updatedAt: props.updatedAt ?? new Date()
        });
    }

    get name(): string { return this._name; }
    get code(): string { return this._code; }
    get symbol(): string { return this._symbol; }
    get country(): string { return this._country; }
    get minorUnit(): number { return this._minorUnit; }

    // ========== Query Methods ==========

    /**
     * Tutarı formatlı string olarak döner
     */
    format(amount: number, options?: {
        showSymbol?: boolean;
        decimals?: number;
        locale?: string;
    }): string {
        const {
            showSymbol = true,
            decimals = this._minorUnit,
            locale = 'tr-TR'
        } = options ?? {};

        const formatted = amount.toLocaleString(locale, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });

        return showSymbol ? `${formatted} ${this._symbol}` : formatted;
    }

    /**
     * İki para birimi aynı mı?
     */
    isSameAs(other: Currency): boolean {
        return this._code === other._code;
    }

    toString(): string {
        return `${this._name} (${this._code})`;
    }
}
