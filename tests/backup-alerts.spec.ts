import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createAlert, wipeAll, clearDeviceStorage } = vi.hoisted(() => ({
  createAlert: vi.fn(),
  wipeAll: vi.fn(),
  clearDeviceStorage: vi.fn(),
}))

vi.mock('@ionic/vue', () => ({
  alertController: { create: createAlert },
  toastController: {
    create: vi.fn(async () => ({
      present: vi.fn(),
      dismiss: vi.fn(async () => true),
      onDidDismiss: vi.fn(() => new Promise(() => {})),
    })),
  },
}))

vi.mock('@/infrastructure/services/backup.service', () => ({
  backupService: { wipeAll },
  PassphraseRequiredError: class extends Error {},
}))

vi.mock('@/infrastructure/services/backup-file-storage', () => ({
  clearDeviceStorage,
  buildBackupFileName: vi.fn(),
  pickBackupFile: vi.fn(),
  readFileAsText: vi.fn(),
  saveBackupFile: vi.fn(),
  shareBackupFile: vi.fn(),
  FileReadError: class extends Error {},
}))

vi.mock('@/i18n', () => ({
  i18n: { global: { t: (key: string) => key === 'backup.wipe.confirmWord' ? 'RESET' : key } },
}))

import { useBackup } from '@/composables/features/useBackup'

function queueDismissal(role: string, values?: Record<string, string>) {
  const present = vi.fn().mockResolvedValue(undefined)
  createAlert.mockResolvedValueOnce({
    present,
    dismiss: vi.fn().mockResolvedValue(true),
    onDidDismiss: vi.fn().mockResolvedValue({ role, data: { values } }),
  })
  return present
}

describe('Backup dialogs through useAlert', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    wipeAll.mockResolvedValue(undefined)
    clearDeviceStorage.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('does not open the final prompt or wipe after cancelling the first step', async () => {
    queueDismissal('cancel')
    expect(await useBackup().confirmAndWipe()).toBe('cancelled')
    expect(createAlert).toHaveBeenCalledTimes(1)
    expect(wipeAll).not.toHaveBeenCalled()
  })

  it.each(['cancel', 'backdrop', 'replaced'])('does not wipe when the final prompt closes with %s', async role => {
    queueDismissal('confirm')
    queueDismissal(role, { confirmText: 'RESET' })
    expect(await useBackup().confirmAndWipe()).toBe('cancelled')
    expect(wipeAll).not.toHaveBeenCalled()
    expect(clearDeviceStorage).not.toHaveBeenCalled()
  })

  it('rejects incorrect confirmation text', async () => {
    queueDismissal('confirm')
    queueDismissal('destructive', { confirmText: 'wrong' })
    expect(await useBackup().confirmAndWipe()).toBe('mismatch')
    expect(wipeAll).not.toHaveBeenCalled()
  })

  it('preserves the styled native input and wipes only after both confirmations', async () => {
    const presentIntent = queueDismissal('confirm')
    const presentFinal = queueDismissal('destructive', { confirmText: ' reset ' })
    expect(await useBackup().confirmAndWipe()).toBe('done')
    expect(presentIntent).toHaveBeenCalledTimes(1)
    expect(presentFinal).toHaveBeenCalledTimes(1)
    expect(createAlert.mock.calls[1][0]).toMatchObject({
      cssClass: 'backup-wipe-confirm',
      inputs: [expect.objectContaining({
        name: 'confirmText',
        type: 'text',
        attributes: expect.objectContaining({ inputmode: 'text', enterkeyhint: 'done' }),
      })],
    })
    expect(wipeAll).toHaveBeenCalledTimes(1)
    expect(clearDeviceStorage).toHaveBeenCalledTimes(1)
  })
})
