import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `exportToFile`ın NATIVE dalı — hangi klasöre yazıldığı ve paylaşımın nasıl
 * tetiklendiği.
 *
 * Bu dal yalnızca cihazda çalıştığı için tarayıcıda hiç görülemiyor; şifresiz
 * finansal geçmişin public klasöre yazılıp yazılmadığı da tam burada
 * belirleniyor. Capacitor eklentileri mock'lanarak dosya sisteminin ne
 * gördüğü doğrulanır.
 */

const writeFile = vi.fn()
const share = vi.fn()
const canShare = vi.fn()

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true },
}))

vi.mock('@capacitor/filesystem', () => ({
    Filesystem: { writeFile: (...args: unknown[]) => writeFile(...args) },
    Directory: {
        Documents: 'DOCUMENTS',
        Cache: 'CACHE',
        External: 'EXTERNAL',
    },
    Encoding: { UTF8: 'utf8' },
}))

vi.mock('@capacitor/share', () => ({
    Share: {
        canShare: (...args: unknown[]) => canShare(...args),
        share: (...args: unknown[]) => share(...args),
    },
}))

vi.mock('@capacitor/preferences', () => ({
    Preferences: { clear: vi.fn() },
}))

vi.mock('@ionic/vue', () => ({
    alertController: { create: vi.fn() },
    toastController: { create: vi.fn(async () => ({ present: vi.fn() })) },
}))

vi.mock('@/infrastructure/services/backup.service', () => ({
    backupService: {
        exportToJson: vi.fn(async () => '{"app":"budget-watchdog"}'),
    },
    PassphraseRequiredError: class extends Error {},
}))

vi.mock('@/i18n', () => ({
    i18n: { global: { t: (key: string) => key } },
}))

const loadUseBackup = async () => (await import('@/composables/features/useBackup')).useBackup()

describe('Dışa aktarma hedefi (native)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        canShare.mockResolvedValue({ value: true })
        share.mockResolvedValue(undefined)
    })

    it("'share' hedefi public klasöre HİÇ yazmaz, cache kullanır", async () => {
        writeFile.mockResolvedValue({ uri: 'file:///cache/backup.json' })

        const { exportToFile } = await loadUseBackup()
        const location = await exportToFile(undefined, 'share')

        expect(writeFile).toHaveBeenCalledTimes(1)
        expect(writeFile.mock.calls[0][0]).toMatchObject({ directory: 'CACHE' })
        // Public Documents denenmemeli: şifresiz dosya oraya hiç düşmemeli.
        expect(writeFile.mock.calls.some(c => c[0].directory === 'DOCUMENTS')).toBe(false)
        expect(location).toEqual({ uri: 'file:///cache/backup.json', scope: 'share' })
    })

    it("varsayılan hedef Documents'a yazar", async () => {
        writeFile.mockResolvedValue({ uri: 'file:///documents/backup.json' })

        const { exportToFile } = await loadUseBackup()
        const location = await exportToFile()

        expect(writeFile.mock.calls[0][0]).toMatchObject({ directory: 'DOCUMENTS' })
        expect(location?.scope).toBe('documents')
    })

    it("Documents yazılamazsa uygulama klasörüne düşer", async () => {
        writeFile
            .mockRejectedValueOnce(new Error('scoped storage'))
            .mockResolvedValueOnce({ uri: 'file:///external/backup.json' })

        const { exportToFile } = await loadUseBackup()
        const location = await exportToFile()

        expect(writeFile.mock.calls[1][0]).toMatchObject({ directory: 'EXTERNAL' })
        expect(location?.scope).toBe('app')
    })

    it("'share' sonucu doğrudan paylaşım sheet'ini açar", async () => {
        const { presentExportResult } = await loadUseBackup()

        await presentExportResult({ uri: 'file:///cache/x.json', scope: 'share' }, { webMessage: 'web' })

        expect(share).toHaveBeenCalledTimes(1)
        expect(share.mock.calls[0][0]).toMatchObject({ url: 'file:///cache/x.json' })
    })

    it('paylaşım açılamazsa kullanıcıya bildirilir', async () => {
        canShare.mockResolvedValue({ value: false })
        const { toastController } = await import('@ionic/vue')

        const { presentExportResult } = await loadUseBackup()
        await presentExportResult({ uri: 'file:///cache/x.json', scope: 'share' }, { webMessage: 'web' })

        expect(share).not.toHaveBeenCalled()
        // Dosya erişilemez bir yerde: sessiz kalmak kullanıcıyı boşta bırakırdı.
        expect(toastController.create).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'backup.share.unavailable' })
        )
    })
it('kullanıcı paylaşmaktan vazgeçerse dosyanın saklanmadığı söylenir', async () => {
        // Android sheet kapatılınca hata fırlatır. Sessiz kalmak, kullanıcıyı
        // "yedeğim var" sanısıyla bırakırdı — dosya cache'te ve kalıcı değil.
        share.mockRejectedValue(new Error('cancelled'))
        const { toastController } = await import('@ionic/vue')

        const { presentExportResult } = await loadUseBackup()
        await presentExportResult(
            { uri: 'file:///cache/x.json', scope: 'share' },
            { webMessage: 'web', notSharedMessage: 'backup.share.backupNotKept' }
        )

        expect(toastController.create).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'backup.share.backupNotKept' })
        )
    })

    it('iptal mesajı verilmezse genel "saklanmadı" metnine düşer', async () => {
        share.mockRejectedValue(new Error('cancelled'))
        const { toastController } = await import('@ionic/vue')

        const { presentExportResult } = await loadUseBackup()
        await presentExportResult({ uri: 'file:///cache/x.json', scope: 'share' }, { webMessage: 'web' })

        expect(toastController.create).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'backup.share.notKept' })
        )
    })
})
