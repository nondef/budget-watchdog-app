import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Bildirim kanallarının Android'de nasıl kurulduğu.
 *
 * Kritik nokta: Android `importance` değerini YALNIZCA kanal ilk kez
 * oluşturulurken okur. Var olan bir kanalı aynı kimlikle yeniden oluşturmak
 * importance'ı değiştirmez — bu yüzden heads-up'a geçirilen kanalın kimliği
 * değişmek (`goal_alerts` → `goal_alerts_v2`) ve eskisi silinmek zorunda.
 * Kimlik yanlışlıkla eski haline dönerse mevcut kurulumlarda banner sessizce
 * kaybolur ve bunu yalnızca kullanıcı fark eder.
 */

const createChannel = vi.fn()
const deleteChannel = vi.fn()

vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
    },
}))

vi.mock('@capacitor/local-notifications', () => ({
    LocalNotifications: {
        createChannel: (...args: unknown[]) => createChannel(...args),
        deleteChannel: (...args: unknown[]) => deleteChannel(...args),
    },
}))

vi.mock('@/i18n', () => ({
    t: (key: string) => key,
    i18n: { global: { t: (key: string) => key } },
}))

vi.mock('@/stores/notifications', () => ({
    useNotificationsStore: () => ({ prefs: {} }),
}))

const loadNotifier = async () => await import('@/composables/features/useNotifier')

describe('Bildirim kanalları', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        createChannel.mockResolvedValue(undefined)
        deleteChannel.mockResolvedValue(undefined)
    })

    it('hedef kanalı heads-up (importance 4) ve YENİ kimlikle kurulur', async () => {
        const { ensureChannels, CHANNEL_IDS } = await loadNotifier()
        await ensureChannels()

        expect(CHANNEL_IDS.goalAlerts).toBe('goal_alerts_v2')

        const goal = createChannel.mock.calls
            .map(c => c[0])
            .find(ch => ch.id === 'goal_alerts_v2')

        expect(goal).toMatchObject({ importance: 4, vibration: true })
    })

    it('emekli kanal silinir ve yeniden oluşturulmaz', async () => {
        const { ensureChannels } = await loadNotifier()
        await ensureChannels()

        expect(deleteChannel).toHaveBeenCalledWith({ id: 'goal_alerts' })
        expect(createChannel.mock.calls.some(c => c[0].id === 'goal_alerts')).toBe(false)
    })

    it('tüm kanallar heads-up (importance 4) kurulur', async () => {
        const { ensureChannels, CHANNEL_IDS } = await loadNotifier()
        await ensureChannels()

        const byId = Object.fromEntries(
            createChannel.mock.calls.map(c => [c[0].id, c[0]])
        )

        // Cüzdan hatırlatıcısı da 4: importance 3'ten 4'e çıkarıldığı için
        // kimliği `wallet_reminder_v2` oldu ve eskisi emekliye ayrıldı
        // (bkz. CHANNEL_IDS yorumu). Test bir süre eski kimliği bekleyerek
        // bayat kalmıştı.
        expect(CHANNEL_IDS.walletReminder).toBe('wallet_reminder_v2')

        for (const id of Object.values(CHANNEL_IDS)) {
            expect(byId[id]?.importance).toBe(4)
        }

        expect(byId['wallet_reminder']).toBeUndefined()
    })

    it('yedek hatırlatıcısı kanalı kurulur', async () => {
        const { ensureChannels, CHANNEL_IDS } = await loadNotifier()
        await ensureChannels()

        expect(CHANNEL_IDS.backupReminder).toBe('backup_reminder')

        const backup = createChannel.mock.calls
            .map(c => c[0])
            .find(ch => ch.id === 'backup_reminder')

        // Hatırlatıcı hassas veri taşımadığı için kilit ekranında tam görünür.
        expect(backup).toMatchObject({ importance: 4, visibility: 1 })
    })

    it('emekli kanal yoksa (temiz kurulum) kurulum yine tamamlanır', async () => {
        deleteChannel.mockRejectedValue(new Error('channel not found'))

        const { ensureChannels, CHANNEL_IDS } = await loadNotifier()
        await ensureChannels()

        expect(createChannel).toHaveBeenCalledTimes(Object.keys(CHANNEL_IDS).length)
    })
})
