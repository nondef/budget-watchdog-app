import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Dönem sıfırlama hatırlatıcılarının zamanlanması.
 *
 * Regresyon riski: rollover üç ayrı yoldan olabiliyor (App.vue gece yarısı
 * timer'ı, `loadBudgets`, işlem akışlarındaki `rolloverDueBudgets`). Sonuncusu
 * application katmanında sıfırlıyor ve bildirim tarafına dokunmuyor; ardından
 * çalışan `resetBudgets` "sıfırlanacak bütçe yok" dediği için yeni dönemin
 * hatırlatıcısı hiç zamanlanmıyordu. Kullanıcı geçmiş dönemin bildirimini alıp
 * sonraki dönemde hiçbir şey almıyordu.
 */

const schedule = vi.fn()
const cancel = vi.fn()

vi.mock('@capacitor/core', () => ({
    Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
    },
}))

vi.mock('@capacitor/local-notifications', () => ({
    LocalNotifications: {
        schedule: (...args: unknown[]) => schedule(...args),
        cancel: (...args: unknown[]) => cancel(...args),
        requestPermissions: async () => ({ display: 'granted' }),
    },
}))

vi.mock('@/i18n', () => ({
    t: (key: string) => key,
    i18n: { global: { t: (key: string) => key } },
}))

vi.mock('@/composables/features/useNotifier', () => ({
    canSendOsNotification: () => true,
}))

vi.mock('@/composables/ui/useToast', () => ({
    useToast: () => ({
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
    }),
}))

vi.mock('@/stores/exchange-rates', () => ({
    useExchangeRateStore: () => ({
        sumInBase: () => ({ total: 0, missing: [] }),
        missingRatesFor: () => [],
    }),
}))

const state = vi.hoisted(() => ({ budgets: [] as any[] }))

vi.mock('@/infrastructure/database/repositories', () => ({
    AccountRepository: class {},
    BudgetRepository: class {},
    CategoryRepository: class {},
    CurrencyRepository: class {},
    TransactionBudgetEffectRepository: class {},
    TransactionRepository: class {},
}))

vi.mock('@/infrastructure/database/repositories/resolve', () => ({
    resolveRepository: (ctor: { name: string }) => {
        if (ctor.name === 'BudgetRepository') {
            return {
                findAll: async () => state.budgets,
                findByStatus: async (status: string) =>
                    state.budgets.filter(b => b.status === status),
                findNeedingReset: async (now: Date) =>
                    state.budgets.filter(b => b.shouldReset(now)),
                save: async () => undefined,
            }
        }

        if (ctor.name === 'TransactionBudgetEffectRepository') {
            return { deleteByBudgetPeriod: async () => undefined }
        }

        return {}
    },
    resolveUnitOfWork: () => ({
        run: async <T>(work: () => Promise<T>) => work(),
    }),
}))

const { Budget } = await import('@/domain/entities/budget')
const { useBudgetStore } = await import('@/stores/budgets')

const monthlyBudget = (startDate: Date) =>
    Budget.create({
        name: 'Market',
        amount: 1000,
        accountId: 'acc1',
        currencyId: 'try-id',
        type: 'monthly',
        categoryIds: ['cat1'],
        startDate,
        icon: { name: 'walletOutline', color: 'bg-blue-500' },
        enableNotifications: true,
    }, startDate)

/** Zamanlanan hatırlatıcının tarihi (son `schedule` çağrısından). */
const lastScheduledAt = () => {
    const call = schedule.mock.calls.at(-1)?.[0] as
        | { notifications: { schedule: { at: Date } }[] }
        | undefined

    return call?.notifications[0].schedule.at
}

describe('Dönem sıfırlama hatırlatıcıları', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        setActivePinia(createPinia())
        state.budgets = []
        // Gerçek saatle `resetBudgets` bütçeyi kendisi devrederdi; "rollover
        // başka yoldan olmuş" senaryosu o zaman kurulamaz.
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date(2026, 1, 1, 0, 0, 30))
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('işlem akışı bütçeyi devrettiyse yeni dönem için hatırlatıcı kurulur', async () => {
        const budget = monthlyBudget(new Date(2026, 0, 1))
        state.budgets = [budget]

        // `rolloverDueBudgets`'in yaptığı: bütçe application katmanında
        // sıfırlanmış, bildirim tarafı bundan habersiz.
        budget.reset(new Date(2026, 1, 1, 0, 0, 30))
        expect(budget.nextResetDate).toEqual(new Date(2026, 2, 1))

        const store = useBudgetStore()
        await store.loadBudgets()

        // `resetBudgets` sıfırlanacak bütçe bulamaz; hatırlatıcı yine de
        // güncel `nextResetDate`'e hizalanmalı.
        expect(lastScheduledAt()).toEqual(new Date(2026, 2, 1))
    })

    it('bildirimi kapalı bütçenin hatırlatıcısı iptal edilir', async () => {
        const budget = monthlyBudget(new Date(2026, 0, 1))
        budget.updateDetails({ enableNotifications: false })
        state.budgets = [budget]

        const store = useBudgetStore()
        await store.loadBudgets()

        expect(schedule).not.toHaveBeenCalled()
        expect(cancel).toHaveBeenCalled()
    })

    /**
     * Hatırlatıcı senkronu veri yükleme yolunda (`refreshBudgetList`) duruyor
     * ve native bir resume'da tek başına üç liste yüklemesi oluyor. Bütçe başına
     * koşulsuz iptal+zamanlama göndermek listenin render'ını bekletiyordu.
     */
    it('değişmeyen bütçelerde tekrar yüklemede köprüye hiç çıkılmaz', async () => {
        state.budgets = [monthlyBudget(new Date(2026, 1, 1))]

        const store = useBudgetStore()
        await store.loadBudgets()

        expect(schedule).toHaveBeenCalledTimes(1)

        vi.clearAllMocks()
        await store.loadBudgets()
        await store.loadBudgets()

        expect(schedule).not.toHaveBeenCalled()
        expect(cancel).not.toHaveBeenCalled()
    })

    it('birden çok hatırlatıcı tek köprü turunda zamanlanır', async () => {
        state.budgets = [
            monthlyBudget(new Date(2026, 1, 1)),
            monthlyBudget(new Date(2026, 1, 1)),
            monthlyBudget(new Date(2026, 1, 1)),
        ]

        const store = useBudgetStore()
        await store.loadBudgets()

        expect(schedule).toHaveBeenCalledTimes(1)

        const [{ notifications }] = schedule.mock.calls[0] as [{ notifications: unknown[] }]
        expect(notifications).toHaveLength(3)
    })

    it('duraklatılmış bütçe hatırlatıcı zamanlamaz', async () => {
        const budget = monthlyBudget(new Date(2026, 0, 1))
        budget.pause()
        state.budgets = [budget]

        const store = useBudgetStore()
        await store.loadBudgets()

        expect(schedule).not.toHaveBeenCalled()
        expect(cancel).toHaveBeenCalled()
    })
})
