import { DatabaseFactory } from '@/infrastructure/database/database-factory'
import type { DatabaseAdapter } from '@/domain/interfaces/database-adapter'
import { logger } from '@/infrastructure/logging'
import { SqliteUnitOfWork } from '@/infrastructure/database/unit-of-work'
import { IUnitOfWork } from '@/domain'
import {
  decryptPayload,
  encryptPayload,
  type EncryptionEnvelope,
} from '@/shared/utils/crypto/backup-crypto'
import { getTransactionCoordinator } from '@/infrastructure/database/transaction-coordinator'
import { chunked, READ_PAGE_SIZE } from '@/infrastructure/database/batch'

/**
 * Backup dosya formatı (versionlu).
 * Şema değişirse VERSION'u arttır + migrateBackup() ekle.
 */
/**
 * v2: `budget_categories` junction tablosu eklendi. v1 yedeklerinde bu tablo
 * hiç yazılmadığı için geri yüklendiklerinde bütçeler kategorisiz kalır —
 * veri kaynakta yok, `migrateBackup` boş dizi ile güvenli hale getirir.
 */
/**
 * v4: parola ile şifrelenmiş yedek desteği. Zarf (`app`, `version`,
 * `exportedAt`, `encrypted`) DÜZ kalır ki import "bozuk dosya" yerine
 * "bu yedek şifreli, parolayı gir" diyebilsin; `meta` + `data` şifrelenir.
 * v1-v3 düz yedekler okunmaya devam eder.
 */
/**
 * v5: `saving_goal_contributions` hareket defteri eklendi. Eski yedeklerde
 * tablo yok; `migrateBackup` boş dizi ile güvenli hale getirir — geri
 * yüklenen hedefler toplam birikimini korur, yalnızca hareket geçmişi boş
 * kalır (kaynakta zaten yoktu).
 */
export const BACKUP_VERSION = 5
export const BACKUP_APP_ID = 'budget-watchdog'

/**
 * Foreign key bağımlılıklarına göre import sırası.
 * Parent tablolar önce yazılır.
 *
 * Bütçenin kategori bağları `budget_categories` junction tablosunda tutuluyor
 * (bkz. BudgetRepository.syncCategories). Liste dışında kaldığı sürece yedek
 * bu bağları hiç taşımıyordu: geri yüklenen bütçeler kategorisiz kalıyor,
 * dolayısıyla hiçbir harcamayla eşleşmiyordu. `CLEAR_ORDER` de tabloyu
 * atladığı için silinen bütçelere ait öksüz satırlar geride kalıyordu.
 */
const IMPORT_ORDER = [
  'currencies',
  'categories',
  'app_settings',
  'exchange_rates',
  'accounts',
  'budgets',
  'saving_goals',
  'transactions',
  'transaction_budget_effects',
  'saving_goal_contributions',
  'budget_categories',
  'budget_daily_spent',
] as const

/** Silme/temizleme sırası importun tersi (FK güvenli) */
const CLEAR_ORDER = [...IMPORT_ORDER].reverse()

export type BackupTableName = (typeof IMPORT_ORDER)[number]

export interface BackupFile {
  app: typeof BACKUP_APP_ID
  version: number
  exportedAt: string
  meta: {
    rowCounts: Record<string, number>
    /** Yalnızca kurtarma yedeğinde dolu: okunamadığı için boş bırakılan tablolar. */
    skippedTables?: string[]
  }
  data: Record<BackupTableName, Record<string, unknown>[]>
}

/** `BackupService.export` davranış anahtarları; varsayılanlar normal akış içindir. */
export interface ExportOptions {
  /**
   * Singleton yerine kullanılacak adapter.
   *
   * Kurtarma ekranı içindir: açılış patladığında `DatabaseFactory` singleton'ı
   * kapatılmış olur, ama kendi bağlantısını açıp (bkz.
   * `DatabaseFactory.openForRecovery`) veriyi yine de dışarı çıkarabilir.
   */
  db?: DatabaseAdapter
  /** Okunamayan tabloyu boş geçip devam et. Varsayılan: kapalı (hata fırlatır). */
  tolerateMissingTables?: boolean
}

