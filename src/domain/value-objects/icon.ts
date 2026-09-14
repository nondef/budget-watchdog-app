/**
 * Icon Value Object
 * İkon adı ve arka plan rengi birlikte taşınır
 */
export interface IIcon {
    name: string;
    color: string;
}

export class Icon {
    private constructor(
        public readonly name: string,
        public readonly color: string
    ) {
        if (!name || name.trim().length === 0) {
            throw new Error('Icon name cannot be empty');
        }
    }

    static create(name: string, color: string): Icon {
        return new Icon(name, color);
    }

    /**
     * Varsayılan ikon
     */
    static default(): Icon {
        return new Icon('wallet-outline', 'bg-gray-500');
    }

    /**
     * Kategori tipi için varsayılan ikonlar
     */
    static forCategory(type: 'income' | 'expense'): Icon {
        return type === 'income'
            ? new Icon('arrow-down-circle-outline', 'bg-green-500')
            : new Icon('arrow-up-circle-outline', 'bg-red-500');
    }

    /**
     * Hesap tipi için varsayılan ikonlar
     */
    static forAccountType(type: 'cash' | 'bank' | 'credit' | 'investment' | 'savings'): Icon {
        const icons: Record<string, Icon> = {
            cash: new Icon('cash-outline', 'bg-green-500'),
            bank: new Icon('business-outline', 'bg-blue-500'),
            credit: new Icon('card-outline', 'bg-purple-500'),
            investment: new Icon('trending-up-outline', 'bg-orange-500'),
            savings: new Icon('wallet-outline', 'bg-teal-500')
        };
        return icons[type] ?? Icon.default();
    }

    /**
     * Rengi değiştir
     */
    withColor(color: string): Icon {
        return new Icon(this.name, color);
    }

    /**
     * İkonu değiştir
     */
    withName(name: string): Icon {
        return new Icon(name, this.color);
    }

    equals(other: Icon): boolean {
        return this.name === other.name && this.color === other.color;
    }

    toString(): string {
        return `${this.name} (${this.color})`;
    }

    toPlainObject(): IIcon {
        return {
            name: this.name,
            color: this.color
        }
    }
}

