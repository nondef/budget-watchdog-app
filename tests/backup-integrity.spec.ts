import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BackupFile } from '@/infrastructure/services/backup.service'
import { SqlJsTestAdapter } from './helpers/sqljs-adapter'
import { migrations } from '@/infrastructure/database/migrations'
import { SqliteUnitOfWork } from '@/infrastructure/database/unit-of-work'
import { getTransactionCoordinator } from '@/infrastructure/database/transaction-coordinator'
import { READ_PAGE_SIZE, BATCH_CHUNK_SIZE } from '@/infrastructure/database/batch'

const holder = vi.hoisted(() => ({ db: null as unknown as SqlJsTestAdapter }))
vi.mock('@/infrastructure/database/database-factory', () => ({
  DatabaseFactory: { getInstance: () => holder.db },
}))
const { BackupService } = await import('@/infrastructure/services/backup.service')

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

describe('Backup integrity with the full application schema', () => {
  let db: SqlJsTestAdapter
  let service: InstanceType<typeof BackupService>

  async function insertExpense(id: string, amount = 100) {
    await db.run(`INSERT INTO transactions
      (id, account_id, category_id, currency_id, title, amount, date, type)
      VALUES (?, 'a1', 'cat1', 'try', 'Food', ?, '2026-09-09T10:00:00.000Z', 'expense')`, [id, amount])
  }

  beforeEach(async () => {
    db = await SqlJsTestAdapter.create()
    holder.db = db
    for (const migration of migrations) await migration.up(db)
    await db.run("INSERT INTO currencies (id, code, name, symbol, country) VALUES ('try', 'TRY', 'Lira', 'TL', 'TR')")
    await db.run("INSERT INTO categories (id, name, type) VALUES ('cat1', 'Food', 'expense')")
    await db.run(`INSERT INTO accounts (id, currency_id, name, type, balance, color, icon)
      VALUES ('a1', 'try', 'Cash', 'cash', 900, 'blue', 'wallet')`)
    await insertExpense('t1')
    service = new BackupService()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await db.close()
  })

  it('rejects old backup merge without changing the newer balance or history', async () => {
    const old = await service.export()
    await new SqliteUnitOfWork(db).run(async () => {
      await insertExpense('t2')
      await db.run("UPDATE accounts SET balance = 800 WHERE id = 'a1'")
    })
    const current = await service.export()
    await expect(service.import(JSON.stringify(old), 'merge')).rejects.toThrow('birleştirme kapalı')
    expect((await service.export()).data).toEqual(current.data)
    expect(current.data.accounts[0].balance).toBe(800)
    expect(current.data.transactions).toHaveLength(2)
  })

  const malformed: [string, (backup: BackupFile) => void][] = [
    ['missing transactions', b => { delete (b.data as Partial<BackupFile['data']>).transactions }],
    ['wrong table type', b => { (b.data as unknown as Record<string, unknown>).transactions = {} }],
    ['missing row counts', b => { delete b.meta.rowCounts.transactions }],
    ['wrong row counts', b => { b.meta.rowCounts.transactions = 0 }],
    ['null row', b => { b.data.transactions[0] = null as never }],
    ['array row', b => { b.data.transactions[0] = [] as never }],
    ['empty row', b => { b.data.transactions[0] = {} }],
    ['nested value', b => { b.data.transactions[0].amount = { value: 100 } }],
    ['unknown column', b => { b.data.accounts[0].unsupported = 'must not disappear' }],
    ['missing identity', b => { delete b.data.accounts[0].id }],
    ['missing balance', b => { delete b.data.accounts[0].balance }],
    ['incomplete recovery backup', b => { b.meta.skippedTables = ['transactions'] }],
    ['invalid version', b => { b.version = 0 }],
    ['fractional version', b => { b.version = 1.5 }],
    ['future version', b => { b.version = 999 }],
  ]

  it.each(malformed)('rejects %s before deleting local data', async (_name, corrupt) => {
    const current = await service.export()
    const broken = structuredClone(current)
    corrupt(broken)
    const execute = vi.spyOn(db, 'execute')
    await expect(service.import(JSON.stringify(broken))).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
    expect((await service.export()).data).toEqual(current.data)
  })

  it('validates direct applyBackup callers too', async () => {
    const current = await service.export()
    const broken = structuredClone(current)
    delete (broken.data as Partial<BackupFile['data']>).transactions
    await expect(service.applyBackup(broken)).rejects.toThrow('transactions')
    expect((await service.export()).data).toEqual(current.data)
  })

  it('rolls back every earlier chunk when a later foreign key fails', async () => {
    const current = await service.export()
    const broken = structuredClone(current)
    broken.data.transactions = Array.from({ length: BATCH_CHUNK_SIZE + 1 }, (_, index) => ({
      ...current.data.transactions[0], id: `new-${index}`,
      account_id: index === BATCH_CHUNK_SIZE ? 'missing-account' : 'a1',
    }))
    broken.meta.rowCounts.transactions = broken.data.transactions.length
    const batches = vi.spyOn(db, 'executeBatch')
    await expect(service.applyBackup(broken)).rejects.toThrow()
    expect(batches.mock.calls.filter(([rows]) => rows[0].sql.includes('INTO transactions'))).toHaveLength(2)
    expect((await service.export()).data).toEqual(current.data)
  })

  it('restores a valid encrypted backup exactly', async () => {
    const original = await service.export()
    const json = await service.exportToJson(false, 'restore-password')
    await new SqliteUnitOfWork(db).run(async () => {
      await insertExpense('t2')
      await db.run("UPDATE accounts SET balance = 800 WHERE id = 'a1'")
    })
    await service.import(json, 'replace', 'restore-password')
    expect((await service.export()).data).toEqual(original.data)
  })

  it.each(['commit', 'rollback'])('snapshot waits for an earlier writer to %s', async outcome => {
    const entered = deferred()
    const release = deferred()
    const writer = new SqliteUnitOfWork(db).run(async () => {
      await insertExpense('t2')
      entered.resolve()
      await release.promise
      if (outcome === 'rollback') throw new Error('interrupted write')
      await db.run("UPDATE accounts SET balance = 800 WHERE id = 'a1'")
    }).catch(error => error)
    await entered.promise
    const query = vi.spyOn(db, 'query')
    const exporting = service.export()
    try {
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(query).not.toHaveBeenCalled()
    } finally {
      release.resolve()
    }
    await writer
    const backup = await exporting
    expect(backup.data.accounts[0].balance).toBe(outcome === 'commit' ? 800 : 900)
    expect(backup.data.transactions).toHaveLength(outcome === 'commit' ? 2 : 1)
    await service.applyBackup(backup)
    expect((await service.export()).data).toEqual(backup.data)
  })

  it('repository writes wait through every page of the snapshot', async () => {
    for (let i = 0; i < READ_PAGE_SIZE; i++) await insertExpense(`page-${i}`, 1)
    await db.run('UPDATE accounts SET balance = balance - ?', [READ_PAGE_SIZE])
    const entered = deferred()
    const release = deferred()
    const rawQuery = db.query.bind(db)
    vi.spyOn(db, 'query').mockImplementation(async (sql, params = []) => {
      const result = await rawQuery(sql, params)
      if (sql.includes('SELECT * FROM transactions') && params[1] === 0) {
        entered.resolve()
        await release.promise
      }
      return result
    })
    const exporting = service.export()
    await entered.promise
    const mutation = vi.fn(async () => {
      await db.run("DELETE FROM transactions WHERE id = 'page-0'")
      await db.run('UPDATE accounts SET balance = balance + 1')
    })
    // join() is the same boundary used by repository writes, not just UoW.
    const writing = getTransactionCoordinator(db).join(mutation)
    try {
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(mutation).not.toHaveBeenCalled()
    } finally {
      release.resolve()
    }
    const backup = await exporting
    await writing
    expect(backup.data.transactions).toHaveLength(READ_PAGE_SIZE + 1)
    expect(new Set(backup.data.transactions.map(row => row.id)).size).toBe(READ_PAGE_SIZE + 1)
    expect(backup.data.accounts[0].balance).toBe(900 - READ_PAGE_SIZE)
    const live = await service.export()
    expect(live.data.transactions).toHaveLength(READ_PAGE_SIZE)
    expect(live.data.accounts[0].balance).toBe(901 - READ_PAGE_SIZE)
  })

  it('rejects a snapshot inside a foreign transaction instead of exporting uncommitted data', async () => {
    await db.beginTransaction()
    await insertExpense('not-committed')
    await expect(service.export()).rejects.toThrow('devam eden bir işlem')
    expect(await db.isTransactionActive()).toBe(true)
    await db.rollbackTransaction()
    expect((await service.export()).data.transactions).toHaveLength(1)
  })

  it('releases the snapshot after a read failure so writers can continue', async () => {
    const rawQuery = db.query.bind(db)
    const spy = vi.spyOn(db, 'query').mockImplementation((sql, params) => {
      if (sql.includes('FROM transactions')) return Promise.reject(new Error('read failed'))
      return rawQuery(sql, params)
    })
    await expect(service.export()).rejects.toThrow('read failed')
    expect(await db.isTransactionActive()).toBe(false)
    spy.mockRestore()
    await new SqliteUnitOfWork(db).run(() => db.run("UPDATE accounts SET name = 'After failure'"))
    expect((await service.export()).data.accounts[0].name).toBe('After failure')
  })
})
