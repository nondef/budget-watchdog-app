import { RateGraph } from './rate-graph'
import type { Confidence, ConversionResult, RateEdge, SumResult } from './types'

export interface ConverterOptions {
    /** Kurun taze sayıldığı pencere (ms). Aşılırsa confidence='stale'. */
    freshWindowMs?: number
    /** true ise sadece bayat kur bulunan dönüşüm 'stale-only' ile başarısız olur. */
    rejectStale?: boolean
    /** Şimdiki zaman — test için enjekte edilebilir. */
    now?: () => number
}

/**
 * Tazelik penceresi sağlayıcının yayın temposuna göre seçilir: kullandığımız
 * kur sağlayıcıları (open-er-api vb.) günde bir güncelliyor, dolayısıyla saat
 * ölçeğinde bir kur "eski" değildir. Pencere 30 dk iken uygulama yarım saatten
 * uzun açık kaldığı anda tüm tutarlar `~` ile işaretleniyor ve eksik kur
 * banner'ı — yenilenecek bir şey olmamasına rağmen — açılıyordu.
 */
export const DEFAULT_FRESH_WINDOW = 24 * 60 * 60 * 1000   // 24 saat

/**
 * Kur grafiği üzerinde durak-bazlı dönüşüm yapan saf domain servisi.
 * Reaktivite, store, i18n, sembol — hiçbiri burada yok; sadece sayı üretir.
 * Immutable: kurlar değişince yeni bir CurrencyConverter kurulur.
 */
export class CurrencyConverter {
    private readonly graph: RateGraph
    private readonly freshWindowMs: number
    private readonly rejectStale: boolean
    private readonly now: () => number

    constructor(edges: Iterable<RateEdge>, opts: ConverterOptions = {}) {
        this.graph = RateGraph.from(edges)
        this.freshWindowMs = opts.freshWindowMs ?? DEFAULT_FRESH_WINDOW
        this.rejectStale = opts.rejectStale ?? false
        this.now = opts.now ?? (() => Date.now())
    }

    convert(amount: number, from: string, to: string): ConversionResult {
        if (!Number.isFinite(amount)) {
            return { ok: false, from, to, input: amount, reason: 'invalid-amount' }
        }

        if (from === to) {
            return {
                ok: true, from, to,
                input: amount, output: amount, rate: 1,
                path: [from], ageMs: 0, confidence: 'fresh', bridged: false,
            }
        }

        const path = this.graph.shortestPath(from, to)
        if (!path || path.length === 0) {
            return { ok: false, from, to, input: amount, reason: 'no-path' }
        }

        let rate = 1
        let oldest = this.now()
        for (const step of path) {
            rate *= step.rate
            if (step.asOf < oldest) oldest = step.asOf
        }

        const ageMs = Math.max(0, this.now() - oldest)
        const confidence: Confidence = ageMs <= this.freshWindowMs ? 'fresh' : 'stale'

        if (confidence === 'stale' && this.rejectStale) {
            return { ok: false, from, to, input: amount, reason: 'stale-only' }
        }

        return {
            ok: true, from, to,
            input: amount,
            output: amount * rate,
            rate,
            path: [from, ...path.map(s => s.to)],
            ageMs,
            confidence,
            bridged: path.length > 1,
        }
    }

    /** Farklı kurlardaki kalemleri tek hedef birime toplar. */
    sum(items: Array<{ amount: number; currencyId: string }>, to: string): SumResult {
        let total = 0
        const missing: string[] = []
        let confidence: Confidence = 'fresh'

        for (const it of items) {
            const r = this.convert(it.amount, it.currencyId, to)
            if (!r.ok) {
                missing.push(it.currencyId)
                continue
            }
            total += r.output
            if (r.confidence === 'stale') confidence = 'stale'
        }

        return { total, to, missing, confidence }
    }
}
