/**
 * PrivacySettings Value Object
 * Gizlilikle ilgili tercihler (tutarları gizleme vb.)
 */
export interface PrivacySettingsProps {
    hideAmounts: boolean;
}

export class PrivacySettings {
    private constructor(public readonly hideAmounts: boolean) {}

    static default(): PrivacySettings {
        return new PrivacySettings(false);
    }

    static create(props: Partial<PrivacySettingsProps>): PrivacySettings {
        return new PrivacySettings(props.hideAmounts ?? false);
    }

    static from(raw: Partial<PrivacySettingsProps> | null | undefined): PrivacySettings {
        if (!raw) return PrivacySettings.default();
        return PrivacySettings.create(raw);
    }

    withHideAmounts(hideAmounts: boolean): PrivacySettings {
        return new PrivacySettings(hideAmounts);
    }

    equals(other: PrivacySettings): boolean {
        return this.hideAmounts === other.hideAmounts;
    }

    /**
     * Hassas string'i maskele. hideAmounts true ise "••••" döner.
     */
    mask(value: string, mask = '••••'): string {
        return this.hideAmounts ? mask : value;
    }

    toJSON(): PrivacySettingsProps {
        return { hideAmounts: this.hideAmounts };
    }
}
