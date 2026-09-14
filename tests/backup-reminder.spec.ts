import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Yedeğin bayatladı" hatırlatıcısı.
 *
 * Neden var: cihaz yedeği bilinçli olarak kapalı (`allowBackup=false` +
 * `data_extraction_rules` her domaini dışlıyor) ve bulut senkronu yok. Telefon
 * kaybı, sıfırlama veya uygulamayı silmek TÜM finansal geçmişin kalıcı kaybı
 * demek; Android'in normalde yaptığı otomatik geri yüklemeye güvenen kullanıcı
 * bunu ancak iş işten geçtikten sonra öğrenir. Tek telafi elle alınan yedek.
 */

const store = vi.hoisted(() => ({ map: new Map<string, string>() }));

vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        get: async ({ key }: { key: string }) => ({ value: store.map.get(key) ?? null }),
        set: async ({ key, value }: { key: string; value: string }) => { store.map.set(key, value); },
        remove: async ({ key }: { key: string }) => { store.map.delete(key); },
    },
}));

const LEGACY_KEY = 'bw:lastExportAt';
const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

describe('Yedek bayatlığı', () => {
    beforeEach(() => {
        store.map.clear();
        localStorage.clear();
        vi.resetModules();
    });

    it('hiç yedek alınmamışsa bayat sayar', async () => {
        const { isBackupStale, daysSinceExport } = await import('@/infrastructure/services/backup-status');

        expect(isBackupStale(null)).toBe(true);
        expect(daysSinceExport(null)).toBeNull();
    });

    it('eşiğin altında bayat DEĞİL, eşikte bayat', async () => {
        const { isBackupStale, BACKUP_STALE_AFTER_DAYS } = await import('@/infrastructure/services/backup-status');

        expect(isBackupStale(daysAgo(BACKUP_STALE_AFTER_DAYS - 1))).toBe(false);
        expect(isBackupStale(daysAgo(BACKUP_STALE_AFTER_DAYS))).toBe(true);
    });

    it('cihaz saati geriye alınmışsa negatif gün üretmez', async () => {
        const { daysSinceExport } = await import('@/infrastructure/services/backup-status');

        const future = new Date(Date.now() + 5 * DAY_MS).toISOString();

        expect(daysSinceExport(future)).toBe(0);
    });

    it('"şimdi" dışarıdan verilebilir — arka planda geçen gün sayılabilsin', async () => {
        const { daysSinceExport } = await import('@/infrastructure/services/backup-status');

        const stamp = daysAgo(0);

        expect(daysSinceExport(stamp, Date.now() + 9 * DAY_MS)).toBe(9);
    });

    it('eski localStorage damgasını devralır ve Preferences\'a taşır', async () => {
        // Taşınmazsa mevcut kullanıcılar güncellemeden sonra "hiç yedek almamış"
        // görünüp gereksiz uyarı alırdı.
        const stamp = daysAgo(3);
        localStorage.setItem(LEGACY_KEY, stamp);

        const { readLastExportAt } = await import('@/infrastructure/services/backup-status');

        expect(await readLastExportAt()).toBe(stamp);
        expect(localStorage.getItem(LEGACY_KEY)).toBeNull();

        // İkinci okuma artık Preferences'tan gelir.
        expect(await readLastExportAt()).toBe(stamp);
    });

    it('dışa aktarma damgayı kalıcı yazar', async () => {
        const { readLastExportAt, recordExport, isBackupStale } = await import('@/infrastructure/services/backup-status');

        const written = await recordExport();

        expect(await readLastExportAt()).toBe(written);
        expect(isBackupStale(written)).toBe(false);
    });
});

