import { DatabaseAdapter } from "@/domain";
import { logger } from "@/infrastructure/logging";

const CTX = "migration";

export interface Migration {
    version: number;
    name: string;
    up(db: DatabaseAdapter): Promise<void>;
    down(db: DatabaseAdapter): Promise<void>;
}

export type ColumnType = "TEXT" | "INTEGER" | "REAL" | "BLOB" | "TIMESTAMP";

export interface ColumnDefinition {
    name: string;
    type: ColumnType;
    primaryKey?: boolean;
    notNull?: boolean;
    unique?: boolean;
    default?: string | number | null;
    check?: string;
    references?: {
        table: string;
        column: string;
        onDelete?: "CASCADE" | "RESTRICT" | "SET NULL" | "NO ACTION";
    };
}

export interface IndexDefinition {
    name: string;
    table: string;
    columns: string | string[];
}

export abstract class BaseMigration implements Migration {
    abstract version: number;
    abstract name: string;

    abstract up(db: DatabaseAdapter): Promise<void>;
    abstract down(db: DatabaseAdapter): Promise<void>;

    protected async createTable(
        db: DatabaseAdapter,
        tableName: string,
        columns: ColumnDefinition[]
    ): Promise<void> {
        const columnDefs = columns.map(col => this.buildColumnDef(col));
        const foreignKeys = columns
            .filter(col => col.references)
            .map(col => this.buildForeignKey(col));

        const allDefs = [...columnDefs, ...foreignKeys].join(",\n        ");
        const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (\n        ${allDefs}\n    )`;

        await db.execute(sql);
        logger.debug(`Tablo oluşturuldu: ${tableName}`, { context: CTX, data: { sql } });
    }

    protected async dropTable(db: DatabaseAdapter, tableName: string): Promise<void> {
        await db.execute(`DROP TABLE IF EXISTS ${tableName}`);
        logger.debug(`Tablo silindi: ${tableName}`, { context: CTX });
    }

    protected async createIndex(
        db: DatabaseAdapter,
        indexName: string,
        tableName: string,
        columns: string | string[]
    ): Promise<void> {
        const cols = Array.isArray(columns) ? columns.join(", ") : columns;
        await db.execute(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${cols})`);
        logger.debug(`Index oluşturuldu: ${indexName}`, { context: CTX });
    }

    protected async createIndexes(db: DatabaseAdapter, indexes: IndexDefinition[]): Promise<void> {
        for (const idx of indexes) {
            await this.createIndex(db, idx.name, idx.table, idx.columns);
        }
    }

    protected async dropIndex(db: DatabaseAdapter, indexName: string): Promise<void> {
        await db.execute(`DROP INDEX IF EXISTS ${indexName}`);
        logger.debug(`Index silindi: ${indexName}`, { context: CTX });
    }

    protected async dropIndexes(db: DatabaseAdapter, indexNames: string[]): Promise<void> {
        for (const name of indexNames) {
            await this.dropIndex(db, name);
        }
    }

    private buildColumnDef(col: ColumnDefinition): string {
        const parts: string[] = [col.name, col.type];

        if (col.primaryKey) parts.push("PRIMARY KEY");
        if (col.notNull) parts.push("NOT NULL");
        if (col.unique) parts.push("UNIQUE");
        if (col.default !== undefined) {
            const defaultVal =
                col.default === null
                    ? "NULL"
                    : col.default === "CURRENT_TIMESTAMP"
                        ? "CURRENT_TIMESTAMP"
                        : typeof col.default === "string"
                            ? `'${col.default}'`
                            : col.default;
            parts.push(`DEFAULT ${defaultVal}`);
        }
        if (col.check) parts.push(`CHECK(${col.check})`);

        return parts.join(" ");
    }

    private buildForeignKey(col: ColumnDefinition): string {
        const ref = col.references!;
        let fk = `FOREIGN KEY (${col.name}) REFERENCES ${ref.table}(${ref.column})`;
        if (ref.onDelete) fk += ` ON DELETE ${ref.onDelete}`;
        return fk;
    }
}