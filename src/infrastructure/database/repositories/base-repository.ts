import { DatabaseAdapter } from "@/domain/interfaces/database-adapter";
import { BaseEntity } from "@/domain/entities/base-entity";
import { EntityNotFoundException } from "@/domain/exceptions/domain.exception";
import { PageResult } from "@/domain/interfaces/repository.interface";
import { Cast, parseDate } from "./casts";
import { toCamelCase, toSnakeCase } from "@/shared/utils";
import {
    getTransactionCoordinator,
    TransactionCoordinator,
} from "@/infrastructure/database/transaction-coordinator";

export type SortDirection = 'ASC' | 'DESC';

export interface OrderByClause {
    column: string;
    /** Zorunlu: örtük varsayılan, çağıranın beklediğinin tersi sırayı üretebiliyordu. */
    direction: SortDirection;
}

interface RangeOptions {
    limit?: number;
    offset?: number;
}

/**
 * Sıralama. Tek kolon verildiğinde `direction` zorunlu — eskiden örtük 'DESC'
 * uygulanıyordu ve `orderBy: 'name'` diyen çağıran sessizce Z→A alıyordu.
 */
export type OrderOptions =
    | { orderBy: string; direction: SortDirection }
    | { orderBy: OrderByClause[]; direction?: never };

/**
 * Sırasız biçim. `orderBy`/`direction` açıkça `never`: aksi hâlde TS'in
 * "weak type" kuralı `{ orderBy: 'name' }` gibi yönü eksik bir objeyi (object
 * literal olmadığı sürece) bu dala uyduruyor ve hata runtime'a kalıyordu.
 */
type UnorderedOptions = RangeOptions & { orderBy?: never; direction?: never };

export type FindOptions = UnorderedOptions | (RangeOptions & OrderOptions);

/** `paginate` sıralamayı zorunlu tutar: sırasız OFFSET sayfaları kayıt tekrarlar/atlar. */
export type PageOptions = OrderOptions & { limit: number; offset?: number };

/** Sıralama/limit okumak için birleşimi düzleştiren dahili görünüm. */
type ResolvedOptions = RangeOptions & {
    orderBy?: string | OrderByClause[];
    direction?: SortDirection;
};

/**
 * Money kolonunun para birimi bağlamı. Düz string verildiğinde `currencyColumn`
 * ve `minorUnitColumn` varsayılanlara düşer; `to_amount` gibi ikinci bir para
 * bacağı taşıyan kolonlar kendi kolonlarını bildirmeli — aksi hâlde guard
 * yanlış kolonu kontrol eder.
 */
export interface CurrencyScopedColumn {
    column: string;
    currencyColumn?: string;
    minorUnitColumn?: string;
}

/** SQL parçası ve ona ait parametreler; ikisi hiçbir zaman ayrı taşınmaz. */
interface Condition {
    sql: string;
    params: any[];
    /**
     * Koşul tablodaki **her** satırı kapsıyor mu — yani filtreyi hiç
     * daraltmıyor mu.
     *
     * Metinden çıkarılamaz: `1 = 1` kadar `"id" IS NOT NULL` de (kolon NOT NULL
     * ya da PK olduğunda) bütün tabloyu kapsar ama `deleteMany`'nin string
     * karşılaştırmasına takılmıyordu ve `deleteMany({ id: { isNull: false } })`
     * "seçici koşul" sayılıp tabloyu boşaltıyordu. Bu yüzden bayrak koşul
     * üretilirken konur.
     */
    coversAllRows?: boolean;
}

/** Hazırlanmış yazma: seçilen dal ve guard'ı da statement'la taşınır. */
interface WriteStatement {
    sql: string;
    params: any[];
    /**
     * `update`: satırın var olduğu biliniyor, düz UPDATE yazıldı — 0 satır **her
     * zaman** hatadır (satır silinmiş ya da sürüm eskimiş).
     * `upsert`: satır yeni olabilir, `INSERT ... ON CONFLICT` yazıldı.
     */
    mode: 'update' | 'upsert';
    /** Sürüm koşulu var mı — `upsert` dalında 0 satır ancak o zaman hatadır. */
    guarded: boolean;
    /** Bu yazmanın `updated_at` kolonuna koyduğu değer. */
    writtenVersion?: string;
}

export type { PageResult };

/** Sessizce kırpmak yerine hata verilen üst sınırlar. */
const MAX_LIMIT = 1000;
const MAX_PAGE_SIZE = 100;
/** SQLite'ın eski derlemelerindeki SQLITE_MAX_VARIABLE_NUMBER varsayılanı. */
const MAX_SQL_PARAMS = 999;

/**
 * AND zincirinde etkisiz olan, tek başına kaldığında "bütün tablo" anlamına gelen
 * koşul. `deleteMany` bunu koşul saymaz: aksi hâlde `notIn: []` guard'ı geçip
 * tabloyu boşaltıyordu. Aynı anlama gelen başka koşullar da var (bkz.
 * `Condition.coversAllRows`); ayırt etme işi metne değil o bayrağa bakar.
 */
const ALWAYS_TRUE = '1 = 1';
const ALWAYS_FALSE = '1 = 0';

const DEFAULT_CURRENCY_COLUMN = 'currency_id';
const DEFAULT_MINOR_UNIT_COLUMN = 'minor_unit';

/**
 * `minor_unit` NULL olan satırın örtük ölçeği. `MoneyCast` NULL'ı bu değer sayıp
 * okuduğu için (`row[minorUnitCol] ?? 2`) toplama guard'ı da aynı varsayımı
 * yapmalı: `COUNT(DISTINCT ...)` NULL'ları hiç saymadığından NULL + 0 karışımı
 * tek ölçek gibi görünüyor ve farklı ölçekli tutarlar sessizce toplanıyordu.
 */
const IMPLIED_MINOR_UNIT = 2;

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;
const MAX_IDENTIFIER_LENGTH = 64;

/** DDL'de tarih olarak bildirilen kolon tipleri (SQLite tip adını serbest bırakır). */
const DATE_COLUMN_TYPES = new Set(['DATE', 'DATETIME', 'TIMESTAMP']);

const NO_COLUMNS: ReadonlySet<string> = new Set<string>();

/**
 * Entity'nin **okunduğu andaki** `updated_at` değeri. Optimistic locking'in
 * karşılaştırma tarafı: yazarken guard, DB'deki satırın hâlâ bu sürümde
 * olmasını şart koşar.
 *
 * Entity örneğine bağlıdır, repository örneğine değil: uygulama her çağrıda
 * `new XRepository(db)` kurabiliyor ve sürüm bilgisi bununla kaybolmamalı.
 */
const loadedVersions = new WeakMap<BaseEntity, string>();

/**
 * Bu entity örneğinin DB'de bir satırı olduğu **biliniyor** mu: okunmuşsa ya da
 * bu süreçte bir kez yazılmışsa evet.
 *
 * `save()`'in düz UPDATE mi UPSERT mi üreteceğini bu belirler. Eskiden ayrım
 * yoktu, her yazma `INSERT ... ON CONFLICT DO UPDATE` idi: okunmuş bir entity'nin
 * satırı bu arada silinmişse (başka sekme, senkron, kullanıcı silmesi) yazma
 * "kayıt yok" diye patlamak yerine satırı bakiyesiyle birlikte **geri
 * diriltiyordu**.
 *
 * `loadedVersions`'tan ayrı tutulur: o yalnızca `updated_at` kolonu olan
 * tablolarda dolar, satırın varlığı ise o kolondan bağımsız bir gerçek.
 */
const persistedEntities = new WeakSet<BaseEntity>();

/** Convention-based otomatik mapping için tarih sezgisi: `...At`, `date`, `...Date`. */
function isDateKey(key: string): boolean {
    return key.endsWith('At') || key === 'date' || key.endsWith('Date');
}

/** LIKE deseninde `%`, `_` ve `\` karakterlerini literal hâle getirir. */
function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, ch => `\\${ch}`);
}

