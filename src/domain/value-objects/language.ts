/**
 * Language Value Object
 * Uygulama dili yönetimi
 */
export type LanguageCode = 'tr' | 'en' | 'de' | 'fr' | 'es' | 'ar';

export interface LanguageConfig {
    code: LanguageCode;
    name: string;
    nativeName: string;
    direction: 'ltr' | 'rtl';
}

export class Language {
    private static readonly LANGUAGES: Record<LanguageCode, LanguageConfig> = {
        tr: { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', direction: 'ltr' },
        en: { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr' },
        de: { code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr' },
        fr: { code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr' },
        es: { code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr' },
        ar: { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl' }
    };

    private constructor(public readonly code: LanguageCode) {}

    static turkish(): Language {
        return new Language('tr');
    }

    static english(): Language {
        return new Language('en');
    }

    static from(code: string): Language {
        if (code in Language.LANGUAGES) {
            return new Language(code as LanguageCode);
        }
        return Language.turkish(); // default
    }

    static getAvailable(): LanguageConfig[] {
        return Object.values(Language.LANGUAGES);
    }

    static isSupported(code: string): boolean {
        return code in Language.LANGUAGES;
    }

    get config(): LanguageConfig {
        return Language.LANGUAGES[this.code];
    }

    get name(): string {
        return this.config.name;
    }

    get nativeName(): string {
        return this.config.nativeName;
    }

    get direction(): 'ltr' | 'rtl' {
        return this.config.direction;
    }

    isRtl(): boolean {
        return this.direction === 'rtl';
    }

    equals(other: Language): boolean {
        return this.code === other.code;
    }

    get locale(): string {
        const localeMap: Record<LanguageCode, string> = {
            tr: 'tr-TR',
            en: 'en-US',
            de: 'de-DE',
            fr: 'fr-FR',
            es: 'es-ES',
            ar: 'ar-SA'
        }

        return localeMap[this.code]
    }

    toString(): string {
        return this.code;
    }
}

