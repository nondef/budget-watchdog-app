import { Icon } from '../value-objects/icon';
import { BaseEntity } from './base-entity';
import { RequiredFieldException, ValidationException } from '../exceptions/domain.exception';
import { uuid } from "@/shared/utils/id/uuid";

export type CategoryType = 'expense' | 'income';

export interface CreateCategoryProps {
    name: string;
    type: CategoryType;
    icon: string;
    color: string;
}

export interface CategoryProps {
    id: string;
    name: string;
    type: CategoryType;
    icon: Icon;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export class Category extends BaseEntity {
    private _name: string;
    private _type: CategoryType;
    private _icon: Icon;
    private _isSystem: boolean;

    private constructor(props: CategoryProps) {
        super(props.id, props.createdAt, props.updatedAt);
        this._name = props.name;
        this._type = props.type;
        this._icon = props.icon;
        this._isSystem = props.isSystem;
    }

    static create(props: CreateCategoryProps): Category {
        const id = uuid()
        const now = new Date();

        if (!props.name || props.name.trim().length === 0) {
            throw new RequiredFieldException('Category name');
        }
        return new Category({
            id,
            name: props.name.trim(),
            type: props.type,
            icon: Icon.create(props.icon, props.color),
            // subcategories,
            isSystem: false,
            createdAt: now,
            updatedAt: now
        });
    }

    /**
     * Sistem kategorisi oluştur (silinemez)
     */
    static createSystem(props: CreateCategoryProps & { id: string }): Category {
        const now = new Date();

        return new Category({
            id: props.id,
            name: props.name.trim(),
            type: props.type,
            icon: Icon.create(props.icon, props.color),
            // subcategories,
            isSystem: true,
            createdAt: now,
            updatedAt: now
        });
    }

    static reconstitute(props: CategoryProps): Category {
        return new Category(props);
    }

    rename(newName: string): void {
        if (!newName || newName.trim().length === 0) {
            throw new ValidationException('Category name cannot be empty', 'name');
        }
        this._name = newName.trim();
        this.touch();
    }

    changeIcon(icon: Icon): void {
        this._icon = icon;
        this.touch();
    }

    get name(): string { return this._name; }
    get type(): CategoryType { return this._type; }
    get icon(): Icon { return this._icon; }
    // get subcategories(): SubCategory[] { return [...this._subcategories]; }
    get isSystem(): boolean { return this._isSystem; }
    get color(): string { return this._icon.color; }

    isExpense(): boolean {
        return this._type === 'expense';
    }

    isIncome(): boolean {
        return this._type === 'income';
    }

    canDelete(): boolean {
        return !this._isSystem;
    }
}

