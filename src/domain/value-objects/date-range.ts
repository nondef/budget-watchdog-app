/**
 * DateRange Value Object
 * Başlangıç ve bitiş tarihleri birlikte yönetilir
 */
export class DateRange {
    private constructor(
        public readonly startDate: Date,
        public readonly endDate?: Date
    ) {
        assertValidDate(startDate, 'startDate');
        if (endDate !== undefined) {
            assertValidDate(endDate, 'endDate');
        }
        if (endDate && startDate > endDate) {
            throw new ValidationException('Start date cannot be after end date', 'endDate');
        }
    }

    static create(startDate: Date, endDate?: Date): DateRange {
        return new DateRange(startDate, endDate);
    }

    static fromStrings(startDate: string, endDate?: string): DateRange {
        return new DateRange(
            new Date(startDate),
            endDate ? new Date(endDate) : undefined
        );
    }

    /**
     * Bugünden başlayan sınırsız range
     */
    static fromToday(): DateRange {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return new DateRange(today);
    }

    /**
     * Bu ay için range
     */
    static thisMonth(): DateRange {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return new DateRange(start, end);
    }

    /**
     * Bu hafta için range
     */
    static thisWeek(): DateRange {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const start = new Date(now);
        start.setDate(now.getDate() - dayOfWeek);
        start.setHours(0, 0, 0, 0);
        
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        
        return new DateRange(start, end);
    }

    /**
     * Belirtilen tarih range içinde mi?
     */
    contains(date: Date): boolean {
        if (date < this.startDate) return false;
        if (this.endDate && date > this.endDate) return false;
        return true;
    }

    /**
     * Range süresi dolmuş mu?
     */
    isExpired(): boolean {
        if (!this.endDate) return false;
        return new Date() > this.endDate;
    }

    /**
     * Range henüz başlamamış mı?
     */
    hasNotStarted(): boolean {
        return new Date() < this.startDate;
    }

    /**
     * Range aktif mi? (başlamış ve bitmemiş)
     */
    isActive(): boolean {
        const now = new Date();
        if (now < this.startDate) return false;
        if (this.endDate && now > this.endDate) return false;
        return true;
    }

    /**
     * Kalan gün sayısı
     */
    getDaysRemaining(): number | null {
        if (!this.endDate) return null;
        const now = new Date();
        const diff = this.endDate.getTime() - now.getTime();
        return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    /**
     * Toplam gün sayısı
     */
    getTotalDays(): number | null {
        if (!this.endDate) return null;
        const diff = this.endDate.getTime() - this.startDate.getTime();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    /**
     * Geçen gün sayısı
     */
    getDaysPassed(): number {
        const now = new Date();
        const effectiveEnd = now < this.startDate ? this.startDate : now;
        const diff = effectiveEnd.getTime() - this.startDate.getTime();
        return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    }

    /**
     * İlerleme yüzdesi (0-100)
     */
    getProgress(): number {
        const total = this.getTotalDays();
        if (!total) return 0;
        const passed = this.getDaysPassed();
        return Math.min(100, Math.round((passed / total) * 100));
    }

    equals(other: DateRange): boolean {
        const startEqual = this.startDate.getTime() === other.startDate.getTime();
        const endEqual = this.endDate && other.endDate
            ? this.endDate.getTime() === other.endDate.getTime()
            : !this.endDate && !other.endDate;

        return startEqual && endEqual;
    }
}

import { ValidationException } from '../exceptions/domain.exception';
import { assertValidDate } from '../validation';