describe('Yedek uyarı şeridi', () => {
    beforeEach(() => {
        store.map.clear();
        localStorage.clear();
        vi.resetModules();
    });

    it('verisi olmayan kurulumda gösterilmez', async () => {
        const { useBackupReminder } = await import('@/composables/features/useBackupReminder');
        const reminder = useBackupReminder();

        await reminder.refresh();

        expect(reminder.shouldWarn(false)).toBe(false);
        expect(reminder.shouldWarn(true)).toBe(true);
    });

    it('damga okunmadan gösterilmez', async () => {
        const { useBackupReminder } = await import('@/composables/features/useBackupReminder');
        const reminder = useBackupReminder();

        // `refresh()` çağrılmadan: aksi halde her açılışta bir an için
        // yanlış yere görünürdü.
        expect(reminder.shouldWarn(true)).toBe(false);
    });

    it('kapatıldığında geri gelmez', async () => {
        const { useBackupReminder } = await import('@/composables/features/useBackupReminder');
        const reminder = useBackupReminder();

        await reminder.refresh();
        await reminder.dismiss();

        expect(reminder.shouldWarn(true)).toBe(false);
    });

    it('kapatma uygulama yeniden açıldığında da geçerli', async () => {
        // Eskiden kapatma yalnızca oturum içindeydi: kullanıcı çarpıya basıp
        // uygulamayı kapatıp açınca uyarı geri geliyordu, yani buton hiçbir işe
        // yaramıyordu.
        const first = await import('@/composables/features/useBackupReminder');
        await first.useBackupReminder().refresh();
        await first.useBackupReminder().dismiss();

        // Yeniden açılış: modül durumu sıfırdan kurulur, yalnızca Preferences kalır.
        vi.resetModules();
        const { useBackupReminder } = await import('@/composables/features/useBackupReminder');
        const reminder = useBackupReminder();
        await reminder.refresh();

        expect(reminder.snoozeActive.value).toBe(true);
        expect(reminder.shouldWarn(true)).toBe(false);
    });

    it('kapatma anında saat ilerlese de erteleme geçerli sayılır', async () => {
        // Erteleme sonu yazma anına göre hesaplanıyor, `evaluatedAt` ise yazmadan
        // hemen ÖNCE okunabiliyordu: milisaniyelik fark ertelemeyi "çok uzak"
        // gösterip uyarıyı anında geri getiriyordu.
        const { useBackupReminder } = await import('@/composables/features/useBackupReminder');
        const reminder = useBackupReminder();

        await reminder.refresh();

        for (let i = 0; i < 50; i++) {
            await reminder.dismiss();
            expect(reminder.snoozeActive.value).toBe(true);
        }
    });

    it('erteleme süresi dolunca yeniden görünür', async () => {
        const { BACKUP_SNOOZE_DAYS } = await import('@/infrastructure/services/backup-status');
        const first = await import('@/composables/features/useBackupReminder');
        await first.useBackupReminder().refresh();
        await first.useBackupReminder().dismiss();

        vi.resetModules();
        const { useBackupReminder } = await import('@/composables/features/useBackupReminder');
        const reminder = useBackupReminder();

        vi.useFakeTimers();
        vi.setSystemTime(Date.now() + (BACKUP_SNOOZE_DAYS + 1) * DAY_MS);
        await reminder.refresh();
        vi.useRealTimers();

        expect(reminder.shouldWarn(true)).toBe(true);
    });

    it('yedek alınınca erteleme de silinir', async () => {
        // Aksi hâlde yedek bir sonraki sefer bayatladığında uyarı, kalıntı
        // erteleme yüzünden geç görünürdü.
        const { useBackupReminder } = await import('@/composables/features/useBackupReminder');
        const reminder = useBackupReminder();

        await reminder.refresh();
        await reminder.dismiss();
        await reminder.markExported();

        expect(reminder.snoozeActive.value).toBe(false);

        const { readStatus } = await import('@/infrastructure/services/backup-status');
        expect((await readStatus()).snoozedUntil).toBeNull();
    });

    it('okuma sürerken alınan yedek okumanın eski değeriyle ezilmez', async () => {
        // Gerçek sıra: uygulama öne gelirken `refresh()` başlar (bridge çağrısı
        // beklemede), kullanıcı bu sırada yedek alır. Okuma bitince kendinden
        // ESKİ damgayı yazarsa uyarı, yedek alınmış olmasına rağmen geri gelir.
        const { useBackupReminder } = await import('@/composables/features/useBackupReminder');
        const reminder = useBackupReminder();

        const reading = reminder.refresh();
        await reminder.markExported();
        await reading;

        expect(reminder.shouldWarn(true)).toBe(false);
        expect(reminder.daysSince.value).toBe(0);
    });

    it('yedek alınınca anında kaybolur', async () => {
        const { useBackupReminder } = await import('@/composables/features/useBackupReminder');
        const reminder = useBackupReminder();

        await reminder.refresh();
        expect(reminder.shouldWarn(true)).toBe(true);

        await reminder.markExported();

        expect(reminder.shouldWarn(true)).toBe(false);
        expect(reminder.hasEverExported.value).toBe(true);
        expect(reminder.daysSince.value).toBe(0);
    });
});