function isPlainObject(value: unknown): boolean {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

export abstract class BaseRepository<T extends BaseEntity> {
    /**
     * Tablo adı. Zorunlu: `constructor.name`'den türetmek minify edilmiş
     * production build'inde bozulduğu için türetme mantığı kaldırıldı.
     */
    protected abstract readonly table: string;

    /** Hata mesajlarında görünen varlık adı. Verilmezse tablo adı kullanılır. */
    protected readonly entityLabel?: string;

    /**
     * Tabloda `created_at` / `updated_at` kolonu var mı.
     *
     * Dikkat: bu ayar zaman damgası **üretmez**, yalnızca kolonun yazılıp
     * yazılmayacağını belirler. Değerler her zaman entity'den gelir; ilerletmek
     * domain'in işidir (`BaseEntity.touch()`).
     */
    protected readonly timestamps: boolean | { createdAt?: boolean; updatedAt?: boolean } = true;

    /**
     * `ON CONFLICT(...)` hedefi. Varsayılan tekil primary key.
     * Kompozit unique key'i olan tablolar bunu override etmeli; aksi hâlde
     * `save()` çakışmayı yakalayamaz ve mükerrer satır yazar.
     *
     * SQLite tek bir çakışma hedefi kabul eder: tabloda ikinci bir UNIQUE kısıt
     * varsa (ör. `categories(name, type)`) onun ihlali UPSERT'e dönüşmez.
     * O durumda ham SQLite hatası yerine ne yapılması gerektiğini söyleyen bir
     * mesaj üretilir (bkz. `describeWriteError`).
     */
    protected readonly conflictTarget: readonly string[] = ['id'];

    /**
     * Entity dışında yönetilen kolonlar (trigger, migration, başka bir servis).
     * Yazma yolundaki "eksik kolon" kontrolü bunları muaf tutar.
     * snake_case yazılmalı; `toSnakeCase` ile normalize edilir.
     */
    protected readonly externalColumns: readonly string[] = [];

    /**
     * Default `toDomain` için entity factory referansı.
     * Atanırsa base, row'u `buildPropsFromRow`'dan geçirip
     * `entityClass.reconstitute(props)` çağırır.
     * VO içeren / karmaşık entity'ler için `toDomain` override edilir.
     */
    protected readonly entityClass?: { reconstitute(props: Record<string, any>): T };

    /**
     * Laravel-style attribute casts. Property bazında DB ↔ entity dönüşümü.
     * Property adı bakımından convention'ı override eder: bir property burada
     * listeliyse convention pass onu yazmaz, cast'in `get`/`set` çıktısı kullanılır.
     *
     * Ör:
     *   casts = {
     *     balance:  MoneyCast('balance', 'currency_id'),
     *     icon:     IconCast('icon', 'color'),
     *     isActive: BooleanCast('is_active'),
     *   }
     */
    protected readonly casts?: Record<string, Cast<any>>;

    /**
     * Tabloda kolon karşılığı olmayan entity alanları (junction koleksiyonları).
     * Convention pass bunları atlar. Ör. BudgetRepository: ['categoryIds', 'dailySpent'].
     */
    protected readonly transientFields: readonly string[] = [];

    /**
     * Money cast'li kolonlar. `sum`/`sumGroupBy` bu kolonlarda currency filtresi
     * ya da gruplaması olmadan çağrılırsa hata verir — farklı para birimlerini
     * toplayıp anlamsız bir sayı üretmeyi engeller.
     *
     * Kolon adları `toSnakeCase` ile normalize edilir: camelCase yazılan bir
     * girdi eskiden hiçbir şeyle eşleşmiyor ve guard'ı sessizce kapatıyordu.
     */
    protected readonly currencyScopedColumns: readonly (string | CurrencyScopedColumn)[] = [];
    protected readonly currencyColumn: string = DEFAULT_CURRENCY_COLUMN;

    /** `PRAGMA table_info` sonucu; ilk **başarılı** okumada doldurulur. */
    private tableColumnCache?: ReadonlySet<string>;
    /** Kolon adı → DDL'de bildirilen tip (büyük harf). */
    private columnTypeCache: ReadonlyMap<string, string> = new Map();
    /** Şemaya göre her satırda dolu olan kolonlar (NOT NULL ya da PK). */
    private notNullColumnCache: ReadonlySet<string> = new Set();
    /** PRAGMA'nın hiç desteklenmediği platformlarda tekrar tekrar denememek için. */
    private pragmaUnsupported = false;
    /** `casts`'in dokunduğu kolonların birleşimi. */
    private castColumnCache?: ReadonlySet<string>;
    /** Devam eden PRAGMA okuması; eşzamanlı çağrılar aynı sonucu paylaşır. */
    private schemaLoad?: Promise<ReadonlySet<string>>;

    /**
     * Adapter başına tekil transaction sahibi. `SqliteUnitOfWork` de aynı
     * örneği kullanır: iki ayrı kuyruk aynı bağlantıda çakışıyordu.
     */
    private readonly coordinator: TransactionCoordinator;

    constructor(protected db: DatabaseAdapter) {
        this.coordinator = getTransactionCoordinator(db);
    }

    protected get tableName(): string {
        if (!IDENTIFIER_PATTERN.test(this.table)) {
            throw new Error(`Geçersiz tablo adı: '${this.table}'`);
        }
        return this.table;
    }

    protected get entityName(): string {
        return this.entityLabel ?? this.table;
    }

    // ========== Mapping ==========

    /**
     * DB row → entity props. Önce convention (snake_case → camelCase,
     * tarih kolonları → Date, null → atla), sonra casts uygulanır. Junction veya
     * ek alanları olan repo'lar bu helper'ı çağırıp dönüşüne prop ekleyebilir.
     *
     * Cast'in sahip olduğu kolonlarda convention tarih dönüşümü **çalıştırılmaz**:
     * sıra convention → cast olduğu için, cast'in ele alacağı bir değeri
     * convention'ın `parseDate`'i cast devreye girmeden fırlatabiliyordu.
     * Ham değer yine props'a girer — `Budget.currencyId` gibi bazı entity'ler
     * cast kolonunu ayrıca prop olarak bekliyor.
     */
    protected buildPropsFromRow(row: Record<string, any>): Record<string, any> {
        const props: Record<string, any> = {};
        const castOwned = this.castColumns();

        // 1) Convention pass
        for (const [col, val] of Object.entries(row)) {
            const key = toCamelCase(col);
            if (val === null) continue; // TS optional alanlarla uyum: null → undefined

            props[key] = !castOwned.has(col) && this.isDateColumn(col, key) && typeof val === 'string'
                ? parseDate(val, col)
                : val;
        }

        // 2) Casts override
        if (this.casts) {
            for (const [key, cast] of Object.entries(this.casts)) {
                props[key] = cast.get(row);
            }
        }

        this.resolveTimestamps(props, row);

        return props;
    }

    /**
     * NULL timestamp'i diğer damgadan tamamlar.
     *
     * Eksik değeri sessizce geçmek olmaz: `BaseEntity` default'u "şimdi"dir ve
     * ilk `save()`'de DB'ye yazılıp gerçek tarihin üzerine biner. Ama koşulsuz
     * patlamak da yanlıştı: yazma tarafı (`staleWriteGuard`) DB'deki NULL
     * `updated_at`'i açıkça tolere ediyor, dolayısıyla repo dışı bir INSERT ya da
     * migration'ın bıraktığı satır **yazılabilir ama hiç okunamaz** hâle
     * geliyordu — üstelik tek böyle satır, onu kapsayan her `findAll`/`paginate`
     * çağrısını da düşürüyordu.
     *
     * İki damga da eksikse uydurulacak bir değer yok; orada hata verilir.
     */
    private resolveTimestamps(props: Record<string, any>, row: Record<string, any>): void {
        const needsCreated = this.hasCreatedAt && props.createdAt === undefined;
        const needsUpdated = this.hasUpdatedAt && props.updatedAt === undefined;

        if (!needsCreated && !needsUpdated) return;

        const fallback = props.createdAt ?? props.updatedAt;
        if (fallback === undefined) {
            const missing = [
                this.hasCreatedAt ? 'created_at' : undefined,
                this.hasUpdatedAt ? 'updated_at' : undefined,
            ].filter(Boolean).join("', '");

            throw new Error(
                `${this.entityName} ('${row['id'] ?? '?'}'): '${missing}' kolonlarının hepsi NULL/eksik; ` +
                `kaydın zaman damgası hiçbir kolondan türetilemiyor.`
            );
        }

        if (needsCreated) props.createdAt = fallback;
        if (needsUpdated) props.updatedAt = fallback;
    }

    /**
     * Kolon tarih taşıyor mu?
     *
     * Önce DDL'de bildirilen tipe bakılır (`TIMESTAMP`/`DATETIME`/`DATE`), sonra
     * ada. Yalnız ada bakmak fail-open bir sezgiydi: `period_start` gibi kolonlar
     * yakalanmıyor ve entity'ye Date yerine string gidiyordu — hiçbir yerde de
     * patlamıyordu. Şema okunamayan platformlarda ad sezgisine düşülür.
     */
    private isDateColumn(column: string, camelKey: string): boolean {
        const declared = this.columnTypeCache.get(column);
        if (declared && DATE_COLUMN_TYPES.has(declared)) return true;
        return isDateKey(camelKey);
    }

    /** `casts`'in okuduğu/yazdığı bütün kolonlar. */
    private castColumns(): ReadonlySet<string> {
        if (!this.castColumnCache) {
            const columns = new Set<string>();
            for (const cast of Object.values(this.casts ?? {})) {
                for (const column of cast.columns) columns.add(column);
            }
            this.castColumnCache = columns;
        }
        return this.castColumnCache;
    }

    /**
     * DB row → Entity (default).
     * VO/junction içeren entity'ler için override et.
     */
    protected toDomain(row: Record<string, any>): T {
        if (!this.entityClass) {
            throw new Error(
                `${this.entityName}: 'entityClass' tanımla ya da toDomain'i override et.`
            );
        }
        return this.entityClass.reconstitute(this.buildPropsFromRow(row));
    }

    /**
     * Row listesi → Entity listesi. **Bütün** okuma metotları buradan geçer.
     *
     * Override edilmez — dönüşümü değiştirmek için `hydrateRows` (ilişki
     * yükleyen repo'lar) ya da `toDomain` (tek satır) kullanılır. Buranın tek
     * çıkış noktası olması şart: okunan `updated_at` optimistic locking için
     * burada kaydediliyor ve override eden bir repo bunu sessizce atlarsa
     * `save()` lost update'e karşı korumasız kalırdı.
     */
    protected async hydrate(rows: Record<string, any>[]): Promise<T[]> {
        if (rows.length === 0) return [];

        const entities = await this.hydrateRows(rows);

        // Satırın varlığı `updated_at`'ten bağımsız: damgası olmayan tabloda da
        // okunan entity'nin bir satırı vardır ve `save()` onu UPDATE etmeli.
        entities.forEach(entity => persistedEntities.add(entity));

        if (this.hasUpdatedAt) {
            entities.forEach((entity, index) => {
                const version = rows[index]?.['updated_at'];
                if (typeof version === 'string') {
                    loadedVersions.set(entity, version);
                }
            });
        }

        return entities;
    }

    /**
     * Row listesi → Entity listesi (override noktası). Dönen dizi giriş
     * row'larıyla **aynı sırada** olmalı: `hydrate` sürüm damgasını indeksle
     * eşliyor.
     *
     * Junction/relation yükleyen repo'lar `toDomain` yerine bunu override eder:
     * asenkron olduğu için ilişkileri tek sorguda (N+1'siz) yükleyebilir, ve
     * override edildiğinde `find`/`findOne`/`findById`/`paginate` hepsi birden
     * doğru hydrate olur. Eskiden `toDomain` senkron tek çıkış noktası olduğu
     * için relation'lı repo'lar her metodu ayrı ayrı override etmek zorundaydı;
     * unutulan metot sessizce yarım entity döndürüyordu.
     */
    protected async hydrateRows(rows: Record<string, any>[]): Promise<T[]> {
        // Tarih kolonu tespiti şemadan besleniyor: ham SQL ile gelen row'larda da
        // yüklü olsun diye burada garantiye alınır.
        await this.loadTableColumns();
        return rows.map(row => this.toDomain(row));
    }

    /**
     * Entity → DB row (default).
     * Convention: `_propName` private alanları → snake_case kolonlar
     * (Date → ISO, boolean → 0/1, undefined → null).
     * `casts` ve `transientFields`'ta geçen property'ler convention pass'te hiç
     * işlenmez; cast'ler kendi kolonlarını yazar.
     */
    protected toPersistence(entity: T): Record<string, any> {
        const row: Record<string, any> = {};
        /** kolon → o kolona ilk yazan kaynak (hata mesajı için). */
        const writers = new Map<string, string>();
        const skip = new Set<string>([
            ...this.transientFields,
            ...(this.casts ? Object.keys(this.casts) : []),
        ]);

        // Aynı kolona iki kaynak yazabilir (ör. `Budget._currencyId` ile
        // `MoneyCast('amount', 'currency_id')`). Değerler aynıysa sorun yok;
        // farklıysa `Object.assign` sırası kazanıyor ve kaybeden değer sessizce
        // yok oluyordu — tek satırlık bir kolona iki farklı gerçek yazılamaz.
        const put = (column: string, value: any, source: string): void => {
            const previous = writers.get(column);
            if (previous !== undefined && !Object.is(row[column], value)) {
                throw new Error(
                    `${this.entityName}: '${column}' kolonuna ${previous} ve ${source} farklı değer ` +
                    `yazıyor (${JSON.stringify(row[column])} ≠ ${JSON.stringify(value)}). ` +
                    `Kolonu tek kaynaktan üret.`
                );
            }
            row[column] = value;
            if (previous === undefined) writers.set(column, source);
        };

        // 1) Convention pass
        for (const [field, val] of Object.entries(entity as any)) {
            if (!field.startsWith('_')) {
                // Sessizce atlamak veri kaybıydı: cast tarafı yazım hatasında
                // patlarken convention tarafı alanı hiç yazmadan geçiyordu.
                if (skip.has(field)) continue;
                throw new Error(
                    `${this.entityName}: '${field}' alanı '_' ile başlamıyor, bu yüzden hiçbir kolona ` +
                    `yazılmaz. Private alana çevir, 'casts'e ekle ya da 'transientFields'a koy.`
                );
            }
            const propName = field.slice(1);
            if (skip.has(propName)) continue;
            put(toSnakeCase(propName), this.serializeValue(val, propName), `alan '${field}'`);
        }

        // 2) Cast pass
        if (this.casts) {
            for (const [key, cast] of Object.entries(this.casts)) {
                const priv = `_${key}`;
                const hasPrivate = priv in (entity as any);

                if (!hasPrivate && !(key in (entity as any))) {
                    throw new Error(
                        `${this.entityName}: cast key '${key}' entity üzerinde bulunamadı (yazım hatası?).`
                    );
                }

                // `??` kullanılırsa private alan null olduğunda sessizce public
                // getter'a düşülür; iki farklı kaynak karışmasın diye açık seçim.
                const value = hasPrivate ? (entity as any)[priv] : (entity as any)[key];

                for (const [column, columnValue] of Object.entries(cast.set(value))) {
                    put(column, this.serializeValue(columnValue, column), `cast '${key}'`);
                }
            }
        }

        // 3) Timestamp kapalıysa convention'ın ürettiği kolonu sil
        // (BaseEntity her zaman _createdAt/_updatedAt taşır; tabloda kolon olmayabilir)
        if (!this.hasCreatedAt) delete row['created_at'];
        if (!this.hasUpdatedAt) delete row['updated_at'];

        return row;
    }

    /**
     * JS değeri → SQL'e bind edilebilir değer. Hem yazma yolu (`toPersistence`)
     * hem where parametreleri buradan geçer; iki ayrı kopya olduğunda
     * davranışları (özellikle Date normalizasyonu) ayrışmaya açıktı.
     */
    protected serializeValue(v: any, field = ''): any {
        if (v === undefined || v === null) return null;
        if (v instanceof Date) return parseDate(v, field || 'date').toISOString();
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (typeof v === 'object') {
            const kind = (v as any)?.constructor?.name ?? 'object';
            throw new Error(
                `${this.entityName}: '${field}' alanı nesne (${kind}) — SQL'e bind edilemez. ` +
                `casts'e ekle ya da transientFields'a koy.`
            );
        }
        return v;
    }

    // ========== Read ==========

    async findById(id: string): Promise<T | null> {
        // `exists()` ile aynı davranış: boş id için sorgu atmaya değmez.
        if (!id) return null;

        const rows = await this.selectRows(
            `SELECT * FROM ${q(this.tableName)} WHERE ${q('id')} = ?`, [id]
        );
        const [entity] = await this.hydrate(rows);
        return entity ?? null;
    }

    async findByIdOrFail(id: string): Promise<T> {
        const entity = await this.findById(id);
        if (!entity) {
            throw new EntityNotFoundException(this.entityName, id);
        }
        return entity;
    }

    async findAll(options?: FindOptions): Promise<T[]> {
        return this.find({}, options);
    }

    async find(where: Record<string, any>, options?: FindOptions): Promise<T[]> {
        return this.hydrate(await this.findRows(where, options));
    }

    /**
     * Tek kayıt. Sıralama verilmezse `id` üzerinden deterministik tie-break
     * uygulanır (bkz. `buildOrderLimitClause`): birden fazla satır eşleştiğinde
     * hangisinin döneceği eskiden SQLite'ın plan seçimine kalıyordu ve tabloya
     * index eklendiğinde sessizce değişiyordu.
     */
    async findOne(where: Record<string, any>, options?: FindOptions): Promise<T | null> {
        const results = await this.find(where, { ...(options as ResolvedOptions), limit: 1 } as FindOptions);
        return results.length > 0 ? results[0] : null;
    }

    async findOneOrFail(where: Record<string, any>, options?: FindOptions): Promise<T> {
        const entity = await this.findOne(where, options);
        if (!entity) {
            throw new EntityNotFoundException(this.entityName, where);
        }
        return entity;
    }

    /**
     * Where + ordering uygula, ham row'ları döndür (hydrate çağırmaz).
     * Projeksiyon/JOIN gerektiren özel sorgular için.
     */
    protected async findRows(where?: Record<string, any>, options?: FindOptions): Promise<any[]> {
        await this.loadTableColumns();

        const { clause, params } = this.composeWhere(where ?? {});

        return this.selectRows(
            `SELECT * FROM ${q(this.tableName)}${clause}${this.buildOrderLimitClause(options)}`,
            params
        );
    }

    /**
     * Sayfa ve toplam **tek where objesinden** üretilir; ikisinin ayrı çağrılarla
     * alınıp filtrelerinin zamanla ayrışması riski kalmaz.
     *
     * Atomik değildir: `data` ve `total` iki ayrı sorgudur. Aralarına giren bir
     * yazma ikisini tutarsız bırakabilir — tutarlılık gerekiyorsa çağrıyı
     * `SqliteUnitOfWork.read()` içine al.
     *
     * Offset tabanlı: uygulamadaki listeler sonsuz kaydırma kullanıyor. Bu yüzden
     * `orderBy` zorunludur; sırasız bir sorguda OFFSET sayfa sınırları arasında
     * kayıt tekrarlar ya da atlar.
     */
    async paginate(
        where: Record<string, any> = {},
        options: PageOptions
    ): Promise<PageResult<T>> {
        const { limit } = options;
        const offset = options.offset ?? 0;
        const orderBy = (options as ResolvedOptions).orderBy;

        if (limit > MAX_PAGE_SIZE) {
            throw new Error(`limit ${limit} sayfa üst sınırını (${MAX_PAGE_SIZE}) aşıyor.`);
        }

        if (!orderBy || (Array.isArray(orderBy) && orderBy.length === 0)) {
            throw new Error(
                'paginate() sıralama gerektirir: sırasız OFFSET sayfaları kayıt tekrarlar/atlar.'
            );
        }

        // Sıralı çalıştırılır: tek SQLite bağlantısı üzerinde, hele bir dış
        // transaction açıkken paralel sorguların araya girme sırası garanti değil.
        // (limit/offset doğrulaması buildOrderLimitClause içinde yapılır.)
        const data = await this.find(where, { ...options, offset } as FindOptions);

        // Sayfa dolmadıysa arkasında kayıt yok demektir; toplam buradan kesin
        // olarak bilinir ve her sayfada tam tablo taraması yapan COUNT'a gerek kalmaz.
        const total = data.length > 0 && data.length < limit
            ? offset + data.length
            : await this.count(where);

        return {
            data,
            total,
            limit,
            offset,
            hasNext: offset + data.length < total,
        };
    }

    async exists(id: string): Promise<boolean> {
        if (!id) return false;

        const rows = await this.selectRows(
            `SELECT 1 FROM ${q(this.tableName)} WHERE ${q('id')} = ? LIMIT 1`, [id]
        );
        return rows.length > 0;
    }

    async count(where?: Record<string, any>): Promise<number> {
        await this.loadTableColumns();

        const { clause, params } = this.composeWhere(where ?? {});

        const rows = await this.selectRows(
            `SELECT COUNT(*) AS total_rows FROM ${q(this.tableName)}${clause}`, params
        );
        return Number(rows[0]?.total_rows ?? 0);
    }

    /**
     * Ham kolon toplamı — cast uygulanmaz, `Money` değil `number` döner.
     * Money kolonları için repo'da `currencyScopedColumns` tanımla.
     */
    async sum(column: string, where?: Record<string, any>): Promise<number> {
        const columns = await this.loadTableColumns();

        const col = this.validateIdentifier(column, 'invalid column for sum');
        const scope = this.assertCurrencyScoped(col, where);

        const { clause, params } = this.composeWhere(where ?? {});
        const minorUnitCol = this.minorUnitGuardColumn(scope, columns);

        const rows = await this.selectRows(
            `SELECT SUM(${q(col)}) AS total${this.minorUnitVariantSelect(minorUnitCol)} ` +
            `FROM ${q(this.tableName)}${clause}`,
            params
        );

        this.assertUniformMinorUnit(rows[0], col, minorUnitCol);
        return Number(rows[0]?.total ?? 0);
    }

    async sumGroupBy<K extends string>(
        column: string,
        groupBy: string,
        where?: Record<string, any>
    ): Promise<Map<K, number>> {
        const columns = await this.loadTableColumns();

        const sumCol = this.validateIdentifier(column, 'invalid column for sum');
        const groupCol = this.validateIdentifier(groupBy, 'invalid group by column');
        const scope = this.assertCurrencyScoped(sumCol, where, groupCol);

        const { clause, params } = this.composeWhere(where ?? {});
        const minorUnitCol = this.minorUnitGuardColumn(scope, columns);

        // `AS group_key`: grup kolonu tırnaklandığında/ifade olduğunda sonuç
        // anahtarının adı sürücüye göre değişmesin.
        const rows = await this.selectRows(
            `SELECT ${q(groupCol)} AS group_key, SUM(${q(sumCol)}) AS total` +
            `${this.minorUnitVariantSelect(minorUnitCol)} ` +
            `FROM ${q(this.tableName)}${clause} GROUP BY ${q(groupCol)}`,
            params
        );

        const map = new Map<K, number>();
        for (const row of rows) {
            // NULL grup anahtarı `Map<K, number>` tipini yalanlar ve çağıran
            // tarafta sessizce kaybolur; anlamlı bir grup değil, veri hatasıdır.
            if (row.group_key === null || row.group_key === undefined) {
                throw new Error(
                    `${this.entityName}: '${groupCol}' kolonunda NULL değer var; ` +
                    `gruplama anahtarı olarak kullanılamaz.`
                );
            }
            this.assertUniformMinorUnit(row, sumCol, minorUnitCol);
            map.set(row.group_key as K, Number(row.total ?? 0));
        }
        return map;
    }

    // ========== Write ==========

    /**
     * Tek statement'lık yazma: öncesinde `exists()` sorgusu atmaz (TOCTOU yok),
     * sonrasında satırı geri okumaz.
     *
     * Dal, entity'nin DB'de satırı olduğunun bilinip bilinmemesine göre seçilir
     * (bkz. `persistedEntities`): okunmuş entity düz **UPDATE**, yeni entity
     * `INSERT ... ON CONFLICT` alır. Her yazmayı UPSERT yazmak, satırı silinmiş
     * bir entity'yi sessizce geri diriltiyordu.
     *
     * `created_at` / `updated_at` **entity'den** gelir; böylece DB ile bellekteki
     * entity her zaman aynı değeri taşır. Zaman damgasını ilerletmek domain'in
     * işidir (`BaseEntity.touch()`).
     */
    async save(entity: T): Promise<void> {
        await this.write(entity);
    }

    /**
     * Çok kayıtlı yazma: tek `executeBatch` ile, kayıt başına ayrı round-trip
     * atmadan. Statement'lar önceden hazırlandığı için doğrulama hataları
     * hiçbir satır yazılmadan önce yükselir.
     *
     * Yalnızca ana tabloyu yazar. `save()`'i junction senkronizasyonu için
     * override eden repo'lar bunu da override etmeli (bkz. BudgetRepository).
     *
     * Eskimiş sürüm tespiti `upsert()`'teki gibi `rowsAffected` ile yapılamaz:
     * `executeBatch` statement başına etkilenen satır sayısı döndürmüyor. Guard
     * SQL'de yine uygulandığı için eski sürüm yeniyi **ezmiyordu**, ama atlanan
     * yazma da hiç duyulmuyordu: `saveMany` başarıyla dönüyor, satır
     * yazılmamış oluyordu — sınıfın kaçınmaya çalıştığı sessiz veri kaybının
     * kendisi. Bu yüzden guard'ın koşulu batch'ten **önce** ayrıca sınanır
     * (bkz. `assertBatchWritable`).
     *
     * Sınır `serialize()` yerine `transactional()` ile açılır: doğrulama ile
     * yazma arasına başka bir yazma girmesin, doğrulama patladığında da batch'in
     * hiçbir satırı kalmasın.
     */
    async saveMany(entities: T[]): Promise<void> {
        if (entities.length === 0) return;

        // Kuyruğa **metodun girişinde** girilir, hazırlık `await`'lerinden sonra
        // değil: aradaki her `await` başka bir transaction'ın açılmasına yer
        // bırakıyor ve yazma o sınırın ortasına düşüyordu. `transactional()`
        // çağrısı senkron olduğu için sıra, çağrı anındaki duruma göre belirlenir.
        await this.transactional(async () => {
            // Şema bir kez okunur: her `prepareRow` kendi başına
            // `loadTableColumns()` çağırıyordu ve tablo henüz yaratılmamışken
            // (boş sonuç cache'lenmiyor) bu, kayıt başına bir PRAGMA
            // round-trip'i demekti.
            const columns = await this.loadTableColumns();

            const statements: WriteStatement[] = [];
            for (const entity of entities) {
                statements.push(await this.buildWriteStatement(entity, columns));
            }

            // Yazmadan **önce**: batch uygulandıktan sonra bakmak yetmiyor,
            // araya giren yazma tesadüfen aynı damgayı bırakmışsa atlanan
            // statement fark edilemiyordu.
            await this.assertBatchWritable(entities, statements);

            try {
                await this.db.executeBatch(statements.map(({ sql, params }) => ({ sql, params })));
            } catch (error) {
                throw this.describeWriteError(error);
            }

            entities.forEach((entity, index) => this.rememberVersion(entity, statements[index]));
        });
    }

    /**
     * Statement'ların gerçekten yazacağını batch'ten önce doğrular.
     *
     * `staleWriteGuard`'ın SQL'de kurduğu koşul burada JS tarafında sınanır:
     * `executeBatch` statement başına etkilenen satır sayısı döndürmediği için
     * koşulun tutup tutmadığı yazma sonrasında öğrenilemiyor. Aynı transaction
     * içinde çalıştığı için okuma ile yazma arasına başka bir yazma giremez.
     *
     * UPDATE dalındaki statement'lar guard'sız olsa bile buraya girer: satırın
     * var olduğunu varsayıyorlar ve satır silinmişse hiçbir şey yazmadan sessizce
     * geçerlerdi.
     */
    private async assertBatchWritable(entities: T[], statements: WriteStatement[]): Promise<void> {
        const guarded = entities
            .map((entity, index) => ({ entity, statement: statements[index] }))
            .filter(({ statement }) => statement.guarded || statement.mode === 'update');

        if (guarded.length === 0) return;

        const ids = guarded.map(({ entity }) => entity.id);

        // Aynı id iki kez: ikinci statement'ın guard'ı birincinin yazdığı
        // sürümü göremez ve sessizce atlanır. Tek satıra iki farklı gerçek
        // yazılamayacağı için bu çağıran hatası.
        const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
        if (duplicate !== undefined) {
            throw new Error(
                `${this.entityName}: aynı batch'te '${duplicate}' id'si birden fazla kez var; ` +
                `kayıt başına tek entity ver.`
            );
        }

        const current = await this.readCurrentVersions(ids);

        // UPDATE dalı satırın varlığına dayanır; silinmişse statement 0 satır
        // yazar ve `executeBatch` bunu duyurmaz.
        const missing = guarded
            .filter(({ entity, statement }) => statement.mode === 'update' && !current.has(entity.id))
            .map(({ entity }) => entity.id);

        if (missing.length > 0) {
            throw new EntityNotFoundException(this.entityName, missing.join("', '"));
        }

        const stale = guarded
            .filter(({ entity, statement }) => this.wouldSkipWrite(entity, statement, current))
            .map(({ entity }) => entity.id);

        if (stale.length === 0) return;

        throw new Error(
            `${this.entityName} ('${stale.join("', '")}'): kaydedilmek istenen sürüm ` +
            `veritabanındakinden eski ('updated_at'). Araya başka bir yazma girmiş; ` +
            `kayıtları yeniden okuyup değişikliği tekrar uygula.`
        );
    }

    /**
     * Verilen id'lerin DB'deki güncel `updated_at` değerleri (satır yoksa girdi
     * yok). Damgası olmayan tabloda yalnızca satırın varlığını bildirir:
     * çağıranlar "var mı" sorusunu da buradan soruyor.
     */
    private async readCurrentVersions(ids: string[]): Promise<Map<string, unknown>> {
        const versions = new Map<string, unknown>();
        const versionColumn = this.hasUpdatedAt ? `, ${q('updated_at')}` : '';

        // Parametre üst sınırı satır sayısından bağımsız: batch büyüdüğünde
        // doğrulama sorgusu tek SELECT'e sığmayabilir.
        for (let start = 0; start < ids.length; start += MAX_SQL_PARAMS) {
            const chunk = ids.slice(start, start + MAX_SQL_PARAMS);

            // rawQuery: `describeSkippedWrite` ve `assertBatchWritable`
            // üzerinden yazma bloklarının içinden çağrılıyor, bkz. rawQuery().
            const rows = await this.rawQuery(
                `SELECT ${q('id')}${versionColumn} FROM ${q(this.tableName)} ` +
                `WHERE ${q('id')} IN (${chunk.map(() => '?').join(', ')})`,
                chunk
            );

            for (const row of rows) versions.set(String(row['id']), row['updated_at']);
        }

        return versions;
    }

    /** `staleWriteGuard` koşulunun JS karşılığı: bu yazma sessizce atlanır mı? */
    private wouldSkipWrite(
        entity: T,
        statement: WriteStatement,
        current: Map<string, unknown>
    ): boolean {
        // Satır yoksa UPSERT INSERT dalına düşer; UPDATE dalı buraya hiç gelmez,
        // eksik satır `assertBatchWritable`'da zaten hata olmuştur.
        if (!current.has(entity.id)) return false;

        const version = current.get(entity.id);
        if (typeof version !== 'string') return false; // NULL `updated_at` → guard kapalı

        const loaded = loadedVersions.get(entity);
        if (loaded !== undefined) return version !== loaded;

        // Okunmamış entity: guard yalnızca geriye gitmeyi engelliyor.
        const incoming = this.toEpoch(statement.writtenVersion);
        const existing = this.toEpoch(version);

        // Çözümlenemeyen format: SQL tarafında `strftime` NULL döner ve guard
        // kapanır; buranın da yazmayı engellememesi gerekir.
        if (incoming === undefined || existing === undefined) return false;

        return incoming < existing;
    }

    private toEpoch(value: string | undefined): number | undefined {
        if (value === undefined) return undefined;

        try {
            // `parseDate`, `strftime` gibi hem ISO'yu hem SQLite formatını anlar.
            return parseDate(value, 'updated_at').getTime();
        } catch {
            return undefined;
        }
    }

    protected async write(entity: T): Promise<void> {
        await this.serialize(async () => {
            const statement = await this.buildWriteStatement(entity);
            const result = await this.runWrite(statement.sql, statement.params);

            // Guard eşleştiğinde 1, INSERT'te 1, guard tutmadığında 0 satır etkilenir.
            // Sessiz no-op, bu sınıfın kaçınmaya çalıştığı sessiz veri kaybının kendisi.
            // UPDATE dalında 0 her zaman hatadır: satır ya silinmiş ya da sürüm
            // eskimiştir. UPSERT'in `DO NOTHING` dalında 0 beklenen sonuçtur;
            // orada guard yoktur.
            if (result.rowsAffected === 0 && (statement.mode === 'update' || statement.guarded)) {
                throw await this.describeSkippedWrite(entity);
            }

            this.rememberVersion(entity, statement);
        });
    }

    /**
     * Yazılmayan satırın sebebini ayırt eder: satır silinmiş mi, sürüm mü eski.
     *
     * Ayrım yalnızca **hata yolunda** bir SELECT'e mal olur; mutlu yolda ek
     * sorgu yok. Tek bir "0 satır" mesajı ikisini birbirine karıştırıyor ve
     * silinmiş kaydı "sürümün eski" diye raporluyordu.
     */
    private async describeSkippedWrite(entity: T): Promise<Error> {
        const current = await this.readCurrentVersions([entity.id]);

        if (!current.has(entity.id)) {
            return new EntityNotFoundException(this.entityName, entity.id);
        }

        return new Error(
            `${this.entityName} ('${entity.id}'): kaydedilmek istenen sürüm veritabanındakinden ` +
            `eski ('updated_at'). Araya başka bir yazma girmiş; kaydı yeniden okuyup ` +
            `değişikliği tekrar uygula.`
        );
    }

    /**
     * Başarılı yazmadan sonra entity hakkında bilinenleri tazeler: satırı artık
     * **var** (sonraki `save()` UPDATE üretir) ve yazılan `updated_at` yeni
     * "okunmuş sürümü" olur. Sürüm damgalanmazsa aynı entity'yi ikinci kez
     * kaydetmek, guard hâlâ ilk okunan sürümü aradığı için yanlışlıkla "eski
     * sürüm" hatası verirdi.
     *
     * İkisi de, yazmayı kapsayan transaction rollback ederse **geri alınır**:
     * aksi hâlde entity DB'de hiç bulunmayan bir sürümü hatırlıyor ve aynı kaydı
     * tekrar kaydetme denemesi guard'a takılıp kalıcı olarak "sürüm eski" hatası
     * veriyordu (kayıt yeniden okunana kadar kurtulunamıyordu). Aynı şey "satır
     * var" bilgisi için de geçerli: rollback'ten sonra satır yok, dolayısıyla
     * yazma yine UPSERT dalına düşmeli.
     */
    private rememberVersion(entity: T, statement: { writtenVersion?: string }): void {
        const wasPersisted = persistedEntities.has(entity);
        const previous = loadedVersions.get(entity);

        persistedEntities.add(entity);

        if (statement.writtenVersion !== undefined) {
            loadedVersions.set(entity, statement.writtenVersion);
        }

        // Geri alınacak bir şey yoksa kuyruğa hiç girme.
        if (wasPersisted && statement.writtenVersion === undefined) return;

        this.coordinator.onRollback(() => {
            if (!wasPersisted) persistedEntities.delete(entity);
            if (statement.writtenVersion === undefined) return;

            if (previous === undefined) {
                loadedVersions.delete(entity);
            } else {
                loadedVersions.set(entity, previous);
            }
        });
    }

    /**
     * Satırın var olduğu biliniyorsa UPDATE, bilinmiyorsa UPSERT.
     *
     * Ayrım entity örneğine bakar, DB'ye değil: "var mı" sorgusu atmak hem bir
     * round-trip hem de iki sorgunun arasına başka bir yazmanın girebildiği bir
     * pencere demekti (TOCTOU).
     */
    private async buildWriteStatement(
        entity: T,
        tableColumns?: ReadonlySet<string>
    ): Promise<WriteStatement> {
        const row = await this.prepareRow(entity, tableColumns);

        return persistedEntities.has(entity)
            ? this.buildUpdateStatement(entity, row)
            : this.buildUpsertStatement(entity, row);
    }

    /**
     * Okunmuş entity'nin yazması: satır zaten var, yaratılacak bir şey yok.
     *
     * Anahtar kolonları ve `created_at` SET'e girmez — UPSERT dalındaki
     * `immutable` kümesiyle aynı kural.
     */
    private buildUpdateStatement(entity: T, row: Record<string, any>): WriteStatement {
        const key = this.conflictTarget.map(col => this.validateIdentifier(col, 'conflict target'));
        const immutable = new Set([...key, 'created_at']);
        const updatable = Object.keys(row).filter(col => !immutable.has(col));

        // Anahtar + created_at dışında kolonu olmayan tablo: UPDATE'in yazacağı
        // bir şey yok. UPSERT'in `DO NOTHING` dalıyla aynı sonuç, onu üret.
        if (updatable.length === 0) return this.buildUpsertStatement(entity, row);

        const guard = this.loadedVersionCondition(entity, q('updated_at'));
        const conditions = key.map(col => `${q(col)} = ?`);
        if (guard) conditions.push(guard.sql);

        const writtenVersion = row['updated_at'];

        return {
            sql:
                `UPDATE ${q(this.tableName)} SET ${updatable.map(col => `${q(col)} = ?`).join(', ')} ` +
                `WHERE ${conditions.join(' AND ')}`,
            // `?` sırası statement içindeki görülme sırasıdır: SET, sonra anahtar,
            // sonra guard.
            params: [
                ...updatable.map(col => row[col]),
                ...key.map(col => row[col]),
                ...(guard?.params ?? []),
            ],
            mode: 'update',
            guarded: guard !== undefined,
            writtenVersion: typeof writtenVersion === 'string' ? writtenVersion : undefined,
        };
    }

    private buildUpsertStatement(entity: T, row: Record<string, any>): WriteStatement {
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');

        const conflict = this.conflictTarget.map(col => this.validateIdentifier(col, 'conflict target'));
        const immutable = new Set([...conflict, 'created_at']);
        const updatable = columns.filter(col => !immutable.has(col));

        const guard = updatable.length > 0 ? this.staleWriteGuard(entity) : { sql: '', params: [] };
        const conflictAction = updatable.length > 0
            ? `DO UPDATE SET ${updatable.map(col => `${q(col)} = excluded.${q(col)}`).join(', ')}${guard.sql}`
            : 'DO NOTHING';

        const writtenVersion = row['updated_at'];

        return {
            sql:
                `INSERT INTO ${q(this.tableName)} (${columns.map(q).join(', ')}) VALUES (${placeholders}) ` +
                `ON CONFLICT(${conflict.map(q).join(', ')}) ${conflictAction}`,
            // Guard parametreleri INSERT değerlerinden **sonra** gelir: `?`
            // sırası statement içindeki görülme sırasıdır.
            params: [...columns.map(col => row[col]), ...guard.params],
            mode: 'upsert',
            guarded: guard.sql !== '',
            writtenVersion: typeof writtenVersion === 'string' ? writtenVersion : undefined,
        };
    }

    /**
     * Lost update koruması (optimistic locking).
     *
     * Entity bu süreçte okunmuşsa guard, DB'deki satırın **hâlâ okunduğu andaki
     * sürümde** olmasını şart koşar. Araya başka bir yazma girdiyse koşul tutmaz,
     * 0 satır etkilenir ve `upsert` patlar.
     *
     * Eskiden karşılaştırma `excluded.updated_at >= tablo.updated_at` idi ve
     * hiçbir şeyi engellemiyordu: kaydeden taraf `touch()` ettiği için damgası
     * her zaman DB'dekinden yeniydi, dolayısıyla guard hep geçiyordu. Aynı
     * hesabı iki yerden okuyup ikisini de kaydeden akışta ilk yazma sessizce
     * kayboluyordu — bir bütçe uygulamasında doğrudan bakiye kaybı.
     *
     * Okunmamış entity'de (yeni yaratılmış ya da başka bir yoldan gelmiş)
     * karşılaştırılacak sürüm yoktur; orada eski davranışa düşülür ve yalnızca
     * geriye gitmek engellenir. DB'deki `updated_at` NULL ise (repo dışı INSERT)
     * guard her iki dalda da devre dışı kalır.
     *
     * Fallback dalı **metin değil zaman** karşılaştırır: repo ISO 8601
     * (`2026-07-24T12:00:00.000Z`) yazarken `DEFAULT CURRENT_TIMESTAMP`
     * `2026-07-24 12:00:00` bırakıyor. Metin karşılaştırmasında 10. karakterde
     * `'T'`(84) > `' '`(32) çıktığı için ISO damgası her zaman "daha yeni"
     * sayılıyor ve guard hiçbir şeyi engellemiyordu (aynı tuzak:
     * `BudgetRepository.findNeedingReset`). `strftime('%J', ...)` iki formatı da
     * julian güne çevirir; çeviremediğinde NULL döner ve o durumda guard
     * kapanır — bilinmeyen formatta yazmayı büsbütün bloke etmemek için.
     */
    private staleWriteGuard(entity: T): Condition {
        if (!this.hasUpdatedAt) return { sql: '', params: [] };

        const table = q(this.tableName);
        const column = q('updated_at');

        // UPSERT'te kolon tablo adıyla nitelenmeli: `excluded.updated_at` ile
        // karışmasın.
        const loaded = this.loadedVersionCondition(entity, `${table}.${column}`);
        if (loaded) {
            return { sql: ` WHERE ${loaded.sql}`, params: loaded.params };
        }

        const current = `strftime('%J', ${table}.${column})`;
        const incoming = `strftime('%J', excluded.${column})`;

        return {
            sql:
                ` WHERE (${table}.${column} IS NULL` +
                ` OR ${current} IS NULL OR ${incoming} IS NULL` +
                ` OR ${incoming} >= ${current})`,
            params: [],
        };
    }

    /**
     * Okunmuş sürüme dayanan guard koşulu; `WHERE` anahtar kelimesi **olmadan**.
     *
     * Kolon referansını çağıran verir: UPSERT'te tablo adıyla nitelenir, düz
     * UPDATE'te niteleme gereksizdir (ve `excluded` diye bir kaynak yoktur).
     */
    private loadedVersionCondition(entity: T, columnRef: string): Condition | undefined {
        if (!this.hasUpdatedAt) return undefined;

        const loaded = loadedVersions.get(entity);
        if (loaded === undefined) return undefined;

        return {
            sql: `(${columnRef} IS NULL OR ${columnRef} = ?)`,
            params: [loaded],
        };
    }

    protected async insert(entity: T): Promise<void> {
        await this.serialize(async () => {
            const row = await this.prepareRow(entity);
            const columns = Object.keys(row);
            const placeholders = columns.map(() => '?').join(', ');
            const writtenVersion = row['updated_at'];

            await this.runWrite(
                `INSERT INTO ${q(this.tableName)} (${columns.map(q).join(', ')}) VALUES (${placeholders})`,
                columns.map(col => row[col])
            );

            // `upsert()` ile aynı damga: olmazsa aynı entity örneği sonradan
            // `save()` edildiğinde guard okunmuş sürüm bulamayıp zayıf
            // karşılaştırma dalına düşüyor, yani lost update koruması sessizce
            // kapanıyordu.
            this.rememberVersion(entity, {
                writtenVersion: typeof writtenVersion === 'string' ? writtenVersion : undefined,
            });
        });
    }

    /**
     * Boş id ile sessiz no-op, `prepareRow`'un yazma tarafındaki kuralıyla
     * çelişiyordu ve `deleteOrFail` bunu "kayıt yok" diye raporluyordu.
     * Junction tabloları için `delete()`'i override eden repo'lar da aynı
     * mesajı üretebilsin diye ayrı metot.
     */
    protected assertDeletableId(id: string): void {
        if (!id) {
            throw new Error(`${this.entityName}: boş 'id' ile silme yapılamaz.`);
        }
    }

    async delete(id: string): Promise<boolean> {
        this.assertDeletableId(id);

        const result = await this.serialize(() => this.runWrite(
            `DELETE FROM ${q(this.tableName)} WHERE ${q('id')} = ?`, [id]
        ));
        return result.rowsAffected > 0;
    }

    async deleteOrFail(id: string): Promise<void> {
        const deleted = await this.delete(id);
        if (!deleted) {
            throw new EntityNotFoundException(this.entityName, id);
        }
    }

    async deleteMany(where: Record<string, any>): Promise<number> {
        const result = await this.serialize(async () => {
            await this.loadTableColumns();

            const conditions = this.buildWhereClause(where);

            // Koşul *sayısı* değil *seçiciliği* önemli: her satırı kapsayan
            // koşullar guard'ı geçip tabloyu boşaltıyordu.
            // Parametreler koşullarla birlikte taşındığı için elenen bir koşulun
            // parametreleri de elenir; eskiden `params` ayrı bir dizi olduğundan
            // parametreli bir tautoloji eklendiğinde `?` sırası kayabilirdi.
            //
            // Eleme metne değil `coversAllRows` bayrağına bakar: `1 = 1` dışında
            // NOT NULL/PK kolonundaki `IS NOT NULL` da bütün tabloyu kapsıyor ve
            // string karşılaştırmasından kaçıyordu.
            const selective = conditions.filter(condition => !condition.coversAllRows);

            if (selective.length === 0) {
                throw new Error(
                    'Silme için seçici koşul yok (boş filtre ya da her satırı kapsayan koşul). ' +
                    'Bütün kayıtları silmek için truncate({ confirm: true }) kullan.'
                );
            }

            const params = selective.flatMap(condition => condition.params);
            this.assertParamLimit(params);

            return this.runWrite(
                `DELETE FROM ${q(this.tableName)} WHERE ${selective.map(c => c.sql).join(' AND ')}`,
                params
            );
        });

        return result.rowsAffected;
    }

    /** Tabloyu boşaltır. Yanlışlıkla çağrılmasın diye açık onay ister. */
    async truncate(options: { confirm: true }): Promise<void> {
        if (!options?.confirm) {
            throw new Error(
                `${this.entityName}: truncate() bütün tabloyu siler; bilinçli olduğunu ` +
                `belirtmek için { confirm: true } ver.`
            );
        }

        await this.serialize(() => this.runWrite(`DELETE FROM ${q(this.tableName)}`, []));
    }

    /**
     * Birden fazla statement'ı tek transaction'da yürütür.
     *
     * Junction tablosu senkronize eden `save()` override'ları bunu kullanmalı;
     * aksi hâlde ana satır yazılıp ilişki güncellemesi patladığında kayıt yarım
     * kalıyordu.
     *
     * Sınırı `TransactionCoordinator` yönetir ve o koordinatör adapter başına
     * tekildir: `SqliteUnitOfWork` de aynı kuyruğu kullanır. Eskiden repo'nun
     * kendi WeakMap kuyruğu vardı, UoW'unkinden habersizdi ve ikisi aynı
     * bağlantıda "cannot start a transaction within a transaction" ile
     * çakışıyordu.
     *
     * Açık bir sınır varsa yeni bir tane açılmaz, mevcut olana katılır — SQLite
     * iç içe transaction desteklemiyor. Bu yüzden `transactional()` kendi
     * `operation`'ı içinden tekrar çağrılabilir (kilitlenmez), ama dışarıdan
     * bağımsız gelen bir çağrı da o sınıra yakalanır: tarayıcıda çağrının nereden
     * geldiğini ayırt edecek bir async-context API'si yok. Bağımsız iş birimleri
     * bu yüzden `IUnitOfWork.run()` üzerinden çalıştırılmalı; o yol asla mevcut
     * sınıra katılmaz, sırasını bekler.
     */
    protected async transactional<R>(operation: () => Promise<R>): Promise<R> {
        return this.coordinator.join(operation);
    }

    /**
     * Tek statement'lık yazmayı kuyruğa alır. Sınır **açmaz**: tek statement
     * SQLite'ta zaten atomiktir. Amacı, açık bir sınır yokken yazmanın başka bir
     * `transactional()` bloğunun ortasına düşmesini engellemek — `saveMany` ve
     * `delete` eskiden hiçbir kuyruğa girmediği için tam olarak bunu yapıyordu.
     *
     * `saveMany` artık buraya değil `transactional()`'a gider: tek statement
     * değil ve doğrulaması patladığında yazdıklarını geri alabilmesi gerekiyor.
     */
    private async serialize<R>(operation: () => Promise<R>): Promise<R> {
        return this.coordinator.serial(operation);
    }

    /** toPersistence + id ve şema doğrulaması. */
    private async prepareRow(
        entity: T,
        tableColumns?: ReadonlySet<string>
    ): Promise<Record<string, any>> {
        if (!entity.id) {
            throw new Error(`${this.entityName}: boş 'id' ile kayıt yapılamaz.`);
        }

        const row = this.toPersistence(entity);
        if (row['id'] == null) {
            throw new Error(`${this.entityName}: toPersistence 'id' kolonunu üretmedi.`);
        }

        this.assertRowMatchesSchema(row, tableColumns ?? await this.loadTableColumns());

        return row;
    }

    private async runWrite(sql: string, params: any[]) {
        try {
            return await this.db.run(sql, params);
        } catch (error) {
            throw this.describeWriteError(error);
        }
    }

    /**
     * `ON CONFLICT` hedefi dışındaki bir UNIQUE kısıt ihlali, SQLite'tan ham
     * `SQLITE_CONSTRAINT` olarak geliyor ve `save()`'in "upsert" sözleşmesini
     * sessizce bozuyordu. SQLite tek çakışma hedefi kabul ettiği için bunu
     * UPSERT'e çeviremiyoruz; en azından ne yapılması gerektiğini söyleyelim.
     */
    private describeWriteError(error: unknown): unknown {
        const message = error instanceof Error ? error.message : String(error);
        const match = /UNIQUE constraint failed:\s*([^\n)]+)/i.exec(message);
        if (!match) return error;

        const failed = match[1]
            .split(',')
            .map(part => part.trim().split('.').pop()!.trim())
            .filter(Boolean);
        const target = this.conflictTarget.map(col => toSnakeCase(col));

        const isConflictTarget =
            failed.length === target.length && failed.every(col => target.includes(col));
        if (isConflictTarget) return error;

        return new Error(
            `${this.entityName}: '${failed.join("', '")}' üzerindeki UNIQUE kısıt ihlal edildi. ` +
            `save() yalnızca ON CONFLICT(${target.join(', ')}) çakışmasını UPSERT'e çevirir; ` +
            `bu kısıt için çakışmayı çağıran ele almalı (önce ara, sonra güncelle) ya da ` +
            `repo'da 'conflictTarget' bu kısıt olarak tanımlanmalı. Özgün hata: ${message}`
        );
    }

    /**
     * Row ile tablo kolonlarının birebir örtüştüğünü doğrular.
     *
     * Eksik kolon sessiz bir hataydı: UPSERT yalnızca row'da bulunan kolonları
     * günceller, dolayısıyla üretilmeyen bir kolonun DB'deki eski değeri
     * sonsuza kadar kalırdı. Fazla kolon ise cast'teki yazım hatasını yakalar.
     */
    private assertRowMatchesSchema(row: Record<string, any>, columns: ReadonlySet<string>): void {
        // Şema okunamadıysa (platform PRAGMA döndürmüyor) doğrulama atlanır;
        // yazmayı platforma göre kırmamak için bilinçli olarak fail-soft.
        if (columns.size === 0) return;

        const unknown = Object.keys(row).filter(col => !columns.has(col));
        if (unknown.length > 0) {
            throw new Error(
                `${this.entityName}: '${unknown.join("', '")}' kolonu '${this.tableName}' ` +
                `tablosunda yok — cast/transientFields tanımını kontrol et.`
            );
        }

        const external = new Set(this.externalColumns.map(col => toSnakeCase(col)));
        const missing = [...columns].filter(col => !(col in row) && !external.has(col));
        if (missing.length > 0) {
            throw new Error(
                `${this.entityName}: toPersistence '${missing.join("', '")}' kolonunu üretmedi — ` +
                `UPSERT bu kolonu güncellemez ve DB'deki eski değer kalır. ` +
                `Entity alanını ekle ya da 'externalColumns'a koy.`
            );
        }
    }

    /**
     * Tablo kolonlarını bir kez okur; hem yazma yolundaki şema kontrolü, hem
     * `validateIdentifier`'ın kolon adı doğrulaması, hem de tarih kolonu tespiti
     * bunu kullanır.
     *
     * Boş sonuç **cache'lenmez**: tablo henüz yaratılmamışken yapılan tek bir
     * çağrı, boş `Set` truthy olduğu için doğrulamayı o repo instance'ının ömrü
     * boyunca sessizce kapatıyordu. Yalnızca PRAGMA'nın hiç desteklenmediği
     * (exception atan) durum kalıcı olarak işaretlenir.
     */
    protected async loadTableColumns(): Promise<ReadonlySet<string>> {
        if (this.tableColumnCache) return this.tableColumnCache;
        if (this.pragmaUnsupported) return NO_COLUMNS;

        // Paralel ilk okumalar (`Promise.all([find(), count()])`) aynı PRAGMA'yı
        // N kez atmasın; sonuç cache'lendiği için devam eden çağrılar buraya
        // hiç gelmez.
        this.schemaLoad ??= this.readTableColumns();

        try {
            return await this.schemaLoad;
        } finally {
            this.schemaLoad = undefined;
        }
    }

    private async readTableColumns(): Promise<ReadonlySet<string>> {
        let rows: any[];
        try {
            // rawQuery: yazma bloklarının içinden çağrılıyor, bkz. rawQuery().
            rows = await this.rawQuery(`PRAGMA table_info(${this.tableName})`);
        } catch {
            this.pragmaUnsupported = true; // PRAGMA desteklenmiyor → doğrulama devre dışı
            return NO_COLUMNS;
        }

        const names = rows
            .map(row => row.name)
            .filter((name): name is string => typeof name === 'string');

        if (names.length === 0) return NO_COLUMNS; // tablo henüz yok; sonra tekrar dene

        const declared = rows.filter(row => typeof row.name === 'string');

        this.columnTypeCache = new Map(
            declared.map(row => [row.name as string, String(row.type ?? '').toUpperCase()])
        );

        // PK de "her satırda dolu" sayılır: SQLite eski uyumluluk nedeniyle
        // `TEXT PRIMARY KEY` kolonunda NULL'a izin verir ve `PRAGMA table_info`
        // bunu `notnull = 0` diye bildirir. `deleteMany` guard'ının yanılma yönü
        // "silmeyi reddetmek" olmalı, "tabloyu boşaltmak" değil.
        this.notNullColumnCache = new Set(
            declared
                .filter(row => Number(row.notnull ?? 0) === 1 || Number(row.pk ?? 0) > 0)
                .map(row => row.name as string)
        );

        this.tableColumnCache = new Set(names);

        return this.tableColumnCache;
    }

    /**
     * Kolon şemaya göre her satırda dolu mu? Öyleyse `IS NOT NULL` koşulu
     * hiçbir satırı elemez, yani tek başına "bütün tablo" demektir.
     *
     * Şema okunamayan platformlarda boş küme döner: bilinmeyen kolon "dolu
     * olabilir" sayılmaz, guard eski (daha gevşek) davranışına düşer.
     */
    private alwaysHasValue(column: string): boolean {
        return this.notNullColumnCache.has(column);
    }

    // ========== Query building ==========

    /**
     * Tek okuma. Yazmalar gibi koordinatörden geçer.
     *
     * Eskiden doğrudan `db.query`'ye iniyordu, yani okumalar koordinatörün
     * kuyruğunu hiç görmüyordu. Tek bir SQLite bağlantısı olduğu için bu, açık
     * bir sınır varken atılan SELECT'in o transaction'ın **içinde** çalışması
     * demekti. `HomePage.onIonViewWillEnter` bunu her girişte üretiyordu:
     * `Promise.all` içindeki `loadActiveBudgets()` bütçe devri için yazma
     * sınırı açarken, yanındaki beş okuma (hesaplar, kategoriler, kurlar, ...)
     * o sınırın ortasına düşüyordu. Sınır rollback ederse SQLite geri alınıyor
     * ama store'lar commit edilmemiş ara duruma göre doldurulmuş DTO'ları
     * tutmaya devam ediyordu.
     *
     * `serial()` sınır açmaz; yalnızca sıraya sokar. Böylece sınır açılmadan
     * ÖNCE başlayan okumalar (yukarıdaki fan-out'un tamamı) yazmayla birlikte
     * çağrı sırasına göre serileşir.
     *
     * KALAN SINIR: sınır AÇILDIKTAN sonra bağımsız bir akıştan gelen okuma
     * `active` bayrağını görüp yerinde çalışmaya devam eder — koordinatör,
     * çağrının sınırın sahibinden mi yoksa başka bir akıştan mı geldiğini
     * ayırt edemiyor (tarayıcıda `AsyncLocalStorage` yok, bkz.
     * transaction-coordinator.ts). Bunu kapatmak bağlam taşıyan bir okuma
     * API'si gerektirir.
     */
    protected async selectRows(sql: string, params: any[] = []): Promise<any[]> {
        const result = await this.coordinator.read(() => this.db.query(sql, params));
        return result.rows ?? [];
    }

    /**
     * Koordinatörü ATLAYAN okuma. Yalnızca `serialize()`/`transactional()`
     * bloklarının **içinden** yapılan dahili okumalar için.
     *
     * Gerekçe: `serial()` kuyruğa alınmış bir işin içinden çağrılırsa kendi
     * kilidini bekler ve kilitlenir. Bu yol gerçek ve yazma yolunun tam
     * ortasında: `save()` → `serialize()` → `prepareRow()` →
     * `loadTableColumns()` → `PRAGMA table_info`.
     *
     * Koordinatöre "şu an kuyrukta bir iş çalışıyor" diye genel bir bayrak
     * koymak da çözerdi ama bedeli ağır: o bayrak açıkken **bağımsız** bir
     * akıştan gelen okumalar da kuyruğu atlar, yani `selectRows`'un sıraya
     * girme garantisi yükün en yoğun olduğu anda kaybolurdu. Yeniden girişi
     * burada, çağrı noktasında işaretlemek garantiyi korur.
     *
     * Sıraya girmemesi güvenli: bu okumalar zaten sıranın sahibi olan işin
     * parçası ve o iş tek bir bağlantı üzerinde sırayla ilerliyor.
     */
    private async rawQuery(sql: string, params: any[] = []): Promise<any[]> {
        const result = await this.db.query(sql, params);
        return result.rows ?? [];
    }

    /**
     * ORDER BY + LIMIT/OFFSET.
     *
     * Sıralama ne verilirse verilsin sonuna `id` eklenir (zaten sıralamada
     * değilse). Sırasız sorgudaki belirsizlik biliniyordu ama asıl risk
     * **sıralı ama eşitlikli** sorgudaydı: `ORDER BY "date" DESC LIMIT 10`
     * aynı tarihli satırlar arasında hangisinin döneceğini söylemez ve tabloya
     * index eklendiğinde sonuç sessizce değişir; offset'li sayfalarda da kayıt
     * tekrarlanır/atlanır. `TransactionRepository.findPage` bu tie-break'i elle
     * ekliyordu, diğer bütün çağıranlar (findRecent, findByType, findActive...)
     * korumasızdı.
     */
    protected buildOrderLimitClause(options?: FindOptions): string {
        const opts = (options ?? {}) as ResolvedOptions;
        const { orderBy } = opts;
        let clause = '';
        const parts: string[] = [];

        if (typeof orderBy === 'string') {
            // Örtük 'DESC' kaldırıldı: yönü söylemeyen çağıran beklemediği sırayı alıyordu.
            if (!opts.direction) {
                throw new Error(`orderBy '${orderBy}' için 'direction' zorunlu ('ASC' | 'DESC').`);
            }
            parts.push(
                `${q(this.validateIdentifier(orderBy, 'orderBy'))} ${this.validateDirection(opts.direction)}`
            );
        } else if (Array.isArray(orderBy)) {
            // Boş dizi sessizce sırasız sorgu üretiyordu; `paginate` bunu ayrıca
            // kontrol ediyordu ama `find` etmiyordu.
            if (orderBy.length === 0) {
                throw new Error("orderBy boş dizi olamaz; sıralama gerekmiyorsa alanı hiç verme.");
            }
            for (const o of orderBy) {
                if (!o.direction) {
                    throw new Error(`orderBy '${o.column}' için 'direction' zorunlu ('ASC' | 'DESC').`);
                }
                parts.push(
                    `${q(this.validateIdentifier(o.column, 'orderBy'))} ${this.validateDirection(o.direction)}`
                );
            }
        }

        // Sırasız sorguda tie-break yalnızca LIMIT/OFFSET varken gerekir
        // (sınır yoksa bütün satırlar zaten dönüyor); sıralı sorguda ise
        // eşitlik her zaman mümkün olduğu için koşulsuz eklenir.
        const needsTieBreak = parts.length > 0 || opts.limit !== undefined || opts.offset !== undefined;

        if (needsTieBreak && this.hasIdColumn() && !this.ordersById(parts)) {
            parts.push(`${q('id')} ASC`);
        }

        if (parts.length > 0) {
            clause += ` ORDER BY ${parts.join(', ')}`;
        }

        const hasLimit = opts.limit !== undefined;
        const hasOffset = opts.offset !== undefined;

        if (hasLimit || hasOffset) {
            // SQLite'ta OFFSET, LIMIT olmadan kullanılamaz; `LIMIT -1` = sınırsız.
            clause += ` LIMIT ${hasLimit ? this.validateLimit(opts.limit!) : -1}`;
            if (hasOffset) {
                clause += ` OFFSET ${this.validateOffset(opts.offset!)}`;
            }
        }

        return clause;
    }

    /**
     * Tie-break `id` kolonuna dayanır. Şema okunamayan platformlarda kolonun
     * varlığı bilinemez; orada eklenmez (var olmayan kolon sorguyu büsbütün
     * kırardı).
     */
    private hasIdColumn(): boolean {
        return this.tableColumnCache?.has('id') === true;
    }

    private ordersById(parts: string[]): boolean {
        return parts.some(part => part.startsWith(`${q('id')} `));
    }

    private assertParamLimit(params: any[]): void {
        if (params.length > MAX_SQL_PARAMS) {
            throw new Error(
                `Sorgu ${params.length} parametre üretti; SQLite üst sınırı ${MAX_SQL_PARAMS}. ` +
                `Filtreyi daralt ya da parça parça sorgula.`
            );
        }
    }

    /** Koşulları tek WHERE cümlesine ve sıralı parametre dizisine indirger. */
    protected composeWhere(where: Record<string, any>): { clause: string; params: any[] } {
        const conditions = this.buildWhereClause(where);
        const params = conditions.flatMap(condition => condition.params);

        this.assertParamLimit(params);

        return {
            clause: conditions.length
                ? ` WHERE ${conditions.map(condition => condition.sql).join(' AND ')}`
                : '',
            params,
        };
    }

    /**
     * Where objesi → koşul listesi. Her koşul kendi parametrelerini taşır;
     * `deleteMany` gibi koşul eleyen çağıranlarda `?` sırasının kaymaması bu
     * eşleşmeye bağlı.
     */
    protected buildWhereClause(where: Record<string, any>): Condition[] {
        const conditions: Condition[] = [];

        for (const [key, value] of Object.entries(where)) {
            // undefined → filtre atla (form'dan gelmemiş parametre gibi)
            if (value === undefined) continue;

            // $or: [{...}, {...}] → (A OR B). Dallar recursive işlenir.
            // `validateIdentifier`'dan önce yakalanmalı ('$' kolon adı değil).
            if (key === '$or') {
                conditions.push(this.buildOrClause(value));
                continue;
            }

            const dbColumn = this.validateIdentifier(key, 'where clause');

            // null → IS NULL
            if (value === null) {
                conditions.push({ sql: `${q(dbColumn)} IS NULL`, params: [] });
                continue;
            }

            // Array → IN
            if (Array.isArray(value)) {
                conditions.push(this.buildInCondition(dbColumn, value, false));
                continue;
            }

            // Operator object:
            // { eq, neq, gt, gte, lt, lte, like, contains, startsWith, endsWith, in, notIn, isNull }
            if (typeof value === 'object' && !(value instanceof Date)) {
                if (!isPlainObject(value)) {
                    throw new Error(
                        `'${key}' filtresine sınıf örneği verildi; ilkel değer ya da operatör objesi bekleniyor.`
                    );
                }
                conditions.push(...this.applyOperators(dbColumn, value));
                continue;
            }

            // Eşitlik
            conditions.push({
                sql: `${q(dbColumn)} = ?`,
                params: [this.serializeValue(value, key)],
            });
        }

        return conditions;
    }

    /**
     * IN / NOT IN koşulu.
     *
     * SQL'de `col IN (NULL)` hiçbir zaman doğru olmadığı için dizideki null
     * değerler ayrılıp açık `IS NULL` koşuluna çevrilir; eskiden null aranan
     * satırlar sessizce sonuç dışı kalıyordu.
     *
     * `NOT IN` tarafında ayna görüntüsü vardı: `col NOT IN ('x')` koşulu NULL
     * satırlar için NULL (=false) ürettiğinden, "bu değerlerden biri olmayan"
     * diyen çağırana kolonu hiç dolu olmayan satırlar dönmüyordu. Null açıkça
     * listelenmediyse artık `IS NULL` satırları da kapsanır; listelendiyse
     * (`notIn: [x, null]`) çağıran onları da dışlamak istemiştir.
     */
    private buildInCondition(dbColumn: string, values: any[], negate: boolean): Condition {
        if (values.length === 0) {
            return negate
                ? { sql: ALWAYS_TRUE, params: [], coversAllRows: true }
                : { sql: ALWAYS_FALSE, params: [] };
        }

        const hasNull = values.some(v => v === null || v === undefined);
        const concrete = values.filter(v => v !== null && v !== undefined);
        const column = q(dbColumn);

        if (concrete.length === 0) {
            return negate
                ? this.notNullCondition(dbColumn)
                : { sql: `${column} IS NULL`, params: [] };
        }

        // Sınır, gerçekten bind edilecek değerler üzerinden: null'lar `IS NULL`
        // koşuluna dönüştüğü için parametre harcamıyor.
        if (concrete.length > MAX_SQL_PARAMS) {
            throw new Error(
                `'${dbColumn}' için ${concrete.length} değerli liste verildi; SQLite üst sınırı ` +
                `${MAX_SQL_PARAMS}. Filtreyi daralt ya da parça parça sorgula.`
            );
        }

        const params = concrete.map(v => this.serializeValue(v, dbColumn));
        const list = `${column} ${negate ? 'NOT IN' : 'IN'} (${concrete.map(() => '?').join(', ')})`;

        if (!negate) {
            return {
                sql: hasNull ? `(${list} OR ${column} IS NULL)` : list,
                params,
            };
        }

        return {
            sql: hasNull ? `(${list} AND ${column} IS NOT NULL)` : `(${list} OR ${column} IS NULL)`,
            params,
        };
    }

    /**
     * `IS NOT NULL` koşulu. Kolon şemaya göre zaten her satırda doluysa koşul
     * hiçbir şeyi elemez; `deleteMany` görebilsin diye işaretlenir.
     */
    private notNullCondition(dbColumn: string): Condition {
        return {
            sql: `${q(dbColumn)} IS NOT NULL`,
            params: [],
            coversAllRows: this.alwaysHasValue(dbColumn),
        };
    }

    private buildOrClause(value: unknown): Condition {
        if (!Array.isArray(value) || value.length === 0) {
            throw new Error("'$or' boş olmayan bir dizi bekliyor.");
        }

        const branches = value.map<Condition>(branch => {
            if (branch === null || typeof branch !== 'object' || Array.isArray(branch)) {
                throw new Error("'$or' dalları where objesi olmalı.");
            }

            const sub = this.buildWhereClause(branch as Record<string, any>);
            if (sub.length === 0) {
                throw new Error("'$or' dalı hiç koşul üretmedi; filtre sessizce genişletilemez.");
            }

            return sub.length > 1
                ? {
                    sql: `(${sub.map(condition => condition.sql).join(' AND ')})`,
                    params: sub.flatMap(condition => condition.params),
                    // AND zinciri ancak bütün halkaları her satırı kapsıyorsa kapsar.
                    coversAllRows: sub.every(condition => condition.coversAllRows === true),
                }
                : sub[0];
        });

        // Bir dal her satırı kapsıyorsa OR'un tamamı her satırı kapsar; bunu
        // ALWAYS_TRUE olarak yukarı taşı ki `deleteMany` guard'ı görebilsin.
        // Parametreler koşula bağlı olduğu için elenen dallarla birlikte düşer.
        if (branches.some(branch => branch.coversAllRows)) {
            return { sql: ALWAYS_TRUE, params: [], coversAllRows: true };
        }

        return {
            sql: `(${branches.map(branch => branch.sql).join(' OR ')})`,
            params: branches.flatMap(branch => branch.params),
        };
    }

    private applyOperators(dbColumn: string, ops: Record<string, any>): Condition[] {
        const OP_SQL: Record<string, string> = {
            eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=',
        };

        if (Object.keys(ops).length === 0) {
            throw new Error(
                `'${dbColumn}' için boş filtre objesi — koşul üretmeyen filtre sessizce yok sayılamaz.`
            );
        }

        const column = q(dbColumn);
        const conditions: Condition[] = [];

        for (const [op, opVal] of Object.entries(ops)) {
            if (opVal === undefined) continue;

            switch (op) {
                case 'in':
                case 'notIn': {
                    if (!Array.isArray(opVal)) {
                        throw new Error(`'${op}' operator expects array, got ${typeof opVal}`);
                    }
                    conditions.push(this.buildInCondition(dbColumn, opVal, op === 'notIn'));
                    break;
                }

                case 'isNull':
                    conditions.push(opVal
                        ? { sql: `${column} IS NULL`, params: [] }
                        : this.notNullCondition(dbColumn));
                    break;

                // `like` deseni çağırandan geldiği gibi kullanılır — ESCAPE de
                // eklenmez, aksi hâlde desendeki literal `\` sessizce escape
                // karakterine dönüşüyordu. Diğerlerinde wildcard'ları base ekler
                // ve kullanıcı girdisi escape edilir.
                case 'like':
                case 'contains':
                case 'startsWith':
                case 'endsWith': {
                    // String'e zorlamak, yanlışlıkla verilen objeyi '[object Object]'
                    // olarak sessizce aratıyordu.
                    if (typeof opVal !== 'string') {
                        throw new Error(`'${op}' operatörü string bekliyor, ${typeof opVal} geldi.`);
                    }

                    if (op === 'like') {
                        conditions.push({ sql: `${column} LIKE ?`, params: [opVal] });
                        break;
                    }

                    const escaped = escapeLikePattern(opVal);
                    const pattern =
                        op === 'contains' ? `%${escaped}%`
                        : op === 'startsWith' ? `${escaped}%`
                        : `%${escaped}`;

                    conditions.push({ sql: `${column} LIKE ? ESCAPE '\\'`, params: [pattern] });
                    break;
                }

                default: {
                    const sqlOp = OP_SQL[op];
                    if (!sqlOp) {
                        throw new Error(`Unknown operator: ${op}`);
                    }

                    // SQL'de hiçbir karşılaştırma NULL ile doğru sonuç vermez;
                    // `{ eq: null }` / `{ neq: null }` sessizce boş sonuç
                    // üretiyordu. Sıralama operatörlerinin NULL ile anlamı yok.
                    if (opVal === null) {
                        if (op !== 'eq' && op !== 'neq') {
                            throw new Error(
                                `'${op}' operatörü null ile kullanılamaz ('${dbColumn}'); ` +
                                `null kontrolü için { isNull: true } kullan.`
                            );
                        }
                        conditions.push(op === 'eq'
                            ? { sql: `${column} IS NULL`, params: [] }
                            : this.notNullCondition(dbColumn));
                        break;
                    }

                    // `col != ?` NULL satırları eler (NULL != 'x' → NULL → false).
                    // "Bu değere eşit olmayan" diyen çağıran, kolonu hiç dolu
                    // olmayan satırları da bekler.
                    conditions.push({
                        sql: op === 'neq' ? `(${column} != ? OR ${column} IS NULL)` : `${column} ${sqlOp} ?`,
                        params: [this.serializeValue(opVal, dbColumn)],
                    });
                }
            }
        }

        // Bütün operatör değerleri undefined ise hiç koşul üretilmez; bu, boş
        // filtre objesiyle aynı sessiz "tüm tablo" sonucunu doğuruyordu.
        if (conditions.length === 0) {
            throw new Error(
                `'${dbColumn}' filtresindeki bütün operatör değerleri undefined — ` +
                `koşul üretmeyen filtre sessizce yok sayılamaz.`
            );
        }

        return conditions;
    }

    // ========== Currency scoping ==========

    /** `currencyScopedColumns` girdisini normalize eder (snake_case + varsayılanlar). */
    private resolveCurrencyScope(column: string): Required<CurrencyScopedColumn> | undefined {
        for (const entry of this.currencyScopedColumns) {
            const spec = typeof entry === 'string' ? { column: entry } : entry;
            if (toSnakeCase(spec.column) !== column) continue;

            return {
                column,
                currencyColumn: toSnakeCase(spec.currencyColumn ?? this.currencyColumn),
                minorUnitColumn: toSnakeCase(spec.minorUnitColumn ?? DEFAULT_MINOR_UNIT_COLUMN),
            };
        }
        return undefined;
    }

    private assertCurrencyScoped(
        column: string,
        where?: Record<string, any>,
        groupBy?: string
    ): Required<CurrencyScopedColumn> | undefined {
        const scope = this.resolveCurrencyScope(column);
        if (!scope) return undefined;

        if (groupBy === scope.currencyColumn) return scope;
        if (this.pinsSingleValue(where, scope.currencyColumn)) return scope;

        throw new Error(
            `'${column}' para birimine bağlı bir kolon: '${scope.currencyColumn}' filtresini ` +
            `tek bir değere sabitle ya da bu kolonla grupla — aksi hâlde farklı currency'ler toplanır.`
        );
    }

    /**
     * Ölçek sayımını SELECT'e ekler.
     *
     * `COUNT(DISTINCT minor_unit)` NULL'ları hiç saymıyordu: `minor_unit` NULL
     * olan satırlarla `minor_unit = 0` olan satırlar tek ölçek gibi görünüyor,
     * guard geçiyor ve kuruş ölçeğindeki tutarla tam birim ölçeğindeki tutar
     * toplanıyordu. NULL, `MoneyCast`'in okurken varsaydığı ölçeğe indirilir.
     */
    private minorUnitVariantSelect(minorUnitColumn: string | undefined): string {
        return minorUnitColumn
            ? `, COUNT(DISTINCT COALESCE(${q(minorUnitColumn)}, ${IMPLIED_MINOR_UNIT})) AS unit_variants`
            : '';
    }

    private minorUnitGuardColumn(
        scope: Required<CurrencyScopedColumn> | undefined,
        columns: ReadonlySet<string>
    ): string | undefined {
        if (!scope) return undefined;
        return columns.has(scope.minorUnitColumn) ? scope.minorUnitColumn : undefined;
    }

    /**
     * Para birimi pinlenmiş olsa bile satır bazlı `minor_unit` farklıysa toplam
     * yine anlamsız: 2 haneli ve 0 haneli tutarlar aynı ölçekteymiş gibi
     * toplanır. Aynı sorguda sayıldığı için ek round-trip maliyeti yok.
     */
    private assertUniformMinorUnit(
        row: Record<string, any> | undefined,
        column: string,
        minorUnitColumn?: string
    ): void {
        if (!minorUnitColumn || !row) return;
        if (Number(row.unit_variants ?? 0) <= 1) return;

        throw new Error(
            `'${column}' toplanamıyor: kapsanan satırlar farklı '${minorUnitColumn}' değerleri ` +
            `taşıyor, tutarlar aynı ölçekte değil. Filtreyi tek bir ölçeğe daralt.`
        );
    }

    /**
     * Where, verilen kolonu **tek bir** değere sabitliyor mu?
     *
     * Yalnızca "null/undefined değil" bakmak yetmiyordu: `{ in: ['try','usd'] }`
     * ya da `{ neq: 'x' }` gibi operatör objeleri guard'ı geçip birden fazla para
     * birimini toplatıyordu.
     *
     * `$or` de sayılır: bütün dallar kolonu **aynı** tek değere sabitliyorsa
     * birleşim de o değere sabitlenmiştir. Eskiden `$or` toptan atlanıyordu ve
     * hesap filtresi gibi meşru bir OR'la birlikte toplam almak imkânsızdı.
     */
    private pinsSingleValue(where: Record<string, any> | undefined, column: string): boolean {
        if (!where) return false;
        if (this.pinnedValue(where, column) !== undefined) return true;

        const branchValues = this.orBranchValues(where['$or'], column);
        return branchValues !== undefined && branchValues.size === 1;
    }

    /**
     * `$or` dallarının her birinin kolonu sabitlediği değerler. Bir dal bile
     * sabitlemiyorsa `undefined` — o zaman birleşim de sabitlenmemiştir.
     */
    private orBranchValues(value: unknown, column: string): Set<unknown> | undefined {
        if (!Array.isArray(value) || value.length === 0) return undefined;

        const values = new Set<unknown>();

        for (const branch of value) {
            if (!branch || typeof branch !== 'object' || Array.isArray(branch)) return undefined;

            const pinned = this.pinnedValue(branch as Record<string, any>, column);
            if (pinned === undefined) return undefined;

            values.add(pinned);
        }

        return values;
    }

    /** Where'in kolona sabitlediği tek değer; sabitlemiyorsa `undefined`. */
    private pinnedValue(where: Record<string, any>, column: string): unknown {
        for (const [key, value] of Object.entries(where)) {
            if (key === '$or' || toSnakeCase(key) !== column) continue;
            if (value === null || value === undefined) return undefined;

            if (Array.isArray(value)) return value.length === 1 ? value[0] : undefined;

            if (typeof value === 'object' && !(value instanceof Date)) {
                const ops = Object.keys(value).filter(op => value[op] !== undefined);
                if (ops.length !== 1) return undefined;

                if (ops[0] === 'eq') return isPinnableValue(value.eq) ? value.eq : undefined;
                if (ops[0] === 'in') {
                    return Array.isArray(value.in) && value.in.length === 1 ? value.in[0] : undefined;
                }
                return undefined;
            }

            return value; // ilkel eşitlik
        }

        return undefined;
    }

    // ========== Validation ==========

    protected validateIdentifier(column: string, context: string): string {
        const snakeColumn = toSnakeCase(column);

        if (!IDENTIFIER_PATTERN.test(snakeColumn)) {
            throw new Error(`Invalid ${context}: ${column}`);
        }

        if (snakeColumn.length > MAX_IDENTIFIER_LENGTH) {
            throw new Error(`${context} too long: ${column}`);
        }

        // Şema yüklendiyse kolonun gerçekten var olduğunu da doğrula: yazım
        // hatası eskiden ham SQLite hatası olarak derinlerde patlıyordu.
        // (Cache boşsa doğrulama atlanır — bkz. loadTableColumns.)
        if (this.tableColumnCache?.size && !this.tableColumnCache.has(snakeColumn)) {
            throw new Error(
                `Invalid ${context}: '${column}' — '${this.tableName}' tablosunda böyle bir kolon yok.`
            );
        }

        return snakeColumn;
    }

    protected validateDirection(direction: string): SortDirection {
        const upper = direction.toUpperCase();

        if (upper !== 'ASC' && upper !== 'DESC') {
            throw new Error(`Invalid sort direction: ${direction}`);
        }

        return upper;
    }

    private validateLimit(limit: number): number {
        if (!Number.isInteger(limit) || limit < 1) {
            throw new Error(`Invalid limit: ${limit} (1..${MAX_LIMIT} arası tamsayı bekleniyor)`);
        }
        if (limit > MAX_LIMIT) {
            throw new Error(`limit ${limit} üst sınırı (${MAX_LIMIT}) aşıyor; paginate() kullan.`);
        }
        return limit;
    }

    private validateOffset(offset: number): number {
        if (!Number.isInteger(offset) || offset < 0) {
            throw new Error(`Invalid offset: ${offset}`);
        }
        return offset;
    }

    // ========== Timestamps ==========

    protected get hasCreatedAt(): boolean {
        return typeof this.timestamps === 'boolean'
            ? this.timestamps
            : this.timestamps.createdAt !== false;
    }

    protected get hasUpdatedAt(): boolean {
        return typeof this.timestamps === 'boolean'
            ? this.timestamps
            : this.timestamps.updatedAt !== false;
    }
}

/**
 * SQL identifier'ı tırnaklar. `order`, `group`, `index` gibi SQLite rezerve
 * kelimeleri `validateIdentifier`'ın regex'inden geçiyor ama tırnaksız
 * kullanıldığında syntax hatası veriyordu.
 *
 * Yalnızca `validateIdentifier`/`tableName` doğrulamasından geçmiş adlarla
 * çağrılır; içerik `[a-z][a-z0-9_]*` olduğu için kaçış gerekmez.
 */
function q(identifier: string): string {
    return `"${identifier}"`;
}

function isPinnableValue(value: unknown): boolean {
    return value !== null && value !== undefined && typeof value !== 'object';
}
