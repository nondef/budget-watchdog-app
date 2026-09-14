import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { logger } from '@/infrastructure/logging';
import { Preferences } from "@capacitor/preferences";

export interface WalletReminderConfig {
  enabled: boolean
  time: string // HH:mm
}

export interface NotificationPrefs {
  /** Master switch. Kapalıysa hiçbir bildirim tetiklenmez. */
  pushEnabled: boolean;
  /** Cihaz seviyesinde izin verildi mi? (LocalNotifications.checkPermissions) */
  walletReminder: WalletReminderConfig
  permissionGranted: boolean;
  budgetAlerts: boolean;
  goalAlerts: boolean;
  /**
   * "Uzun süredir yedek almadın" hatırlatıcısı.
   *
   * Varsayılan AÇIK — diğer bildirimlerden farklı olarak bu bir kolaylık değil,
   * veri kaybı önlemi: cihaz yedeği kapalı olduğu için telefon kaybı tüm
   * finansal geçmişin kalıcı kaybı demek. Yalnızca yedek gerçekten bayatken
   * kurulur, kullanıcı yedek alınca kendiliğinden iptal olur.
   */
  backupReminder: boolean;
  /**
   * "Ertelediğin yedek hatırlatması yeniden aktif" bildirimi.
   *
   * Kullanıcı hatırlatma kartını çarpıyla kapattığında uyarı 3 gün susuyor
   * (BACKUP_SNOOZE_DAYS). Süre dolduğunda kart sessizce geri geliyor — ama
   * yalnızca kullanıcı uygulamayı açarsa. Telefonun kaybolduğu senaryo tam da
   * uygulamanın açılmadığı dönemde yaşandığı için, ertelemenin bittiği an bir
   * kez bildirim düşer.
   *
   * `backupReminder`dan AYRI bir anahtar: o haftalık dırdırı kapatan kullanıcı,
   * kendi ertelediği şeyin geri geldiğini yine de duymak isteyebilir — ve
   * tersi. Varsayılan açık, tek seferlik olduğu için gürültü riski düşük.
   */
  backupSnoozeEndReminder: boolean;
}

const STORAGE_KEY = 'budget_watchdog_notification_prefs';

const defaultPrefs: NotificationPrefs = {
  pushEnabled: false,
  permissionGranted: false,
  walletReminder: { enabled: true, time: '20:00' },
  budgetAlerts: true,
  goalAlerts: true,
  backupReminder: true,
  backupSnoozeEndReminder: true,
}

export const useNotificationsStore = defineStore('notifications', () => {
  const prefs = ref<NotificationPrefs>(defaultPrefs)
  const loaded = ref(false)

  let initPromise: Promise<void> | null = null
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  const initiliaze = async () => {
    if (initPromise) {
      return initPromise
    }

    initPromise = (async () => {
      try {
        const { value } = await Preferences.get({ key: STORAGE_KEY })

        if (value) {
          const parsed = JSON.parse(value)

          prefs.value = {
            ...defaultPrefs,
            ...parsed,
            walletReminder: { ...defaultPrefs.walletReminder, ...parsed.walletReminder ?? {} },
          };
        }
      } catch (err) {
        logger.error('Notification settings have not been read', { context: 'notifications', error: err })

        prefs.value = defaultPrefs
      } finally {
        loaded.value = true
      }
    })()

    return initPromise
  };

  watch(
    prefs,
    (value) => {
      if (!loaded.value) return
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = setTimeout(() => {
        Preferences
            .set({ key: STORAGE_KEY, value: JSON.stringify(value) })
            .catch(err => logger.error('Notification settings were not saved.', { context: 'notifications', error: err }))
      }, 200);
    },
    { deep: true },
  );

  return {
    prefs,
    loaded,
    initiliaze
  };
});