describe('Yedek hatırlatıcısı bildirimi', () => {
    const cancel = vi.fn();
    const schedule = vi.fn();
    const prefs = {
        pushEnabled: true,
        permissionGranted: true,
        backupReminder: true,
        backupSnoozeEndReminder: true,
    };

    beforeEach(() => {
        store.map.clear();
        localStorage.clear();
        vi.resetModules();
        cancel.mockReset().mockResolvedValue(undefined);
        schedule.mockReset().mockResolvedValue(undefined);
        Object.assign(prefs, {
            pushEnabled: true,
            permissionGranted: true,
            backupReminder: true,
            backupSnoozeEndReminder: true,
        });

        vi.doMock('@capacitor/core', () => ({
            Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
        }));
        vi.doMock('@capacitor/local-notifications', () => ({
            LocalNotifications: {
                cancel: (...args: unknown[]) => cancel(...args),
                schedule: (...args: unknown[]) => schedule(...args),
                createChannel: vi.fn(),
                deleteChannel: vi.fn(),
            },
        }));
        vi.doMock('@/i18n', () => ({
            t: (key: string) => key,
            i18n: { global: { t: (key: string) => key } },
        }));
        vi.doMock('@/stores/notifications', () => ({
            useNotificationsStore: () => ({ prefs }),
        }));
    });

    const load = async () => (await import('@/composables/features/useNotifier')).useNotifier();

    it('yedek bayatken haftalık kurulur', async () => {
        const notifier = await load();

        await notifier.scheduleBackupReminder();

        expect(schedule).toHaveBeenCalledTimes(1);
        const [{ notifications }] = schedule.mock.calls[0] as [{ notifications: any[] }];
        expect(notifications[0].schedule).toMatchObject({ every: 'week', repeats: true });
    });

    it('yedek güncelken KURULMAZ ve varsa iptal edilir', async () => {
        const { recordExport } = await import('@/infrastructure/services/backup-status');
        await recordExport();

        const notifier = await load();
        await notifier.scheduleBackupReminder();

        // İptal her koşulda çağrılır; asıl iddia yeniden kurulmadığı.
        expect(cancel).toHaveBeenCalled();
        expect(schedule).not.toHaveBeenCalled();
    });

    it('kullanıcı kapattıysa kurulmaz', async () => {
        prefs.backupReminder = false;

        const notifier = await load();
        await notifier.scheduleBackupReminder();

        expect(schedule).not.toHaveBeenCalled();
    });

    it('bildirim izni yoksa kurulmaz', async () => {
        prefs.permissionGranted = false;

        const notifier = await load();
        await notifier.scheduleBackupReminder();

        expect(schedule).not.toHaveBeenCalled();
    });
});

