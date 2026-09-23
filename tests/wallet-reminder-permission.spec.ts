import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    platform: 'android',
    exact: 'denied',
    prefs: { pushEnabled: true, permissionGranted: true, walletReminder: { enabled: true, time: '17:15' } },
}));
const api = vi.hoisted(() => ({
    checkExactNotificationSetting: vi.fn(), changeExactNotificationSetting: vi.fn(),
    checkPermissions: vi.fn(), schedule: vi.fn(), cancel: vi.fn(),
    createChannel: vi.fn(), deleteChannel: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: {
    getPlatform: () => state.platform, isNativePlatform: () => state.platform !== 'web',
} }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: api }));
vi.mock('@/stores/notifications', () => ({ useNotificationsStore: () => ({ prefs: state.prefs }) }));
vi.mock('@/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/infrastructure/logging', () => ({ logger: { warn: vi.fn(), debug: vi.fn() } }));

describe('Daily reminder exact alarm permission', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        state.platform = 'android';
        state.exact = 'denied';
        api.checkPermissions.mockResolvedValue({ display: 'granted' });
        api.checkExactNotificationSetting.mockImplementation(async () => ({ exact_alarm: state.exact }));
        api.changeExactNotificationSetting.mockImplementation(async () => { state.exact = 'granted'; });
    });

    it('distinguishes display permission from exact alarms and refreshes on resume', async () => {
        const { useNotifier } = await import('@/composables/features/useNotifier');
        const notifier = useNotifier();
        expect(await notifier.checkPermission()).toBe(true);
        expect(notifier.exactAlarmGranted.value).toBe(false);
        state.exact = 'granted';
        await notifier.checkPermission();
        expect(notifier.exactAlarmGranted.value).toBe(true);
        expect(api.changeExactNotificationSetting).not.toHaveBeenCalled();
    });

    it('reinstalls the selected daily alarm after returning from settings', async () => {
        const { useNotifier } = await import('@/composables/features/useNotifier');
        const notifier = useNotifier();
        await notifier.openExactAlarmSettings();
        expect(notifier.exactAlarmGranted.value).toBe(true);
        expect(api.schedule).toHaveBeenCalledWith({ notifications: [expect.objectContaining({
            id: 1001, schedule: { on: { hour: 17, minute: 15 }, allowWhileIdle: true },
        })] });
    });

    it('does not request Android settings on iOS', async () => {
        state.platform = 'ios';
        const { useNotifier } = await import('@/composables/features/useNotifier');
        const notifier = useNotifier();
        await notifier.checkPermission();
        await notifier.openExactAlarmSettings();
        expect(api.checkExactNotificationSetting).not.toHaveBeenCalled();
        expect(api.changeExactNotificationSetting).not.toHaveBeenCalled();
    });
});
