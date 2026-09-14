import { DatabaseAdapter } from "@/domain/interfaces/database-adapter";
import { logger } from "@/infrastructure/logging";

const CTX = 'transaction';

/**
 * Adapter (= tek SQLite bağlantısı) başına **tek** transaction sahibi.
 *
 * Eskiden iki ayrı kuyruk vardı: `SqliteUnitOfWork` kendi `queue`'sunu,
 * `BaseRepository.transactional()` ise adapter başına ayrı bir WeakMap kuyruğunu
 * kullanıyordu. İkisi birbirinden habersiz olduğu için aynı bağlantı üzerinde
 * çakışıyorlardı:
 *
 *  - Repo bir sınır açmışken UoW `beginTransaction()` çağırıyor ve adapter
 *    "A database transaction is already active" (sql.js: "cannot start a
 *    transaction within a transaction") ile patlıyordu. `isTransactionActive()`
 *    kontrolü ile `beginTransaction()` arasındaki `await` bu yarışa açıktı.
 *  - Tekil yazmalar (`save`, `saveMany`, `delete`, ...) hiçbir kuyruğa
 *    girmediği için başka bir sınırın **ortasına** düşebiliyordu.
 *
 * Burada tek kuyruk ve tek `active` bayrağı var; iki API onu farklı sözleşmeyle
 * kullanır:
 *
 *  - `transaction()` — dış sınır (UoW). Her zaman kuyruğa girer, asla mevcut
 *    bir sınıra katılmaz: bağımsız iki iş birbirinin rollback'ine yakalanmaz.
 *  - `join()` — repository sınırı. Açık sınır varsa ona katılır (UoW callback'i
 *    içinden çağrılan `repo.save()` bu yoldan gelir ve kuyruğa girse kendi
 *    kilidini bekleyip kilitlenirdi), yoksa kendi sınırını açar.
 *  - `serial()` — tek yazma statement'i. Sınır açmaz, yalnızca açık bir sınırın
 *    ortasına düşmemeyi garantiler.
 *  - `readGroup()` — çok sorgulu okuma. Sınır açmaz (okuma için `BEGIN` atmak
 *    yazma kilidini tutuyordu) ama kuyrukta tek birimdir: yazmalar araya
 *    giremez.
 *  - `read()` — tek okuma statement'i. `serial()` gibi, ek olarak açık bir
 *    okuma grubuna da katılır.
 *
 * Kalan sınır: `join()`/`serial()` açık bir sınır görünce ona katılmak
 * **zorundadır** (tarayıcıda `AsyncLocalStorage` yok, çağrının o sınırın
 * içinden mi yoksa bağımsız mı geldiği ayırt edilemez). Bu yüzden sınır
 * rollback ettiğinde katılan tarafın bıraktığı yerel durum da geri alınabilsin
 * diye `onRollback()` vardır; `BaseRepository` bununla optimistic locking
 * sürüm damgasını geri alır.
 */
export class TransactionCoordinator {
    private queue: Promise<unknown> = Promise.resolve();
    private active = false;
    /**
     * Açık bir okuma grubu (`readGroup`) var mı.
     *
     * `active`'ten ayrı: okuma grubu transaction AÇMAZ. Bayrak yalnızca
     * **okumalara** yeniden giriş izni verir; yazmalar (`serial`) onu görmez ve
     * kuyrukta beklemeye devam eder — grubun ortasına yazma girmesin diye.
     */
    private reading = false;
    private rollbackListeners: (() => void)[] = [];

    constructor(private readonly db: DatabaseAdapter) {}

    get isActive(): boolean {
        return this.active;
    }

    /** Bağımsız dış sınır. Mevcut sınıra katılmaz; sırasını bekler. */
    async transaction<R>(operation: () => Promise<R>): Promise<R> {
        return this.enqueue(() => this.runExclusive(operation));
    }

    /**
     * Independent backup snapshot. Always waits for earlier writers and never
     * borrows a transaction. Keep `active` false so repository writes cannot
     * join this read transaction; they must wait until the snapshot completes.
     * The callback must use the adapter directly, not re-enter the coordinator.
     */
    async snapshot<R>(operation: () => Promise<R>): Promise<R> {
        return this.enqueue(async () => {
            if (await this.hasForeignTransaction()) {
                throw new Error('Veritabanında devam eden bir işlem var. Yedeklemeyi tekrar deneyin.');
            }

            await this.db.beginTransaction();
            try {
                const result = await operation();
                await this.db.commitTransaction();
                return result;
            } catch (error) {
                try {
                    await this.db.rollbackTransaction();
                } catch (rollbackError) {
                    logger.error('Snapshot geri alınamadı', { context: CTX, error: rollbackError });
                }
                throw error;
            }
        });
    }

    /** Açık sınır varsa ona katılır, yoksa kendi sınırını açar. */
    async join<R>(operation: () => Promise<R>): Promise<R> {
        if (this.active) return operation();
        return this.enqueue(() => this.runExclusive(operation));
    }

