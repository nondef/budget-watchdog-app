import type { RateEdge } from './types'

export interface RatePathStep {
    to: string
    rate: number
    asOf: number
}

/**
 * Yönsüz kur grafiği. Her kur çifti için ileri VE ters kenar tutulur; böylece
 * A→B kuru varsa B→A otomatik türetilir. Direkt kur yoksa iki birim arası en
 * kısa köprü yol BFS ile bulunur (ör. TRY→USD→EUR).
 *
 * Neden ağırlıksız BFS: en az durak = en az kümülatif yuvarlama hatası ve
 * genelde en yüksek güven. Tazeliğe göre optimize eden bir varyant Dijkstra'ya
 * geçebilir; buradaki sade seçim kasıtlı.
 */
export class RateGraph {
    private readonly adj = new Map<string, Map<string, RatePathStep>>()

    static from(edges: Iterable<RateEdge>): RateGraph {
        const g = new RateGraph()
        for (const e of edges) g.addEdge(e)
        return g
    }

    addEdge(e: RateEdge): void {
        if (!(e.rate > 0) || e.from === e.to) return
        this.link(e.from, e.to, e.rate, e.asOf)
        this.link(e.to, e.from, 1 / e.rate, e.asOf)   // ters kur
    }

    /** from→to en kısa yol (adım listesi). Yol yoksa null. from===to ise []. */
    shortestPath(from: string, to: string): RatePathStep[] | null {
        if (from === to) return []
        if (!this.adj.has(from) || !this.adj.has(to)) return null

        const prev = new Map<string, { via: string; step: RatePathStep }>()
        const queue: string[] = [from]
        const seen = new Set<string>([from])

        while (queue.length) {
            const node = queue.shift() as string
            const row = this.adj.get(node)
            if (!row) continue

            for (const [next, step] of row) {
                if (seen.has(next)) continue
                seen.add(next)
                prev.set(next, { via: node, step })
                if (next === to) return this.reconstruct(prev, from, to)
                queue.push(next)
            }
        }
        return null
    }

    private link(from: string, to: string, rate: number, asOf: number): void {
        let row = this.adj.get(from)
        if (!row) {
            row = new Map()
            this.adj.set(from, row)
        }
        const existing = row.get(to)
        // Aynı çift için birden fazla kur gelirse en tazesini tut.
        if (!existing || asOf > existing.asOf) {
            row.set(to, { to, rate, asOf })
        }
    }

    private reconstruct(
        prev: Map<string, { via: string; step: RatePathStep }>,
        from: string,
        to: string,
    ): RatePathStep[] {
        const steps: RatePathStep[] = []
        let cur = to
        while (cur !== from) {
            const p = prev.get(cur) as { via: string; step: RatePathStep }
            steps.push(p.step)
            cur = p.via
        }
        return steps.reverse()
    }
}
