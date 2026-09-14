import { DatabaseAdapter, IUnitOfWork } from "@/domain";
import { SqliteUnitOfWork } from "@/infrastructure/database/unit-of-work";

export interface RepositoryClass<T> {
    new (db: DatabaseAdapter): T
}

class RepositoryManager {
    private repositories = new Map<RepositoryClass<any>, any>
    private db: DatabaseAdapter | null = null
    private unitOfWork: IUnitOfWork | null = null

    async initialize(db: DatabaseAdapter) {
        this.db ??= db
    }

    /**
     * Repository'lerle **aynı** adapter örneği üzerinden çalışan Unit of Work.
     *
     * Tek örnek olması şart: bütün bağımsız yazma işlerini aynı kuyrukta
     * sıralayan sahiplik bu nesnenin içindedir.
     */
    getUnitOfWork(): IUnitOfWork {
        if (!this.db) {
            throw new Error('RepositoryManager not initialized. Call initialize() first.')
        }

        return this.unitOfWork ??= new SqliteUnitOfWork(this.db)
    }

    getRepository<T>(repositoryClass: RepositoryClass<T>): T {
        if (!this.db) {
            throw new Error('RepositoryManager not initialized. Call initialize() first.')
        }

        if (!this.repositories.has(repositoryClass)) {
            this.repositories.set(repositoryClass, new repositoryClass(this.db))
        }

        return this.repositories.get(repositoryClass)
    }

    clear() {
        this.repositories.clear()
        this.unitOfWork = null
        this.db = null
    }
}

export const repositoryManager = new RepositoryManager()
