import { Currency } from '../entities/currency';
import { IRepository } from './repository.interface';

export interface ICurrencyRepository extends IRepository<Currency> {
    findByCode(code: string): Promise<Currency | null>;
    findByIds(ids: string[]): Promise<Currency[]>;
    findPopular(): Promise<Currency[]>;
    search(term: string): Promise<Currency[]>;
}
