import { describe, expect, it } from 'vitest';
import { parseDate } from '@/infrastructure/database/repositories/casts';

describe('parseDate', () => {
    it('repository\'nin yazdığı ISO 8601 değerini korur', () => {
        const iso = '2026-05-05T10:30:00.000Z';

        expect(parseDate(iso, 'date').toISOString()).toBe(iso);
    });

    it('SQLite CURRENT_TIMESTAMP formatını UTC sayar', () => {
        // 'YYYY-MM-DD HH:MM:SS' zaman dilimi eki taşımaz; JS bunu yerel saat
        // sayınca DEFAULT CURRENT_TIMESTAMP'e düşen satırların tarihi kayıyordu.
        expect(parseDate('2026-05-05 10:30:00', 'created_at').toISOString())
            .toBe('2026-05-05T10:30:00.000Z');

        expect(parseDate('2026-05-05 10:30:00.250', 'created_at').toISOString())
            .toBe('2026-05-05T10:30:00.250Z');
    });

    it('Date örneğini kopyalar', () => {
        const original = new Date('2026-01-01T00:00:00.000Z');
        const parsed = parseDate(original, 'date');

        expect(parsed).not.toBe(original);
        expect(parsed.toISOString()).toBe(original.toISOString());
    });

    it('geçersiz değerde hata verir', () => {
        expect(() => parseDate('yarın', 'date')).toThrow(/Invalid date value for 'date'/);
    });
});
