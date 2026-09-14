import { describe, expect, it } from 'vitest'
import {
    CurrencyConverter,
    CurrencyFormatter,
    DEFAULT_FRESH_WINDOW,
    type CurrencyMeta,
    type RateEdge,
} from '@/domain/services/currency-conversion'

const NOW = 1_700_000_000_000
const now = () => NOW
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
// Testler tazelik mekanizmasını ölçer, seçilen varsayılan pencereyi değil:
// eşik açıkça verilir. Varsayılanın kendisi ayrı bir testte doğrulanır.
const FRESH_WINDOW = 30 * MINUTE

const edges = (...list: Array<Partial<RateEdge> & Pick<RateEdge, 'from' | 'to' | 'rate'>>): RateEdge[] =>
    list.map(e => ({ asOf: NOW, ...e }))

describe('CurrencyConverter', () => {
    it('direkt kurla çevirir', () => {
        const c = new CurrencyConverter(edges({ from: 'USD', to: 'TRY', rate: 32.5 }), { now })

        const r = c.convert(10, 'USD', 'TRY')

        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.output).toBe(325)
        expect(r.bridged).toBe(false)
        expect(r.path).toEqual(['USD', 'TRY'])
    })

    it('ters kuru otomatik türetir', () => {
        const c = new CurrencyConverter(edges({ from: 'USD', to: 'TRY', rate: 32.5 }), { now })

        const r = c.convert(325, 'TRY', 'USD')

        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.output).toBeCloseTo(10, 10)
    })

    it('direkt kur yoksa ara duraktan köprüler', () => {
        const c = new CurrencyConverter(
            edges(
                { from: 'USD', to: 'TRY', rate: 32.5 },
                { from: 'EUR', to: 'USD', rate: 1.08 },
            ),
            { now },
        )

        const r = c.convert(100, 'EUR', 'TRY')

        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.output).toBeCloseTo(3510, 6)
        expect(r.bridged).toBe(true)
        expect(r.path).toEqual(['EUR', 'USD', 'TRY'])
    })

    it('birden fazla durak üzerinden zincirler', () => {
        const c = new CurrencyConverter(
            edges(
                { from: 'TRY', to: 'USD', rate: 0.03 },
                { from: 'USD', to: 'EUR', rate: 0.9 },
                { from: 'EUR', to: 'GBP', rate: 0.85 },
            ),
            { now },
        )

        const r = c.convert(1000, 'TRY', 'GBP')

        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.output).toBeCloseTo(1000 * 0.03 * 0.9 * 0.85, 6)
        expect(r.path).toEqual(['TRY', 'USD', 'EUR', 'GBP'])
    })

    it('aynı para birimi için 1:1 döner', () => {
        const c = new CurrencyConverter([], { now })

        const r = c.convert(50, 'TRY', 'TRY')

        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.output).toBe(50)
        expect(r.rate).toBe(1)
    })

    it('yol bulunamazsa no-path döner', () => {
        const c = new CurrencyConverter(edges({ from: 'USD', to: 'TRY', rate: 32.5 }), { now })

        const r = c.convert(1, 'XAU', 'TRY')

        expect(r.ok).toBe(false)
        if (r.ok) return
        expect(r.reason).toBe('no-path')
    })

    it('geçersiz tutarı reddeder', () => {
        const c = new CurrencyConverter(edges({ from: 'USD', to: 'TRY', rate: 32.5 }), { now })

        const r = c.convert(Number.NaN, 'USD', 'TRY')

        expect(r.ok).toBe(false)
        if (r.ok) return
        expect(r.reason).toBe('invalid-amount')
    })

    it('tazelik penceresi aşılınca stale işaretler ama çevirmeye devam eder', () => {
        const c = new CurrencyConverter(
            edges({ from: 'USD', to: 'TRY', rate: 32.5, asOf: NOW - 90 * MINUTE }),
            { now, freshWindowMs: FRESH_WINDOW },
        )

        const r = c.convert(10, 'USD', 'TRY')

        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.confidence).toBe('stale')
        expect(r.ageMs).toBe(90 * MINUTE)
        expect(r.output).toBe(325)
    })

    it('rejectStale açıkken bayat kuru reddeder', () => {
        const c = new CurrencyConverter(
            edges({ from: 'USD', to: 'TRY', rate: 32.5, asOf: NOW - 90 * MINUTE }),
            { now, rejectStale: true, freshWindowMs: FRESH_WINDOW },
        )

        const r = c.convert(10, 'USD', 'TRY')

        expect(r.ok).toBe(false)
        if (r.ok) return
        expect(r.reason).toBe('stale-only')
    })

    // Sağlayıcılar kuru günde bir yayımlıyor; saat ölçeğinde bir kur bayat
    // değildir. Pencere dakika ölçeğine düşerse uygulama yarım saat açık
    // kaldığında tüm tutarları `~` ile işaretleyip eksik kur banner'ı açıyordu.
    it('varsayılan tazelik penceresi gün ölçeğindedir', () => {
        const c = new CurrencyConverter(
            edges({ from: 'USD', to: 'TRY', rate: 32.5, asOf: NOW - 6 * HOUR }),
            { now },
        )

        const r = c.convert(10, 'USD', 'TRY')

        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.confidence).toBe('fresh')
        expect(DEFAULT_FRESH_WINDOW).toBe(24 * HOUR)
    })

    it('zincirdeki en eski kura göre yaş hesaplar', () => {
        const c = new CurrencyConverter(
            edges(
                { from: 'USD', to: 'TRY', rate: 32.5, asOf: NOW },
                { from: 'EUR', to: 'USD', rate: 1.08, asOf: NOW - 10 * MINUTE },
            ),
            { now },
        )

        const r = c.convert(100, 'EUR', 'TRY')

        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.ageMs).toBe(10 * MINUTE)
    })

    it('aynı çift için en taze kuru kullanır', () => {
        const c = new CurrencyConverter(
            edges(
                { from: 'USD', to: 'TRY', rate: 30, asOf: NOW - 60 * MINUTE },
                { from: 'USD', to: 'TRY', rate: 32.5, asOf: NOW },
            ),
            { now },
        )

        const r = c.convert(10, 'USD', 'TRY')

        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.output).toBe(325)
    })

    it('geçersiz kuru yok sayar', () => {
        const c = new CurrencyConverter(edges({ from: 'USD', to: 'TRY', rate: 0 }), { now })

        expect(c.convert(10, 'USD', 'TRY').ok).toBe(false)
    })
})

