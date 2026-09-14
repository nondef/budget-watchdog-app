/**
 * WeekDay Value Object
 * Haftanın başlangıç günü tercihi
 */
export type WeekDayValue =
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday'
    | 'sunday';

const VALID: WeekDayValue[] = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
];

const LABELS_TR: Record<WeekDayValue, string> = {
    monday: 'Pazartesi',
    tuesday: 'Salı',
    wednesday: 'Çarşamba',
    thursday: 'Perşembe',
    friday: 'Cuma',
    saturday: 'Cumartesi',
    sunday: 'Pazar',
};

const ISO_INDEX: Record<WeekDayValue, number> = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 7,
};

export class WeekDay {
    private constructor(public readonly value: WeekDayValue) {}

    static monday(): WeekDay {
        return new WeekDay('monday');
    }

    static sunday(): WeekDay {
        return new WeekDay('sunday');
    }

    static default(): WeekDay {
        return WeekDay.monday();
    }

    static from(value: string | null | undefined): WeekDay {
        if (value && (VALID as string[]).includes(value)) {
            return new WeekDay(value as WeekDayValue);
        }
        return WeekDay.default();
    }

    static all(): WeekDay[] {
        return VALID.map((v) => new WeekDay(v));
    }

    get label(): string {
        return LABELS_TR[this.value];
    }

    get isoIndex(): number {
        return ISO_INDEX[this.value];
    }

    equals(other: WeekDay): boolean {
        return this.value === other.value;
    }

    toString(): string {
        return this.value;
    }
}
