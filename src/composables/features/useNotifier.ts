import { Channel, LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { useNotificationsStore } from '@/stores/notifications';
import { logger } from "@/infrastructure/logging";
import { isBackupStale, isSnoozed, readLastExportAt, readStatus } from "@/infrastructure/services/backup-status";
import { t } from "@/i18n";
import { readonly, ref } from 'vue';

export type NotificationKind = 'budget' | 'goal'

const WALLET_REMINDER_ID = 1001
const BACKUP_REMINDER_ID = 1003
const BACKUP_SNOOZE_END_ID = 1004
const LEGACY_IDS = [1002]

/** Yedek hatırlatıcısının ilk tetiklenmesine kaç gün kala kurulacağı. */
const BACKUP_REMINDER_DELAY_DAYS = 3
/** Hatırlatıcının günün hangi saatinde çıkacağı. */
const BACKUP_REMINDER_HOUR = 19

export const CHANNEL_IDS = {
    walletReminder: 'wallet_reminder_v2',
    budgetAlerts: 'budget_alerts',
    backupReminder: 'backup_reminder',
    // `_v2`: importance'ı 3'ten 4'e çıkarmak için kimliğin değişmesi ŞART.
    // Android importance'ı yalnızca kanal ilk oluşturulurken okur; aynı kimlikle
    // yeniden `createChannel` çağırmak mevcut kurulumlarda hiçbir şey değiştirmez
    // (bkz. RETIRED_CHANNEL_IDS).
    goalAlerts: 'goal_alerts_v2',
} as const

/**
 * Kimliği değişen ya da kaldırılan kanallar.
 *
 * Silinmezlerse cihazın bildirim ayarlarında ölü bir satır olarak asılı kalırlar
 * ve kullanıcı hangisinin gerçek olduğunu bilemez.
 */
const RETIRED_CHANNEL_IDS = ['goal_alerts', 'wallet_reminder'] as const

let eventIdCounter = 9000;
const nextEventId = () => ++eventIdCounter;

const isNative = () => Capacitor.isNativePlatform()
const isAndroid = () => Capacitor.getPlatform() === 'android'
const exactAlarmGranted = ref<boolean | null>(null)

export const canSendOsNotification = (kind: NotificationKind) => {
    const { prefs } = useNotificationsStore();

    if (!prefs.pushEnabled) return false;
    if (kind === 'budget' && !prefs.budgetAlerts) return false;
    if (kind === 'goal' && !prefs.goalAlerts) return false;
    if (isNative() && !prefs.permissionGranted) return false;

    return true;
}

/** "HH:mm" → {hour, minute} */
const parseTime = (value: string) => {
    const [h, m] = value.split(':').map(Number)
    return { hour: Number.isFinite(h) ? h : 20, minute: Number.isFinite(m) ? m : 0 }
}

/**
 * Kanal tanımları. `importance` ve titreşim YALNIZ kanal ilk kez
 * oluşturulurken geçerlidir — sonrasında kullanıcı kontrolündedir; ad ve
 * açıklama ise her `createChannel` çağrısında güncellenir (dil değişince
 * kanal adı da uygulamayla birlikte çevrilir).
 *
 * importance: 4 (HIGH) = ekranın üstünde heads-up banner + ses. 3 (DEFAULT)
 * yalnızca ses çıkarır, banner göstermez. Tüm kanallar 4 — cüzdan hatırlatıcısı
 * da dahil; günlük hatırlatma gözden kaçmasın diye banner olarak gösteriliyor.
 * Kullanıcı rahatsız olursa cihaz ayarlarından kanalı kendisi kısabilir.
 *
 * visibility: 0 = private → kilit ekranında bildirim görünür ama içeriği
 * (tutar/bütçe adı) cihaz kilitliyken gizlenir. Hatırlatıcıda hassas veri
 * olmadığı için 1 = public.
 */
const channelDefs = (): Channel[] => [
    {
        id: CHANNEL_IDS.walletReminder,
        name: t('notifications.channels.walletReminder'),
        description: t('notifications.channels.walletReminderDesc'),
        importance: 4,
        visibility: 1,
        vibration: true,
    },
    {
        id: CHANNEL_IDS.budgetAlerts,
        name: t('notifications.channels.budgetAlerts'),
        description: t('notifications.channels.budgetAlertsDesc'),
        importance: 4,
        visibility: 0,
        vibration: true,
    },
    {
        id: CHANNEL_IDS.goalAlerts,
        name: t('notifications.channels.goalAlerts'),
        description: t('notifications.channels.goalAlertsDesc'),
        importance: 4,
        visibility: 0,
        vibration: true,
    },
    {
        id: CHANNEL_IDS.backupReminder,
        name: t('notifications.channels.backupReminder'),
        description: t('notifications.channels.backupReminderDesc'),
        importance: 4,
        // Hatırlatıcı hassas veri taşımıyor; kilit ekranında tam görünebilir.
        visibility: 1,
        vibration: true,
    },
];

/** Kanalları oluşturur/günceller. Idempotent — her açılışta çağrılabilir. */
export const ensureChannels = async () => {
    if (!isAndroid()) return;

    // Emeklileri ÖNCE sil: aksi halde kullanıcı ayarlarda hem eski hem yeni
    // "Hedef bildirimleri" satırını yan yana görür.
    for (const id of RETIRED_CHANNEL_IDS) {
        try {
            await LocalNotifications.deleteChannel({ id });
        } catch (err) {
            // Kanal zaten yoksa (temiz kurulum) burası normaldir.
            logger.debug('Emekli bildirim kanalı silinemedi', {
                context: 'notifier',
                error: err,
                data: { channelId: id },
            });
        }
    }

    for (const channel of channelDefs()) {
        try {
            await LocalNotifications.createChannel(channel);
        } catch (err) {
            logger.warn('Bildirim kanalı oluşturulamadı', {
                context: 'notifier',
                error: err,
                data: { channelId: channel.id },
            });
        }
    }
};

export const useNotifier = () => {
    const store = useNotificationsStore();

    const checkExactAlarmPermission = async () => {
        if (!isAndroid()) return;
        try {
            const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting();
            exactAlarmGranted.value = exact_alarm === 'granted';
        } catch (error) {
            exactAlarmGranted.value = null;
            logger.warn('Kesin alarm izni okunamadı', { context: 'notifier', error });
        }
    };

    const openExactAlarmSettings = async () => {
        if (!isAndroid()) return;
        try {
            await LocalNotifications.changeExactNotificationSetting();
            await checkExactAlarmPermission();
            await resyncSchedules();
        } catch (error) {
            logger.warn('Kesin alarm ayarı açılamadı', { context: 'notifier', error });
        }
    };

    // ─── İzin akışı ──────────────────────────────────────────────────────

    const checkPermission = async (): Promise<boolean> => {
        await checkExactAlarmPermission();
        if (!isNative()) {
            const granted = 'Notification' in window && Notification.permission === 'granted'
            store.prefs.permissionGranted = granted
            return granted
        }

        const { display } = await LocalNotifications.checkPermissions()
        const granted = display === 'granted'
        store.prefs.permissionGranted = granted

        return granted
    }

    const requestPermission = async (): Promise<boolean> => {
        // Web
        if (!isNative()) {
            if (!('Notification' in window)) {
                return false
            }

            try {
                // Zaten karar verilmişse tarayıcı ikinci kez sormaz; sadece
                // 'default' durumunda prompt gösterilir.
                const result = Notification.permission === 'default'
                    ? await Notification.requestPermission()
                    : Notification.permission

                const granted = result === 'granted'
                store.prefs.permissionGranted = granted

                return granted
            } catch {
                return false
            }
        }

        // Android 13+ POST_NOTIFICATIONS diyaloğu burada açılır. Kullanıcı daha
        // önce kalıcı olarak reddettiyse OS diyaloğu göstermeden 'denied' döner.
        let { display } = await LocalNotifications.checkPermissions()

        if (display !== 'granted') {
            try {
                ({ display } = await LocalNotifications.requestPermissions())
            } catch (err) {
                logger.warn('Bildirim izni istenemedi', { context: 'notifier', error: err })
                display = 'denied'
            }
        }

        const granted = display === 'granted'
        store.prefs.permissionGranted = granted

        if (granted) {
            await ensureChannels()
        }

        return granted
    };

    // Cüzdan hatırlatıcısı (tekrarlayan)
    const scheduleWalletReminder = async () => {
        if (!isNative()) return;

        await LocalNotifications.cancel({ notifications: [{ id: WALLET_REMINDER_ID }] });
        if (!store.prefs.pushEnabled || !store.prefs.walletReminder.enabled) return;
        if (!store.prefs.permissionGranted) return;

        const { hour, minute } = parseTime(store.prefs.walletReminder.time);

        try {
            await LocalNotifications.schedule({
                notifications: [{
                    id: WALLET_REMINDER_ID,
                    title: t('notifications.walletReminderTitle'),
                    body: t('notifications.walletReminderBody'),
                    channelId: CHANNEL_IDS.walletReminder,
                    // `on` → her gün aynı saatte tekrar eder (plugin bir sonrakini
                    // her tetiklemeden sonra kendisi kurar).
                    schedule: { on: { hour, minute }, allowWhileIdle: true },
                    extra: { type: 'wallet-reminder' },
                }],
            });
        } catch (err) {
            logger.warn('Cüzdan hatırlatıcısı kurulamadı', { context: 'notifier', error: err });
        }
    };

    /**
     * "Uzun süredir yedek almadın" hatırlatıcısı (haftalık tekrar).
     *
     * Şartlı kurulur ve yedek alınır alınmaz iptal edilir: `resyncSchedules`
     * her öne gelişte koştuğu için durum kendiliğinden senkron kalır. Böylece
     * hatırlatıcı yalnızca gerçekten riskli durumda varlık gösterir — sürekli
     * dırdır eden bir bildirim uygulamayı sildirir.
     *
     * Uygulama içi şerit (bkz. App.vue) kullanıcı uygulamayı açtığında iş
     * görüyor; bu bildirim tam olarak AÇMADIĞI dönem için var — telefonun
     * kaybolduğu senaryo da o dönemde yaşanıyor.
     */
    const scheduleBackupReminder = async () => {
        if (!isNative()) return;

        await LocalNotifications.cancel({ notifications: [{ id: BACKUP_REMINDER_ID }] });

        if (!store.prefs.pushEnabled || !store.prefs.backupReminder) return;
        if (!store.prefs.permissionGranted) return;

        // Damga Preferences'ta; DB'ye dokunmadığı için kurulum patlamış olsa da
        // okunabilir.
        const lastExportAt = await readLastExportAt();

        if (!isBackupStale(lastExportAt)) return;

        const at = new Date();
        at.setDate(at.getDate() + BACKUP_REMINDER_DELAY_DAYS);
        at.setHours(BACKUP_REMINDER_HOUR, 0, 0, 0);

        try {
            await LocalNotifications.schedule({
                notifications: [{
                    id: BACKUP_REMINDER_ID,
                    title: t('backup.reminder.notificationTitle'),
                    body: t('backup.reminder.notificationBody'),
                    channelId: CHANNEL_IDS.backupReminder,
                    schedule: { at, every: 'week', repeats: true, allowWhileIdle: true },
                    extra: { type: 'backup-reminder' },
                }],
            });
        } catch (err) {
            logger.warn('Yedek hatırlatıcısı kurulamadı', { context: 'notifier', error: err });
        }
    };

    /**
     * "Ertelediğin yedek hatırlatması geri geldi" bildirimi (tek seferlik).
     *
     * Kullanıcı hatırlatma kartını çarpıyla kapatınca uyarı BACKUP_SNOOZE_DAYS
     * kadar susuyor. Süre dolduğunda kart kendiliğinden geri geliyor — ama
     * yalnızca kullanıcı uygulamayı AÇARSA. Telefon kaybı tam da uygulamanın
     * açılmadığı dönemde yaşandığı için, ertelemenin bittiği an bir kez haber
     * veriyoruz.
     *
     * Tek seferlik (`every` yok): haftalık `scheduleBackupReminder` zaten
     * süregelen dırdırı üstleniyor, bu yalnızca "sustur" sözünün bittiğini
     * bildiriyor.
     *
     * Her koşulda önce iptal edilir; `resyncSchedules` her öne gelişte koştuğu
     * için yedek alındığında ya da erteleme başka bir yerden değiştiğinde
     * durum kendiliğinden senkron kalır.
     */
    const scheduleBackupSnoozeEndReminder = async () => {
        if (!isNative()) return;

        await LocalNotifications.cancel({ notifications: [{ id: BACKUP_SNOOZE_END_ID }] });

        if (!store.prefs.pushEnabled || !store.prefs.backupSnoozeEndReminder) return;
        if (!store.prefs.permissionGranted) return;

        const { lastExportAt, snoozedUntil } = await readStatus();

        // Erteleme yoksa ya da çoktan dolmuşsa haber verilecek bir an kalmamış.
        if (!isSnoozed(snoozedUntil)) return;

        // Yedek bu arada alındıysa hatırlatmanın kendisi geçersiz.
        if (!isBackupStale(lastExportAt)) return;

        try {
            await LocalNotifications.schedule({
                notifications: [{
                    id: BACKUP_SNOOZE_END_ID,
                    title: t('backup.reminder.snoozeEndTitle'),
                    body: t('backup.reminder.snoozeEndBody'),
                    channelId: CHANNEL_IDS.backupReminder,
                    schedule: { at: new Date(snoozedUntil as string), allowWhileIdle: true },
                    extra: { type: 'backup-snooze-end' },
                }],
            });
        } catch (err) {
            logger.warn('Yedek erteleme bitiş bildirimi kurulamadı', { context: 'notifier', error: err });
        }
    };

    /** Kaldırılan bildirimlerin cihazda asılı kalmış kayıtlarını temizler. */
    const cleanupLegacy = async () => {
        if (!isNative()) return;
        try {
            await LocalNotifications.cancel({
                notifications: LEGACY_IDS.map(id => ({ id })),
            });
        } catch { /* yoksay */
        }
    };

    /** Kanalları ve tekrarlayan schedule'ları prefs'e göre yeniden kurar. */
    const resyncSchedules = async () => {
        await ensureChannels();
        await cleanupLegacy();
        await scheduleWalletReminder();
        await scheduleBackupReminder();
        await scheduleBackupSnoozeEndReminder();
    };

    const cancelAll = async () => {
        if (!isNative()) return;
        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length > 0) {
            await LocalNotifications.cancel({ notifications: pending.notifications });
        }
    };

    // ─── Olay tetikleyicileri ─────────────────────────────────────────────

    /** Tasarruf hedefine ulaşıldığında — saving-goals store'undan çağrılır. */
    const notifyGoalReached = async (goalName: string) => {
        if (!canSendOsNotification('goal')) return;
        // Metinler `notifications.*` altında: diğer bildirim kopyaları
        // (hatırlatıcı, kanal adları) da orada duruyor. Eskiden hiçbir dilde
        // karşılığı olmayan `savingGoals.alerts.*` okunuyordu; vue-i18n
        // bulamadığı anahtarı aynen döndürdüğü için kullanıcıya bildirim
        // olarak "savingGoals.alerts.reachedTitle" düşüyordu.
        await fire(
            t('notifications.goalReachedTitle'),
            t('notifications.goalReachedBody', { name: goalName }),
            CHANNEL_IDS.goalAlerts,
            { type: 'goal-reached', goalName },
        );
    };

    const fire = async (
        title: string,
        body: string,
        channelId: string,
        extra?: Record<string, unknown>,
    ) => {
        if (isNative()) {
            try {
                await LocalNotifications.schedule({
                    notifications: [{
                        id: nextEventId(),
                        title,
                        body,
                        channelId,
                        schedule: { at: new Date(Date.now() + 500) },
                        extra,
                    }],
                });
            } catch (err) {
                logger.warn('Bildirim gönderilemedi', { context: 'notifier', error: err });
            }
            return;
        }

        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(title, { body, icon: '/favicon.png' });
            } catch { /* yoksay */
            }
        }
    };

    return {
        exactAlarmGranted: readonly(exactAlarmGranted),
        openExactAlarmSettings,
        checkPermission,
        requestPermission,
        ensureChannels,
        resyncSchedules,
        scheduleWalletReminder,
        scheduleBackupReminder,
        scheduleBackupSnoozeEndReminder,
        cancelAll,
        notifyGoalReached,
        canSend: canSendOsNotification
    };
};
