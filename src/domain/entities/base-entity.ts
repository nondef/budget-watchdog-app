/**
 * Tüm Entity'lerin base class'ı
 * - Identity (id) yönetimi
 * - Equality comparison
 * - Timestamp yönetimi
 */
export abstract class BaseEntity {
    protected constructor(
        private readonly _id: string,
        private readonly _createdAt: Date = new Date(),
        private _updatedAt: Date = new Date()
    ) {}

    get id(): string {
        return this._id;
    }

    get createdAt(): Date | undefined {
        return this._createdAt
    }

    get updatedAt(): Date | undefined {
        return this._updatedAt;
    }

    protected touch(): void {
        this._updatedAt = new Date();
    }
}
