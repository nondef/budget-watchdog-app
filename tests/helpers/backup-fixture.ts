import type { BackupFile, BackupTableName } from '@/infrastructure/services/backup.service'

const tables: BackupTableName[] = [
  'currencies', 'categories', 'app_settings', 'exchange_rates', 'accounts',
  'budgets', 'saving_goals', 'transactions', 'transaction_budget_effects',
  'saving_goal_contributions', 'budget_categories', 'budget_daily_spent',
]

/** Complete format fixture; only tables not yet introduced may be absent. */
export function backupFixture(
  overrides: Partial<BackupFile['data']> = {}, version = 5,
): BackupFile {
  const introduced: Partial<Record<BackupTableName, number>> = {
    budget_categories: 2, transaction_budget_effects: 3, saving_goal_contributions: 5,
  }
  const data = Object.fromEntries(tables
    .filter(table => version >= (introduced[table] ?? 1))
    .map(table => [table, overrides[table] ?? []])) as BackupFile['data']
  return {
    app: 'budget-watchdog', version, exportedAt: '2026-09-09T10:00:00.000Z',
    meta: { rowCounts: Object.fromEntries(Object.entries(data).map(([table, rows]) => [table, rows.length])) },
    data,
  }
}
