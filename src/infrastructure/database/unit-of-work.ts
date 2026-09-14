import { DatabaseAdapter, IUnitOfWork } from "@/domain";
import { getTransactionCoordinator, TransactionCoordinator } from "./transaction-coordinator";

/**
 * DatabaseAdapter üzerinden çalışan Unit of Work.
 *
 * Tek bir adapter (= tek SQLite bağlantısı) üzerinden yazan bütün repository'leri
 * ortak bir transaction sınırına alır.
 *
 * Sınırın kendisini `TransactionCoordinator` yönetir ve o koordinatör adapter
 * başına tekildir: repository'lerin `transactional()` helper'ı da aynı kuyruğu
 * kullanır. Eskiden ikisi ayrı kuyruklardı ve aynı bağlantı üzerinde
 * çakışıyorlardı (bkz. transaction-coordinator.ts).
 */
export class SqliteUnitOfWork implements IUnitOfWork {
    private readonly coordinator: TransactionCoordinator

    constructor(db: DatabaseAdapter) {
        this.coordinator = getTransactionCoordinator(db)
    }

    async run<T>(work: () => Promise<T>): Promise<T> {
        return this.coordinator.transaction(work)
    }

    /**
     * Çok sorgulu okuma. `run()`'dan farkı transaction AÇMAMASI.
     *
     * Eskiden bu da `transaction()` çağırıyordu: salt okuma için `BEGIN`
     * atılıyor, SQLite yazma kilidi tutuluyor ve bekleyen bütün yazmalar
     * okuma bitene kadar blokleniyordu. Üstelik sınır `active` işaretlediği
     * için, okuma sürerken gelen bağımsız SELECT'ler o transaction'ın içine
     * hapsoluyordu.
     *
     * `readGroup()` sınır açmadan aynı bölünmezliği veriyor: yazmalar kuyruğa
     * girip beklediği için grubun ortasına giremezler.
     */
    async read<T>(work: () => Promise<T>): Promise<T> {
        return this.coordinator.readGroup(work)
    }

    async runNested<T>(work: () => Promise<T>): Promise<T> {
        if (!this.coordinator.isActive) {
            throw new Error('runNested() requires an active unit-of-work transaction')
        }

        return work()
    }
}
