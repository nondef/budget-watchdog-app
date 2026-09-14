import { BaseEntity } from './base-entity';
import { NegativeAmountException } from '../exceptions/domain.exception';
import { uuid } from "@/shared/utils/id/uuid";

export interface ExchangeRateProps {
    id: string;
    baseCurrencyId: string;
    targetCurrencyId: string;
    rate: number;
    buyingRate?: number | null;
    sellingRate?: number | null;
    changeRate?: number | null;
    fetchDate: Date;
}
export class ExchangeRate extends BaseEntity {
    private _baseCurrencyId: string
    private _targetCurrencyId: string
    private _rate: number
    private _buyingRate: number | null
    private _sellingRate: number | null
    private _changeRate: number | null
    private _fetchDate: Date

    private constructor(props: ExchangeRateProps & { createdAt: Date, updatedAt: Date }) {
        super(props.id, props.createdAt, props.updatedAt)
        this._baseCurrencyId = props.baseCurrencyId
        this._targetCurrencyId = props.targetCurrencyId
        this._rate = props.rate
        this._buyingRate = props.buyingRate ?? null
        this._sellingRate = props.sellingRate ?? null
        this._changeRate = props.changeRate ?? null
        this._fetchDate = props.fetchDate
    }

    static create(props: Omit<ExchangeRateProps, 'id'>) {
        if (props.rate <= 0) {
            throw new NegativeAmountException('Rate must be positive integer')
        }

        // Verildiyse alış/satış kurları da pozitif olmalı; null/undefined "bilinmiyor"
        // demek ve serbest bırakılır.
        if (props.buyingRate != null && props.buyingRate <= 0) {
            throw new NegativeAmountException('Buying rate must be positive');
        }

        if (props.sellingRate != null && props.sellingRate <= 0) {
            throw new NegativeAmountException('Selling rate must be positive');
        }

        const now = new Date()
        const id = uuid()

        return new ExchangeRate({ ...props, id, createdAt: now, updatedAt: now })
    }

    static reconstitute(props: ExchangeRateProps & { createdAt?: Date; updatedAt?: Date }): ExchangeRate {
        return new ExchangeRate({
            ...props,
            createdAt: props.createdAt ?? new Date(),
            updatedAt: props.updatedAt ?? new Date(),
        });
    }

    get baseCurrencyId() { return this._baseCurrencyId; }
    get targetCurrencyId() { return this._targetCurrencyId; }
    get rate() { return this._rate; }
    get buyingRate() { return this._buyingRate; }
    get sellingRate() { return this._sellingRate; }
    get changeRate() { return this._changeRate; }
    get fetchDate() { return this._fetchDate; }

    isStale(maxAgeMs = 30 * 60 * 1000): boolean {
        return Date.now() - this._fetchDate.getTime() > maxAgeMs;
    }
}
