/**
 * NotificationPreferences Value Object
 * Bildirim tercihleri yönetimi
 */
export interface NotificationPreferencesData {
    budgetWarnings: boolean;
    budgetExceeded: boolean;
    savingGoalReminders: boolean;
    weeklyReport: boolean;
    monthlyReport: boolean;
    transactionReminders: boolean;
}

export class NotificationPreferences {
    private constructor(
        public readonly budgetWarnings: boolean,
        public readonly budgetExceeded: boolean,
        public readonly savingGoalReminders: boolean,
        public readonly weeklyReport: boolean,
        public readonly monthlyReport: boolean,
        public readonly transactionReminders: boolean
    ) {}

    static create(data: NotificationPreferencesData): NotificationPreferences {
        return new NotificationPreferences(
            data.budgetWarnings,
            data.budgetExceeded,
            data.savingGoalReminders,
            data.weeklyReport,
            data.monthlyReport,
            data.transactionReminders
        );
    }

    static default(): NotificationPreferences {
        return new NotificationPreferences(
            true,  // budgetWarnings
            true,  // budgetExceeded
            true,  // savingGoalReminders
            false, // weeklyReport
            true,  // monthlyReport
            false  // transactionReminders
        );
    }

    static from(data: Partial<NotificationPreferencesData>): NotificationPreferences {
        const defaults = NotificationPreferences.default();
        return new NotificationPreferences(
            data.budgetWarnings ?? defaults.budgetWarnings,
            data.budgetExceeded ?? defaults.budgetExceeded,
            data.savingGoalReminders ?? defaults.savingGoalReminders,
            data.weeklyReport ?? defaults.weeklyReport,
            data.monthlyReport ?? defaults.monthlyReport,
            data.transactionReminders ?? defaults.transactionReminders
        );
    }

    static allEnabled(): NotificationPreferences {
        return new NotificationPreferences(true, true, true, true, true, true);
    }

    static allDisabled(): NotificationPreferences {
        return new NotificationPreferences(false, false, false, false, false, false);
    }

    /**
     * Belirli tercihleri güncelleyerek yeni instance oluştur
     */
    with(updates: Partial<NotificationPreferencesData>): NotificationPreferences {
        return new NotificationPreferences(
            updates.budgetWarnings ?? this.budgetWarnings,
            updates.budgetExceeded ?? this.budgetExceeded,
            updates.savingGoalReminders ?? this.savingGoalReminders,
            updates.weeklyReport ?? this.weeklyReport,
            updates.monthlyReport ?? this.monthlyReport,
            updates.transactionReminders ?? this.transactionReminders
        );
    }

    /**
     * Tüm bildirimleri aç
     */
    enableAll(): NotificationPreferences {
        return NotificationPreferences.allEnabled();
    }

    /**
     * Tüm bildirimleri kapat
     */
    disableAll(): NotificationPreferences {
        return NotificationPreferences.allDisabled();
    }

    /**
     * En az bir bildirim açık mı?
     */
    hasAnyEnabled(): boolean {
        return (
            this.budgetWarnings ||
            this.budgetExceeded ||
            this.savingGoalReminders ||
            this.weeklyReport ||
            this.monthlyReport ||
            this.transactionReminders
        );
    }

    /**
     * Tüm bildirimler kapalı mı?
     */
    isAllDisabled(): boolean {
        return !this.hasAnyEnabled();
    }

    toObject(): NotificationPreferencesData {
        return {
            budgetWarnings: this.budgetWarnings,
            budgetExceeded: this.budgetExceeded,
            savingGoalReminders: this.savingGoalReminders,
            weeklyReport: this.weeklyReport,
            monthlyReport: this.monthlyReport,
            transactionReminders: this.transactionReminders
        };
    }

    equals(other: NotificationPreferences): boolean {
        return (
            this.budgetWarnings === other.budgetWarnings &&
            this.budgetExceeded === other.budgetExceeded &&
            this.savingGoalReminders === other.savingGoalReminders &&
            this.weeklyReport === other.weeklyReport &&
            this.monthlyReport === other.monthlyReport &&
            this.transactionReminders === other.transactionReminders
        );
    }
}

