/**
 * Theme Value Object
 * Uygulama teması yönetimi
 */
export type ThemeMode = 'light' | 'dark' | 'system';

export class Theme {
    private constructor(public readonly value: ThemeMode) {}

    static light(): Theme {
        return new Theme('light');
    }

    static dark(): Theme {
        return new Theme('dark');
    }

    static system(): Theme {
        return new Theme('system');
    }

    static from(value: string): Theme {
        if (['light', 'dark', 'system'].includes(value)) {
            return new Theme(value as ThemeMode);
        }
        return Theme.system();
    }

    /**
     * Gerçek temayı hesapla (system ise sistem tercihini kullan)
     */
    resolveActualTheme(): 'light' | 'dark' {
        if (this.value === 'system') {
            if (typeof window !== 'undefined') {
                return window.matchMedia('(prefers-color-scheme: dark)').matches
                    ? 'dark'
                    : 'light';
            }
            return 'light';
        }
        return this.value;
    }

    isLight(): boolean {
        return this.resolveActualTheme() === 'light';
    }

    isDark(): boolean {
        return this.resolveActualTheme() === 'dark';
    }

    isSystem(): boolean {
        return this.value === 'system';
    }

    equals(other: Theme): boolean {
        return this.value === other.value;
    }

    toString(): string {
        return this.value;
    }
}