/** Diskteki şifreli yedek. `data`/`meta` yerine tek bir şifreli blok taşır. */
export interface EncryptedBackupFile {
  app: typeof BACKUP_APP_ID
  version: number
  exportedAt: string
  encrypted: true
  encryption: EncryptionEnvelope
}

/** Şifreli bir yedek parola olmadan açılmaya çalışıldı. */
export class PassphraseRequiredError extends Error {
  constructor() {
    super('This backup is encrypted; a passphrase is required')
    this.name = 'PassphraseRequiredError'
  }
}

export type ImportMode = 'replace' | 'merge'

export interface ImportResult {
  importedTables: number
  importedRows: number
  skippedRows: number
  mode: ImportMode
}

interface TableSchema {
  columns: Set<string>
  requiredColumns: string[]
}

export class BackupService {
  /** Tablo → şemadan okunan kolon adları + PK kolonları. Yedek dosyasına güvenilmez. */
  private schemaCache = new Map<string, TableSchema>()

  private async tableSchema(db: DatabaseAdapter, table: BackupTableName): Promise<TableSchema> {
    const cached = this.schemaCache.get(table)
    if (cached) return cached

    const res = await db.query(`PRAGMA table_info(${table})`)
    const info = (res.rows ?? []) as {
      name?: unknown; pk?: unknown; notnull?: unknown; dflt_value?: unknown
    }[]

    const columns = new Set(
      info.map(row => String(row.name ?? '')).filter(Boolean)
    )

    // SQLite allows NULL in some TEXT PRIMARY KEY columns. Require identities
    // explicitly, plus mandatory fields without defaults. Financial totals
    // must never silently become their SQL default (usually zero).
    const totals: Partial<Record<BackupTableName, string[]>> = {
      accounts: ['balance'], budgets: ['amount', 'spent_amount'],
      saving_goals: ['target_amount', 'saved_amount'],
    }
    const requiredColumns = info
      .filter(row => Number(row.pk ?? 0) > 0
        || (Number(row.notnull ?? 0) > 0 && row.dflt_value == null)
        || totals[table]?.includes(String(row.name)))
      .map(row => String(row.name ?? ''))
      .filter(Boolean)

    // Şema okunamadıysa SESSİZCE geçme: kolon listesi boş kalırsa tablonun
    // tamamı atlanır ve import "başarılı" görünürken veri kaybolur — geri
    // yükleme akışında en kötü sonuç bu. Hata fırlatıp transaction'ı geri al.
    if (columns.size === 0) {
      throw new Error(`Şema okunamadı: "${table}" tablosunun kolonları alınamadı`)
    }

    const schema: TableSchema = { columns, requiredColumns }
    this.schemaCache.set(table, schema)

    return schema
  }

  private getDb(): DatabaseAdapter {
    return DatabaseFactory.getInstance() as unknown as DatabaseAdapter
  }

  private getUnitOfWork(db: DatabaseAdapter): IUnitOfWork {
    return new SqliteUnitOfWork(db)
  }

  /**
   * Tabloyu sayfalayarak okur.
   *
   * `SELECT * FROM t` bütün tabloyu tek seferde native köprüden geçiriyordu;
   * binlerce işlemi olan bir kurulumda bu tek paket, yedek ALMAYI da geri
   * yükleme kadar kırılgan yapıyordu.
   *
   * Sıra `rowid` üzerinden: bu şemadaki tabloların hepsi normal (WITHOUT ROWID
   * olmayan) tablolar ve `budget_categories` gibi birincil anahtarı olmayan
   * tabloda bile kararlı bir sıra verir. Sırasız OFFSET sayfalaması satır
   * atlayıp tekrarlayabilirdi — yedekte bu, sessiz veri kaybı demek.
   */
  private async readTablePaged(
    db: DatabaseAdapter,
    table: BackupTableName,
  ): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = []

