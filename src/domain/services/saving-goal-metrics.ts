import type { SavingGoalStatus } from '../entities/saving-goal';
import { Money, type IMoney } from '../value-objects/money';
import { Percentage } from '../value-objects/percentage';

export function savingGoalProgress(saved: number, target: number): number {
    return Percentage.fromRatio(saved, target).value;
}

export function savingGoalRemaining(target: IMoney, saved: IMoney): Money {
    const remaining = Money.create(target.amount, target.currencyId, target.minorUnit)
        .subtract(Money.create(saved.amount, saved.currencyId, saved.minorUnit));
    return remaining.isNegative() ? Money.zero(target.currencyId, target.minorUnit) : remaining;
}

export function savingGoalDaysRemaining(targetDate?: Date | null, now = Date.now()): number | null {
    if (!targetDate) return null;
    return Math.max(0, Math.ceil((new Date(targetDate).getTime() - now) / 86_400_000));
}

/** Money üzerinden karşılaştırır: para birimi uyuşmazlığı sessizce geçmesin. */
export function savingGoalReached(saved: IMoney, target: IMoney): boolean {
    return Money.create(saved.amount, saved.currencyId, saved.minorUnit)
        .isGreaterThanOrEqual(Money.create(target.amount, target.currencyId, target.minorUnit));
}

/**
 * Para çekilebilir durumlar. Paused/cancelled bilinçli olarak durdurulmuş
 * hâller; tamamlanmış hedeften çekmek serbest.
 */
export function savingGoalCanWithdraw(status: SavingGoalStatus): boolean {
    return status === 'active' || status === 'completed';
}

/** Hedef tarih geçti mi? Yalnızca aktif hedefler gecikmiş sayılır. */
export function savingGoalOverdue(
    targetDate: Date | null | undefined,
    status: SavingGoalStatus,
    now = Date.now(),
): boolean {
    if (!targetDate || status !== 'active') return false;
    return new Date(targetDate).getTime() < now;
}
