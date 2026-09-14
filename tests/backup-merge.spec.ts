import { beforeEach, describe, expect, it, vi } from 'vitest'
import { backupFixture } from './helpers/backup-fixture'

const state = vi.hoisted(() => ({ getInstance: vi.fn() }))
vi.mock('@/infrastructure/database/database-factory', () => ({
    DatabaseFactory: { getInstance: state.getInstance },
}))
const { BackupService } = await import('@/infrastructure/services/backup.service')

describe('Unsafe backup merge is disabled', () => {
    beforeEach(() => { state.getInstance.mockClear() })

    it('direct callers cannot reach the database with merge', async () => {
        await expect(new BackupService().applyBackup(backupFixture(), 'merge'))
            .rejects.toThrow('birleştirme kapalı')
        expect(state.getInstance).not.toHaveBeenCalled()
    })

    it('JSON import cannot bypass the merge restriction', async () => {
        await expect(new BackupService().import(JSON.stringify(backupFixture()), 'merge'))
            .rejects.toThrow('birleştirme kapalı')
        expect(state.getInstance).not.toHaveBeenCalled()
    })

    it('an unknown runtime mode cannot accidentally restore data', async () => {
        await expect(new BackupService().applyBackup(backupFixture(), 'unknown' as never))
            .rejects.toThrow()
        expect(state.getInstance).not.toHaveBeenCalled()
    })
})