describe('CurrencyConverter.sum', () => {
    const converter = new CurrencyConverter(
        edges(
            { from: 'TRY', to: 'USD', rate: 0.03 },
            { from: 'TRY', to: 'EUR', rate: 0.028 },
        ),
        { now },
    )

    it('farklı para birimlerini hedef birimde toplar', () => {
        const r = converter.sum(
            [
                { amount: 1000, currencyId: 'TRY' },
                { amount: 30, currencyId: 'USD' },
            ],
            'TRY',
        )

        expect(r.total).toBeCloseTo(2000, 6)
        expect(r.missing).toEqual([])
    })

    it('kuru olmayan kalemi toplama katmaz ve raporlar', () => {
        const r = converter.sum(
            [
                { amount: 1000, currencyId: 'TRY' },
                { amount: 5, currencyId: 'XAU' },
            ],
            'TRY',
        )

        expect(r.total).toBe(1000)
        expect(r.missing).toEqual(['XAU'])
    })

    it('tek bayat kalem toplamın güvenini düşürür', () => {
        const c = new CurrencyConverter(
            edges(
                { from: 'TRY', to: 'USD', rate: 0.03, asOf: NOW - 90 * MINUTE },
                { from: 'TRY', to: 'EUR', rate: 0.028, asOf: NOW },
            ),
            { now, freshWindowMs: FRESH_WINDOW },
        )

        const r = c.sum(
            [
                { amount: 28, currencyId: 'EUR' },
                { amount: 30, currencyId: 'USD' },
            ],
            'TRY',
        )

        expect(r.confidence).toBe('stale')
    })
})

