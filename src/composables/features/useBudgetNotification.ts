import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { useToast } from '@/composables/ui/useToast'
import { logger } from '@/infrastructure/logging'
import { t } from '@/i18n'
import { canSendOsNotification } from "@/composables/features/useNotifier";

const isNative = Capacitor.isNativePlatform()
let nextId = 1

const genId = () => (nextId++ % 2147483647)  // Android int sınırı
const budgetReminderId = (budgetId: string) =>
    Math.abs(
        budgetId
            .split('')
            .reduce(
                (acc, char) => ((acc << 5) - acc) + char.charCodeAt(0),
                0
            )
    ) % 2147483647

export function useBudgetNotification() {
    const toast = useToast()

    const requestPermission = async () => {
        if (isNative) {
            const { display } = await LocalNotifications.requestPermissions()
            return display  // 'granted' | 'denied' | 'prompt'
        }
        if (!('Notification' in window)) return 'unsupported'
        if (Notification.permission === 'default') {
            try { return await Notification.requestPermission() } catch { return 'denied' }
        }
        return Notification.permission
    }

    const showNow = async (
        title: string,
        body: string,
        extra?: Record<string, unknown>
    ) => {

        if (!canSendOsNotification('budget')) {
            return
        }

        if (isNative) {
            try {
                await LocalNotifications.schedule({
                    notifications: [{
                        id: genId(),
                        title,
                        body,
                        schedule: { at: new Date(Date.now() + 100) }, // anında
                        smallIcon: 'ic_stat_icon_config_sample',      // android için (opsiyonel)
                        extra
                    }]
                })
            } catch (e) { logger.warn('LocalNotifications failed', { context: 'useBudgetNotification', error: e }) }
            return
        }

        if ('Notification' in window && Notification.permission === 'granted') {
            try { new Notification(title, { body, icon: '/favicon.png' }) } catch { /* ignore */ }
        }
    }

    const notifyWarning = (budgetName: string, progress: number) => {
        const msg = t('budgets.alerts.warning', { name: budgetName, progress: Math.round(progress) })
        toast.warning(msg)
        void showNow(t('budgets.alerts.warningTitle'), msg, { budgetName, type: 'warning' })
    }

    const notifyExceeded = (budgetName: string) => {
        const msg = t('budgets.alerts.exceeded', { name: budgetName })
        toast.error(msg)
        void showNow(t('budgets.alerts.exceededTitle'), msg, { budgetName, type: 'exceeded' })
    }

    const notifyReset = (count: number) => {
        if (count <= 0) return
        // Native'de hiç bildirim üretme: `scheduleResetReminder` ile bütçe başına
        // zamanlanmış OS bildirimi aynı olayı (uygulama kapalıyken bile) zaten
        // haber veriyor. Buradaki toast, sıfırlama anında uygulama açıksa aynı
        // olayı ikinci kez gösteriyordu. Web'de zamanlanmış bildirim yok
        // (`scheduleResetReminder` erken dönüyor), orada tek haber kanalı toast.
        if (isNative) return

        toast.success(t('budgets.alerts.reset', { count }))
    }

    const scheduleResetReminder = async (budgetId: string, budgetName: string, at: Date) =>
        scheduleResetReminders([{ budgetId, budgetName, at }])

    /**
     * Birden çok hatırlatıcıyı **tek** köprü turunda kurar.
     *
     * Bütçe başına ayrı `cancel` + `schedule` çağırmak, N bütçede 2N sıralı
     * native round-trip demekti ve bu, bütçe listesinin render'ını bekletiyordu
     * (bkz. stores/budgets.ts `syncResetReminders`). `LocalNotifications` her
     * iki API'de de dizi kabul ediyor; toplu çağrıda maliyet 2 tura iniyor.
     *
     * @returns İşlem OS'a yansıdı mı. Çağıran bunu önbelleğe almadan önce
     *   kontrol etmeli; başarısız çağrıyı "uygulandı" saymak hatırlatıcıyı
     *   bütçe bir daha değişene kadar kurulmaz bırakırdı.
     */
    const scheduleResetReminders = async (
        items: { budgetId: string; budgetName: string; at: Date }[]
    ): Promise<boolean> => {
        if (!isNative || !items.length) return true

        // Geçmiş tarihe hatırlatıcı kurulmaz.
        const now = Date.now()
        const due = items.filter(item => item.at.getTime() > now)

        if (!due.length) return true

        try {
            // Android var olan bir id'yi yeniden schedule etmeyi güncelleme
            // saymıyor; önce toplu iptal.
            await LocalNotifications.cancel({
                notifications: due.map(item => ({ id: budgetReminderId(item.budgetId) }))
            })
            await LocalNotifications.schedule({
                notifications: due.map(item => ({
                    id: budgetReminderId(item.budgetId),
                    title: t('budgets.alerts.reminderTitle'),
                    body: t('budgets.alerts.reminder', { name: item.budgetName }),
                    schedule: { at: item.at, allowWhileIdle: true },
                    extra: { budgetId: item.budgetId, type: 'period-reset' }
                }))
            })

            return true
        } catch (e) {
            logger.warn('schedule failed', { context: 'useBudgetNotification', error: e })
            return false
        }
    }

    /** `scheduleResetReminders`'ın iptal karşılığı: tek turda N iptal. */
    const cancelResetReminders = async (budgetIds: string[]): Promise<boolean> => {
        if (!isNative || !budgetIds.length) return true

        try {
            await LocalNotifications.cancel({
                notifications: budgetIds.map(id => ({ id: budgetReminderId(id) }))
            })

            return true
        } catch (error) {
            logger.warn('cancel reset reminders failed', {
                context: 'useBudgetNotification',
                error
            })

            return false
        }
    }

    const cancelResetReminder = async (budgetId: string) => {
        if (!isNative) return

        try {
            await LocalNotifications.cancel({
                notifications: [{ id: budgetReminderId(budgetId) }]
            })
        } catch (error) {
            logger.warn('cancel reset reminder failed', {
                context: 'useBudgetNotification',
                error
            })
        }
    }

    return {
        requestPermission,
        notifyWarning,
        notifyExceeded,
        notifyReset,
        scheduleResetReminder,
        scheduleResetReminders,
        cancelResetReminder,
        cancelResetReminders
    }
}