    /**
     * Sınır açmaz; yalnızca açık bir sınırın ortasına düşmemeyi garantiler.
     *
     * DİKKAT: kuyruğa alınmış bir işin **içinden** çağrılırsa (sınır açık
     * değilken) kendi kilidini bekler ve kilitlenir. Repository'nin yazma
     * bloklarından yapılan dahili okumalar bu yüzden koordinatörü hiç
     * kullanmaz; bkz. `BaseRepository.rawQuery()`.
     */
    async serial<R>(operation: () => Promise<R>): Promise<R> {
        if (this.active) return operation();
        return this.enqueue(operation);
    }

    /**
     * Tek okuma statement'i.
     *
     * `serial()`'dan farkı açık bir okuma grubuna da katılabilmesi: grup
     * kuyruk slotunu tutarken yeniden kuyruğa girmek kendi kilidini beklemek
     * olurdu.
     */
    async read<R>(operation: () => Promise<R>): Promise<R> {
        if (this.active || this.reading) return operation();
        return this.enqueue(operation);
    }

    /**
     * Çok sorgulu okumayı tek kuyruk birimi olarak çalıştırır.
     *
     * Transaction AÇMAZ — okuma için `BEGIN` atmak SQLite yazma kilidini
     * tutuyor ve tüm yazmaları bekletiyordu. Grup yine de bölünmez: yazmalar
     * `serial()`/`transaction()` üzerinden kuyruğa girdiği ve `reading`
     * bayrağını görmediği için araya giremezler. `paginate()`'in "data + total
     * tek where'den" tutarlılığı bu sayede korunur.
     *
     * Yan fayda: grup `active` işaretlemediği için, sürerken gelen bağımsız
     * okumalar artık bir transaction'ın içine düşmüyor — eskiden `read()`
     * gerçek bir sınır açtığından yabancı SELECT'ler o sınıra hapsoluyordu.
     */
    async readGroup<R>(operation: () => Promise<R>): Promise<R> {
        if (this.active || this.reading) return operation();
        return this.enqueue(() => this.runGrouped(operation));
    }

    /** İç içe geçmez: `readGroup` yalnızca iki bayrak da kapalıyken kuyruğa girer. */
    private async runGrouped<R>(operation: () => Promise<R>): Promise<R> {
        this.reading = true;

        try {
            return await operation();
        } finally {
            this.reading = false;
        }
    }

    /**
     * Açık sınır rollback ederse çağrılır. Sınır yoksa (autocommit) kaydedilmez:
     * geri alınacak bir şey yoktur. Commit'te dinleyiciler sessizce atılır.
     */
    onRollback(listener: () => void): void {
        if (this.active) this.rollbackListeners.push(listener);
    }

    private enqueue<R>(operation: () => Promise<R>): Promise<R> {
        const result = this.queue.then(operation);

        // Kuyruk, işin hatasıyla kırılmasın: sıradaki iş yine de çalışsın.
        this.queue = result.catch(() => undefined);

        return result;
    }

    private async runExclusive<R>(operation: () => Promise<R>): Promise<R> {
        // Sırası geldiğinde bu koordinatörün sınırı kapalıdır. Yine de açık bir
        // transaction görülüyorsa sahibi dışarıdadır (ör. migration runner ya da
        // doğrudan `db.beginTransaction()`); sınırı o yönetir, buradan ikinci bir
        // BEGIN denenmez.
        if (await this.hasForeignTransaction()) {
            return this.runBorrowed(operation);
        }

        await this.db.beginTransaction();
        this.active = true;

        try {
            const result = await operation();
            await this.db.commitTransaction();
            this.rollbackListeners = [];
            return result;
        } catch (error) {
            // Rollback'in kendi hatası özgün hatayı gizlememeli: asıl sebep
            // operation()'dan gelen hata.
            try {
                await this.db.rollbackTransaction();
            } catch (rollbackError) {
                logger.error('Transaction geri alınamadı', { context: CTX, error: rollbackError });
            }

            this.notifyRollback();
            throw error;
        } finally {
            this.active = false;
        }
    }

    /**
     * Sahibi dışarıda olan bir sınırın içinde çalıştırır.
     *
     * `active` burada da işaretlenir: aksi hâlde `operation` içinden gelen
     * `serial()`/`join()` çağrıları kuyruğa girip **kendi kilidini** bekler ve
     * akış kilitlenir. Commit/rollback kararı sınırın sahibinde olduğu için
     * buradan verilmez; rollback dinleyicileri de tetiklenemez, atılır.
     */
    private async runBorrowed<R>(operation: () => Promise<R>): Promise<R> {
        this.active = true;

        try {
            return await operation();
        } finally {
            this.active = false;
            this.rollbackListeners = [];
        }
    }

    private notifyRollback(): void {
        const listeners = this.rollbackListeners;
        this.rollbackListeners = [];

        for (const listener of listeners) {
            // Bir dinleyicinin hatası diğerlerini ve asıl hatayı gölgelemesin.
            try {
                listener();
            } catch { /* yutulur */ }
        }
    }

    private async hasForeignTransaction(): Promise<boolean> {
        return (await this.db.isTransactionActive?.());
    }
}

const coordinators = new WeakMap<DatabaseAdapter, TransactionCoordinator>();

/** Adapter başına tekil koordinatör. */
export function getTransactionCoordinator(db: DatabaseAdapter): TransactionCoordinator {
    let coordinator = coordinators.get(db);

    if (!coordinator) {
        coordinator = new TransactionCoordinator(db);
        coordinators.set(db, coordinator);
    }

    return coordinator;
}
