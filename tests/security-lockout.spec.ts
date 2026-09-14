import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * PIN deneme kilidi. Buradaki regresyon riski yüksek: kilit "çalışıyor" görünüp
 * aslında geri saymazsa kullanıcı uygulamadan kalıcı olarak dışarıda kalır.
 */

// Capacitor Preferences bellekte taklit ediliyor.
const store = vi.hoisted(() => new Map<string, string>())

vi.mock('@capacitor/preferences', () => ({
    Preferences: {
        async get({ key }: { key: string }) { return { value: store.get(key) ?? null } },
        async set({ key, value }: { key: string; value: string }) { store.set(key, value) },
        async remove({ key }: { key: string }) { store.delete(key) },
        async clear() { store.clear() },
    },
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
}))

vi.mock('@/infrastructure/services/biometric', () => ({
    authenticateBiometric: vi.fn(async () => true),
    isBiometryAvailable: vi.fn(async () => false),
}))

vi.mock('@/i18n', () => ({
    i18n: { global: { t: (key: string) => key } },
}))

const { useSecurityStore } = await import('@/stores/security')

const CORRECT = '1234'
const WRONG = '9999'

describe('PIN deneme kilidi', () => {
    beforeEach(async () => {
        store.clear()
        setActivePinia(createPinia())
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-08-19T12:00:00Z'))
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    const withPin = async () => {
        const security = useSecurityStore()
        await security.initialize()
        await security.setPin(CORRECT)
        return security
    }

    it('doğru PIN kabul edilir, sayaç sıfırlanır', async () => {
        const security = await withPin()

        await security.verifyPin(WRONG)
        expect(security.settings.failedAttempts).toBe(1)

        expect(await security.verifyPin(CORRECT)).toBe(true)
        expect(security.settings.failedAttempts).toBe(0)
        expect(security.settings.lockoutUntil).toBe(0)
    })

    it('5 hatalı denemede kilit devreye girer', async () => {
        const security = await withPin()

        for (let i = 0; i < 4; i++) await security.verifyPin(WRONG)
        expect(security.lockoutRemainingMs()).toBe(0)

        await security.verifyPin(WRONG)
        expect(security.lockoutRemainingMs()).toBe(30_000)
    })

    /**
     * Asıl regresyon: `lockoutRemainingMs` bir `computed` olduğunda
     * `Date.now()` reaktif olmadığı için sonuç önbelleğe alınıyor ve geri
     * sayım donuyordu — ekranda süre görünüyor ama hiç azalmıyordu.
     */
    it('kalan süre zaman ilerledikçe GERÇEKTEN azalır', async () => {
        const security = await withPin()
        for (let i = 0; i < 5; i++) await security.verifyPin(WRONG)

        const t0 = security.lockoutRemainingMs()
        expect(t0).toBe(30_000)

        vi.advanceTimersByTime(10_000)
        const t10 = security.lockoutRemainingMs()

        vi.advanceTimersByTime(10_000)
        const t20 = security.lockoutRemainingMs()

        expect(t10).toBe(20_000)
        expect(t20).toBe(10_000)
        expect(t20).toBeLessThan(t10)
        expect(t10).toBeLessThan(t0)
    })

    it('kilit süresi dolunca sıfırlanır ve giriş yeniden açılır', async () => {
        const security = await withPin()
        for (let i = 0; i < 5; i++) await security.verifyPin(WRONG)

        // Kilitliyken doğru PIN bile kabul edilmemeli
        expect(await security.verifyPin(CORRECT)).toBe(false)

        vi.advanceTimersByTime(30_000)
        expect(security.lockoutRemainingMs()).toBe(0)
        expect(await security.verifyPin(CORRECT)).toBe(true)
    })

    it('kilitliyken yapılan denemeler sayaca EKLENMEZ', async () => {
        const security = await withPin()
        for (let i = 0; i < 5; i++) await security.verifyPin(WRONG)

        expect(security.settings.failedAttempts).toBe(5)

        // Kilitliyken 3 deneme daha: hepsi reddedilmeli ve sayaç artmamalı,
        // aksi halde saldırgan bekleme süresini "harcamadan" ilerletebilirdi.
        for (let i = 0; i < 3; i++) {
            expect(await security.verifyPin(WRONG)).toBe(false)
        }

        expect(security.settings.failedAttempts).toBe(5)
        expect(security.lockoutRemainingMs()).toBe(30_000)
    })

    it('kilit kademeli uzar — her kilit beklenerek (5→30sn, 8→5dk, 11→30dk)', async () => {
        const security = await withPin()

        // Kilit dolmadan yapılan denemeler sayılmadığı için her adımda beklenir.
        const failAfterWaiting = async () => {
            vi.advanceTimersByTime(security.lockoutRemainingMs())
            await security.verifyPin(WRONG)
        }

        for (let i = 0; i < 5; i++) await failAfterWaiting()
        expect(security.settings.failedAttempts).toBe(5)
        expect(security.lockoutRemainingMs()).toBe(30_000)

        for (let i = 0; i < 3; i++) await failAfterWaiting()
        expect(security.settings.failedAttempts).toBe(8)
        expect(security.lockoutRemainingMs()).toBe(5 * 60_000)

        for (let i = 0; i < 3; i++) await failAfterWaiting()
        expect(security.settings.failedAttempts).toBe(11)
        expect(security.lockoutRemainingMs()).toBe(30 * 60_000)
    })

    it('kilit Preferences’a yazılır — uygulamayı öldürmek atlatmaz', async () => {
        const security = await withPin()
        for (let i = 0; i < 5; i++) await security.verifyPin(WRONG)

        // Yeni pinia = uygulama yeniden başlatıldı; Preferences kalıcı.
        setActivePinia(createPinia())
        const restarted = useSecurityStore()
        await restarted.initialize()

        expect(restarted.settings.failedAttempts).toBe(5)
        expect(restarted.lockoutRemainingMs()).toBe(30_000)
        expect(await restarted.verifyPin(CORRECT)).toBe(false)
    })
})