    for (let offset = 0; ; offset += READ_PAGE_SIZE) {
      const res = await db.query(
        `SELECT * FROM ${table} ORDER BY rowid LIMIT ? OFFSET ?`,
        [READ_PAGE_SIZE, offset],
      )
      const page = (res.rows ?? []) as Record<string, unknown>[]

      rows.push(...page)

      if (page.length < READ_PAGE_SIZE) break
    }

    return rows
  }

  /** Tüm tablolardaki kayıtları okuyup BackupFile döndürür. */
  async export(options: ExportOptions = {}): Promise<BackupFile> {
    const db = options.db ?? this.getDb()
    return getTransactionCoordinator(db).snapshot(() => this.exportSnapshot(db, options))
  }

  private async exportSnapshot(db: DatabaseAdapter, options: ExportOptions): Promise<BackupFile> {
    const data = {} as BackupFile['data']
    const rowCounts: Record<string, number> = {}
    const skippedTables: string[] = []

    for (const table of IMPORT_ORDER) {
      let rows: Record<string, unknown>[]

      try {
        rows = await this.readTablePaged(db, table)
      } catch (error) {
        // Normal yolda okunamayan tablo HATA'dır: sessizce boş yedeklemek, veri
        // kaybını kullanıcı ancak geri yüklerken fark edeceği için en kötü
        // sonuç. Tolerans yalnızca kurtarma ekranında açılır — orada şema zaten
        // yarım olabilir ve eksik bir yedek, hiç yedek olmamasından iyidir.
        if (!options.tolerateMissingTables) throw error

        logger.warn(`Kurtarma yedeği: "${table}" tablosu okunamadı, atlanıyor`, {
          context: 'backupService',
          error,
        })
        skippedTables.push(table)
        rows = []
      }

      data[table] = rows
      rowCounts[table] = rows.length
    }

    return {
      app: BACKUP_APP_ID,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      meta: skippedTables.length ? { rowCounts, skippedTables } : { rowCounts },
      data,
    }
  }

  /** Backup'ı JSON string olarak verir (dosya yazma katmanı dışarıda). */
  /**
   * Backup'ı JSON string olarak verir (dosya yazma katmanı dışarıda).
   *
   * `passphrase` verilirse `meta` + `data` AES-GCM ile şifrelenir; zarf düz
   * kalır. Parola verilmezse düz yedek üretilir — çağıran taraf bunu
   * kullanıcıya açıkça sormalıdır (varsayılan şifrelidir).
   */
  async exportToJson(
    pretty = false,
    passphrase?: string,
    options: ExportOptions = {},
  ): Promise<string> {
    const backup = await this.export(options)
    const stringify = (value: unknown) =>
      pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)

    if (!passphrase) {
      return stringify(backup)
    }

    const { app, version, exportedAt, ...secret } = backup
    const encryption = await encryptPayload(JSON.stringify(secret), passphrase)

    const encrypted: EncryptedBackupFile = { app, version, exportedAt, encrypted: true, encryption }

    return stringify(encrypted)
  }

  /**
   * Dosya şifreli mi? UI, parola sormadan önce buna bakar. Zarf düz olduğu
   * için parolaya gerek yok.
   */
  isEncrypted(json: string): boolean {
    try {
      const parsed = JSON.parse(json)
      return !!parsed && typeof parsed === 'object' && parsed.encrypted === true
    } catch {
      return false
    }
  }

  /**
   * Tüm tablolardaki kayıtları siler. FK güvenli sırada çalışır.
   * Geri alınamaz — çağırmadan önce kullanıcıdan onay alın.
   */
  async wipeAll(): Promise<void> {
    const db = this.getDb()
    await this.getUnitOfWork(db).run(async () => {
      for (const table of CLEAR_ORDER) {
        await db.execute(`DELETE FROM ${table}`)
      }
    })
  }

  /**
   * JSON içeriğini parse eder, validate eder ve uygular.
   * - 'replace': mevcut veriyi siler ve backup'taki verilerle değiştirir.
   * - 'merge': disabled until aggregate-level conflict resolution is available.
   */
  async import(
    json: string,
    mode: ImportMode = 'replace',
    passphrase?: string
  ): Promise<ImportResult> {
    this.assertImportMode(mode)
    const parsed = await this.parseAndValidateAsync(json, passphrase)
    return this.applyBackup(parsed, mode)
  }

  /**
   * Şifreli/düz ayrımını yapıp doğrulanmış BackupFile döndürür.
   * Şifreli dosya parolasız gelirse `PassphraseRequiredError` fırlatır —
   * UI bunu yakalayıp parola sorar.
   */
  async parseAndValidateAsync(json: string, passphrase?: string): Promise<BackupFile> {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      throw new Error('Geçersiz JSON dosyası')
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Yedek dosyası okunamadı')
    }

    const candidate = parsed as Partial<EncryptedBackupFile>

    if (candidate.encrypted !== true) {
      return this.parseAndValidate(json)
    }

    if (candidate.app !== BACKUP_APP_ID) {
      throw new Error('Bu dosya bu uygulamaya ait bir yedek değil')
    }

    if (!passphrase) {
      throw new PassphraseRequiredError()
    }

    if (!candidate.encryption) {
      throw new Error('Yedek içeriği boş veya bozuk')
    }

    // Çözülen kısım yalnızca meta + data; zarf alanları dışarıda kaldığı için
    // geri birleştiriliyor ve ortak doğrulama/migration yolundan geçiyor.
    const secret = await decryptPayload(candidate.encryption, passphrase)

    return this.parseAndValidate(
      JSON.stringify({
        ...JSON.parse(secret),
        app: candidate.app,
        version: candidate.version,
        exportedAt: candidate.exportedAt,
      })
    )
  }

  /** Backup nesnesini doğrudan uygulamak için (parse edilmiş halde). */
  async applyBackup(backup: BackupFile, mode: ImportMode = 'replace'): Promise<ImportResult> {
    this.assertImportMode(mode)
    // Validate and detach the caller's object before waiting for the write queue.
    const source = this.validateAndMigrate(backup)
    const db = this.getDb()

    return this.getUnitOfWork(db).run(async () => {
      // Validate columns and identities before deleting any existing data.
      // No cached schema: recovery/reinitialization may use a different database.
      this.schemaCache.clear()
      for (const table of IMPORT_ORDER) {
        const rows = source.data[table]
        if (!rows.length) continue
        const schema = await this.tableSchema(db, table)
        for (const row of rows) {
          for (const key of Object.keys(row)) {
            if (!schema.columns.has(key)) {
              throw new Error(`Yedekte desteklenmeyen kolon: ${table}.${key}`)
            }
          }
          for (const key of schema.requiredColumns) {
            if (row[key] === null || row[key] === undefined || row[key] === '') {
              throw new Error(`Yedekte zorunlu alan eksik: ${table}.${key}`)
            }
          }
        }
      }

      // All deletes and inserts are in one transaction. A constraint failure
      // in any chunk rolls back to the complete original database.
      for (const table of CLEAR_ORDER) {
        await db.execute(`DELETE FROM ${table}`)
      }

      let importedRows = 0
      const skippedRows = 0
      let importedTables = 0

      for (const table of IMPORT_ORDER) {
        const rows = source.data[table] ?? []
        if (rows.length === 0) continue

        // Column names were checked against the database schema before deletion.
        const schema = await this.tableSchema(db, table)
        const allowed = schema.columns

        // Kolon kümesi BÜTÜN satırların birleşimidir, ilk satırın değil:
        // heterojen bir yedekte (elle düzenlenmiş ya da eski sürümden gelen)
        // `rows[0]`'da bulunmayan bir kolon tablo boyunca sessizce düşüyor,
        // üstelik `importedRows` yine tam sayıyı raporluyordu. Satırda
        // karşılığı olmayan kolon `normalizeValue(undefined)` ile NULL'a
        // düşer; kolon NOT NULL ise import sessizce eksik yazmak yerine
        // patlar ve transaction geri alınır.
        const seen = new Set<string>()
        const columns: string[] = []
        for (const row of rows) {
          for (const key of Object.keys(row)) {
            if (seen.has(key) || !allowed.has(key)) continue
            seen.add(key)
            columns.push(key)
          }
        }

        if (columns.length === 0) {
          throw new Error(`Yedekte boş kayıt: ${table}`)
        }

        const placeholders = columns.map(() => '?').join(', ')
        const colList = columns.map((c) => `"${c}"`).join(', ')

        const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`

        const statements = rows.map((row) => ({
          sql,
          params: columns.map((c) => this.normalizeValue(row[c])),
        }))

        try {
          // Dilimlenir: tüm tablo tek `executeBatch`'te gönderilince binlerce
          // satırlık JSON tek paket halinde native köprüden geçiyor ve düşük
          // RAM'li cihazlarda geri yükleme ANR/OOM ile düşüyordu. Seeder aynı
          // sınırı zaten uyguluyordu (bkz. database/batch.ts).
          //
          // Atomiklik etkilenmez: dilimlerin hepsi çağıranın açtığı TEK
          // transaction sınırının içinde koşar, biri patlarsa tamamı geri alınır.
          for (const chunk of chunked(statements)) {
            await db.executeBatch(chunk)
          }

          importedRows += rows.length
          importedTables += 1
        } catch (err) {
          // Bir tabloda hata olursa rollback için tekrar fırlat
          logger.error(`Import failed for table "${table}"`, { context: 'backupService', error: err })
          throw err
        }
      }

      return { importedTables, importedRows, skippedRows, mode }
    })
  }

  /** JSON içeriği geçerli bir backup mı? Değilse hata fırlat. */
  parseAndValidate(json: string): BackupFile {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      throw new Error('Geçersiz JSON dosyası')
    }

    return this.validateAndMigrate(parsed)
  }

  private assertImportMode(mode: ImportMode): void {
    if (mode !== 'replace') {
      throw new Error('Veri bütünlüğünü korumak için yedek birleştirme kapalı. Tam geri yüklemeyi kullanın.')
    }
  }

  private validateAndMigrate(value: unknown): BackupFile {
    const isRecord = (item: unknown): item is Record<string, unknown> =>
      item !== null && typeof item === 'object' && !Array.isArray(item)

    if (!isRecord(value) || value.app !== BACKUP_APP_ID) {
      throw new Error('Bu dosya bu uygulamaya ait bir yedek değil')
    }
    const version = value.version
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      throw new Error('Geçersiz yedek sürümü')
    }
    if (version > BACKUP_VERSION) {
      throw new Error('Bu yedek daha yeni bir uygulama sürümünden. Lütfen uygulamayı güncelleyin.')
    }
    if (typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt))) {
      throw new Error('Yedek tarihi eksik veya geçersiz')
    }
    if (!isRecord(value.data) || !isRecord(value.meta) || !isRecord(value.meta.rowCounts)) {
      throw new Error('Yedek içeriği veya kayıt sayıları eksik')
    }
    const skipped = value.meta.skippedTables
    if (skipped !== undefined && (!Array.isArray(skipped) || skipped.length > 0)) {
      throw new Error('Bu kurtarma yedeği eksik tablolar içeriyor; tam geri yükleme yapılamaz.')
    }

    for (const table of Object.keys(value.data)) {
      if (!(IMPORT_ORDER as readonly string[]).includes(table)) {
        throw new Error(`Yedekte desteklenmeyen tablo: ${table}`)
      }
    }

    // Only tables introduced AFTER the source format version may be absent.
    const introduced: Partial<Record<BackupTableName, number>> = {
      budget_categories: 2,
      transaction_budget_effects: 3,
      saving_goal_contributions: 5,
    }
    const data = {} as BackupFile['data']
    const rowCounts: Record<string, number> = {}
    for (const table of IMPORT_ORDER) {
      const rows = value.data[table]
      const count = value.meta.rowCounts[table]
      if (rows === undefined && version < (introduced[table] ?? 1)) {
        if (count !== undefined && count !== 0) {
          throw new Error(`Yedekte kayıt sayısı uyuşmuyor: ${table}`)
        }
        data[table] = []
        rowCounts[table] = 0
        continue
      }
      if (!Array.isArray(rows)) {
        throw new Error(`Yedekte tablo eksik veya geçersiz: ${table}`)
      }
      if (!Number.isSafeInteger(count) || count !== rows.length) {
        throw new Error(`Yedekte kayıt sayısı uyuşmuyor: ${table}`)
      }
      data[table] = rows.map(row => {
        if (!isRecord(row) || Object.keys(row).length === 0) {
          throw new Error(`Yedekte geçersiz kayıt: ${table}`)
        }
        for (const cell of Object.values(row)) {
          if (cell !== null && typeof cell !== 'string' && typeof cell !== 'boolean'
            && !(typeof cell === 'number' && Number.isFinite(cell))) {
            throw new Error(`Yedekte geçersiz alan: ${table}`)
          }
        }
        return { ...row }
      })
      rowCounts[table] = rows.length
    }

    return this.migrateBackup({
      app: BACKUP_APP_ID, version, exportedAt: value.exportedAt,
      meta: { rowCounts }, data,
    })
  }

  /** Transform only known older formats; structural validation already ran. */
  private migrateBackup(backup: BackupFile): BackupFile {
    const data = { ...backup.data }

    if (backup.version < 3) {
      const budgets = data.budgets

      for (const budget of budgets) {
        if (!budget.period_start) {
          budget.period_start = this.inferPeriodStart(budget)
        }
      }

      const categoriesByBudget = new Map<string, Set<string>>()
      for (const relation of data.budget_categories) {
        const budgetId = String(relation.budget_id ?? '')
        const categoryId = String(relation.category_id ?? '')
        if (!budgetId || !categoryId) continue
        const ids = categoriesByBudget.get(budgetId) ?? new Set<string>()
        ids.add(categoryId)
        categoriesByBudget.set(budgetId, ids)
      }

      data.transaction_budget_effects = data.transactions.flatMap(transaction => {
        if (transaction.type !== 'expense') return []

        const occurredAt = new Date(String(transaction.date))

        return budgets.flatMap(budget => {
          const periodStart = budget.period_start
            ? new Date(String(budget.period_start))
            : null
          const periodEnd = budget.next_reset_date
            ? new Date(String(budget.next_reset_date))
            : null
          const categories = categoriesByBudget.get(String(budget.id))
          const matches =
            periodStart &&
            String(budget.account_id) === String(transaction.account_id) &&
            String(budget.currency_id) === String(transaction.currency_id) &&
            categories?.has(String(transaction.category_id)) &&
            occurredAt >= periodStart &&
            (!periodEnd || occurredAt < periodEnd)

          return matches
            ? [{
                transaction_id: transaction.id,
                budget_id: budget.id,
                period_start: periodStart.toISOString(),
                amount: transaction.amount,
                currency_id: transaction.currency_id,
                occurred_at: transaction.date,
              }]
            : []
        })
      })
    }

    const rowCounts = Object.fromEntries(IMPORT_ORDER.map(table => [table, data[table].length]))
    return { ...backup, version: BACKUP_VERSION, meta: { rowCounts }, data }
  }

  private inferPeriodStart(budget: Record<string, unknown>): unknown {
    if (budget.type === 'once' || !budget.next_reset_date) {
      return budget.last_reset_date ?? budget.start_date ?? null
    }

    const previous = new Date(String(budget.next_reset_date))

    switch (budget.type) {
      case 'daily':
        previous.setDate(previous.getDate() - 1)
        break
      case 'weekly':
        previous.setDate(previous.getDate() - 7)
        break
      case 'monthly':
        previous.setMonth(previous.getMonth() - 1)
        break
      case 'yearly':
        previous.setFullYear(previous.getFullYear() - 1)
        break
    }

    return previous.toISOString()
  }

  /** SQLite boolean / undefined / Date normalizasyonu */
  private normalizeValue(value: unknown): unknown {
    if (value === undefined) return null
    if (value === null) return null
    if (typeof value === 'boolean') return value ? 1 : 0
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'object') return JSON.stringify(value)
    return value
  }
}

export const backupService = new BackupService()