describe('CurrencyFormatter', () => {
    const meta: Record<string, CurrencyMeta> = {
        TRY: { symbol: '₺', minorUnit: 2 },
        USD: { symbol: '$', minorUnit: 2 },
        JPY: { symbol: '¥', minorUnit: 0 },
    }
    const fmt = new CurrencyFormatter(id => meta[id] ?? null)

    it('sembolü varsayılan olarak sona koyar', () => {
        expect(fmt.formatAmount(1000, 'TRY')).toBe('1.000,00 ₺')
    })

    it('sembolü başa koyabilir', () => {
        expect(fmt.formatAmount(1000, 'USD', { position: 'start' })).toBe('$ 1.000,00')
    })

    it('negatif işareti sembolden önce yazar', () => {
        expect(fmt.formatAmount(-50, 'TRY')).toBe('-50,00 ₺')
        expect(fmt.formatAmount(-50, 'TRY', { position: 'start' })).toBe('-₺ 50,00')
    })

    it('para biriminin minorUnit değerini kullanır', () => {
        expect(fmt.formatAmount(1000, 'JPY')).toBe('1.000 ¥')
    })

    it('açık decimals minorUnit değerini ezer', () => {
        expect(fmt.formatAmount(1000, 'TRY', { decimals: 0 })).toBe('1.000 ₺')
    })

    it('gruplama kapatılabilir', () => {
        expect(fmt.formatAmount(1000, 'TRY', { useGrouping: false })).toBe('1000,00 ₺')
    })

    it('sembol gizlenebilir', () => {
        expect(fmt.formatAmount(1000, 'TRY', { showSymbol: false })).toBe('1.000,00')
    })

    it('locale değişince ayırıcılar değişir', () => {
        expect(fmt.formatAmount(1000, 'USD', { locale: 'en-US', position: 'start' }))
            .toBe('$ 1,000.00')
    })

    it('bilinmeyen para birimini sembolsüz formatlar', () => {
        expect(fmt.formatAmount(1000, 'XAU')).toBe('1.000,00')
    })

    it('maskeleme tutarı gizler', () => {
        expect(fmt.formatAmount(1000, 'TRY', { mask: true })).toBe('••••')
    })

    it('constructor defaults çağrı bazında ezilebilir', () => {
        const masked = new CurrencyFormatter(id => meta[id] ?? null, { mask: true })

        expect(masked.formatAmount(1000, 'TRY')).toBe('••••')
        expect(masked.formatAmount(1000, 'TRY', { mask: false })).toBe('1.000,00 ₺')
    })

    it('başarısız dönüşümü missingText ile gösterir', () => {
        const c = new CurrencyConverter([], { now })

        expect(fmt.format(c.convert(1, 'XAU', 'TRY'))).toBe('—')
    })

    it('approxMarker açıkken köprülenmiş sonucu ~ ile işaretler', () => {
        const c = new CurrencyConverter(
            edges(
                { from: 'USD', to: 'TRY', rate: 32.5 },
                { from: 'EUR', to: 'USD', rate: 1.08 },
            ),
            { now },
        )

        expect(fmt.format(c.convert(100, 'EUR', 'TRY'), { approxMarker: true }))
            .toBe('~3.510,00 ₺')
    })

    it('approxMarker kapalıyken ~ eklemez', () => {
        const c = new CurrencyConverter(
            edges(
                { from: 'USD', to: 'TRY', rate: 32.5 },
                { from: 'EUR', to: 'USD', rate: 1.08 },
            ),
            { now },
        )

        expect(fmt.format(c.convert(100, 'EUR', 'TRY'))).toBe('3.510,00 ₺')
    })

    it('maskelenmiş sonuca ~ eklemez', () => {
        const c = new CurrencyConverter(
            edges(
                { from: 'USD', to: 'TRY', rate: 32.5 },
                { from: 'EUR', to: 'USD', rate: 1.08 },
            ),
            { now },
        )

        expect(fmt.format(c.convert(100, 'EUR', 'TRY'), { approxMarker: true, mask: true }))
            .toBe('••••')
    })
})
