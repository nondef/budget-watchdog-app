/** Kur grafiğindeki tek kenar: 1 `from` = `rate` × `to`. */
export interface RateEdge {
    from: string        // currencyId
    to: string          // currencyId
    rate: number        // 1 from = rate * to  (rate > 0)
    asOf: number        // epoch ms — kurun geçerlilik anı
    source?: string     // 'ecb' | 'openerapi' | 'manual' ...
}

export type Confidence = 'fresh' | 'stale'

export interface ConversionSuccess {
    ok: true
    from: string
    to: string
    input: number
    output: number
    /** Efektif kur: input * rate = output. */
    rate: number
    /** Dönüşümün geçtiği zincir: [from, ...ara duraklar, to]. */
    path: string[]
    /** Zincirdeki en eski kurun yaşı (ms). */
    ageMs: number
    confidence: Confidence
    /** Ara durak veya ters kur kullanıldıysa true (birebir direkt kur değil). */
    bridged: boolean
}

export type ConversionFailureReason =
    | 'no-path'          // iki birim arasında (köprüyle bile) yol yok
    | 'stale-only'       // yol var ama sadece bayat kurla, politika reddetti
    | 'invalid-amount'   // NaN / Infinity

export interface ConversionFailure {
    ok: false
    from: string
    to: string
    input: number
    reason: ConversionFailureReason
}

export type ConversionResult = ConversionSuccess | ConversionFailure

export interface SumResult {
    total: number
    to: string
    /** Kuru bulunamadığı için toplanamayan kalemlerin currencyId listesi. */
    missing: string[]
    /** Toplama katılan kalemler içindeki en kötü güven seviyesi. */
    confidence: Confidence
}