/**
 * Kullanıcı hatırlatmayı çarpıyla kapatınca uyarı BACKUP_SNOOZE_DAYS kadar
 * susuyor. Süre dolduğunda kart geri geliyor — ama yalnızca kullanıcı uygulamayı
 * AÇARSA. Telefon kaybı tam da açılmayan dönemde yaşandığı için ertelemenin
 * bittiği an bir kez bildirim düşer.
 */
describe('Erteleme bitiş bildirimi', () => {
    const cancel = vi.fn();
    const schedule = vi.fn();
    const prefs = {
        pushEnabled: true,
        permissionGranted: true,
        backupReminder: true,
        backupSnoozeEndReminder: true,
    };

    beforeEach(() => {
        store.map.clear();
        localStorage.clear();
        vi.resetModules();
        cancel.mockReset().mockResolvedValue(undefined);
        schedule.mockReset().mockResolvedValue(undefined);
        Object.assign(prefs, {
            pushEnabled: true,
            permissionGranted: true,
            backupReminder: true,
            backupSnoozeEndReminder: true,
        });

        vi.doMock('@capacitor/core', () => ({
            Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
        }));
        vi.doMock('@capacitor/local-notifications', () => ({
            LocalNotifications: {
                cancel: (...args: unknown[]) => cancel(...args),
                schedule: (...args: unknown[]) => schedule(...args),
                createChannel: vi.fn(),
                deleteChannel: vi.fn(),
            },
        }));
        vi.doMock('@/i18n', () => ({
            t: (key: string) => key,
            i18n: { global: { t: (key: string) => key } },
        }));
        vi.doMock('@/stores/notifications', () => ({
            useNotificationsStore: () => ({ prefs }),
        }));
    });

    const load = async () => (await import('@/composables/features/useNotifier')).useNotifier();

    /** Bayat yedek + aktif erteleme — bildirimin kurulması gereken tek durum. */
    const snoozeActiveState = async () => {
        const { recordSnooze } = await import('@/infrastructure/services/backup-status');
        await recordSnooze();
    };

    it('erteleme aktifken ertelemenin bittiği ana TEK SEFERLİK kurulur', async () => {
        await snoozeActiveState();
        const { readStatus } = await import('@/infrastructure/services/backup-status');
        const { snoozedUntil } = await readStatus();

        const notifier = await load();
        await notifier.scheduleBackupSnoozeEndReminder();

        expect(schedule).toHaveBeenCalledTimes(1);
        const [{ notifications }] = schedule.mock.calls[0] as [{ notifications: any[] }];
        expect(notifications[0].schedule.at.toISOString()).toBe(snoozedUntil);
        // Tekrarlamamalı: haftalık dırdırı `scheduleBackupReminder` üstleniyor.
        expect(notifications[0].schedule.every).toBeUndefined();
    });

    it('erteleme yoksa kurulmaz', async () => {
        const notifier = await load();
        await notifier.scheduleBackupSnoozeEndReminder();

        expect(cancel).toHaveBeenCalled();
        expect(schedule).not.toHaveBeenCalled();
    });

    it('erteleme sırasında yedek alındıysa kurulmaz', async () => {
        await snoozeActiveState();
        const { recordExport } = await import('@/infrastructure/services/backup-status');
        await recordExport();

        const notifier = await load();
        await notifier.scheduleBackupSnoozeEndReminder();

        expect(schedule).not.toHaveBeenCalled();
    });

    it('kullanıcı bu bildirimi kapattıysa kurulmaz', async () => {
        await snoozeActiveState();
        prefs.backupSnoozeEndReminder = false;

        const notifier = await load();
        await notifier.scheduleBackupSnoozeEndReminder();

        expect(cancel).toHaveBeenCalled();
        expect(schedule).not.toHaveBeenCalled();
    });

    it('haftalık hatırlatıcı kapalıyken de kurulabilir — anahtarlar ayrı', async () => {
        await snoozeActiveState();
        prefs.backupReminder = false;

        const notifier = await load();
        await notifier.scheduleBackupSnoozeEndReminder();

        expect(schedule).toHaveBeenCalledTimes(1);
    });
});
