import { InvalidValueException } from './exceptions/domain.exception';

export function assertValidDate(value: unknown, field: string): asserts value is Date {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
        throw new InvalidValueException(field, 'must be a valid date');
    }
}
