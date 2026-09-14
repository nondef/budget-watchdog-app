import { describe, expect, it } from 'vitest'
import { RefreshExchangeRateUseCase } from '@/application/use-cases/exchange-rate/refresh-exchange-rate.use-case'

const TRY = { id: 'try-id', code: 'TRY' }
const USD = { id: 'usd-id', code: 'USD' }
const EUR = { id: 'eur-id', code: 'EUR' }

function useCase(opts: {
    onUpsert?: () => void
    conversionRates?: Record<string, number | null>
} = {}) {
    const upserted: unknown[][] = []
    const calls: string[] = []
    let inTransaction = 0

    const instance = new RefreshExchangeRateUseCase(
        {
            async replaceForBase(_baseId: string, rates: unknown[]) {
                opts.onUpsert?.()
                calls.push('replaceForBase')
                upserted.push(rates)
            },
            async upsertMany(rates: unknown[]) {
                opts.onUpsert?.()
                calls.push('upsertMany')
                upserted.push(rates)
            },
        } as any,
        {
            async findById(id: string) { return [TRY, USD, EUR].find(c => c.id === id) ?? null },
            async findAll() { return [TRY, USD, EUR] },
        } as any,
        {
            async getExchangeRateData() {
                return {
                    conversionRates: opts.conversionRates ?? { USD: 0.031, EUR: 0.028 },
                    fetchedAt: new Date(2026, 6, 23),
                    provider: 'test',
                }
            },
        } as any,
        {
            async run<T>(work: () => Promise<T>) {
                inTransaction++
                try { return await work() } finally { inTransaction-- }
            },
        },
    )

    return { instance, upserted, calls, depth: () => inTransaction }
}

describe('RefreshExchangeRateUseCase', () => {
    it('kur yazımı transaction sınırı içinde yapılır', async () => {
        let depthDuringWrite = 0
        const uc = useCase({ onUpsert: () => { depthDuringWrite = uc.depth() } })

        const result = await uc.instance.execute(TRY.id)

        // Yarım yazma, bir kısmı taze bir kısmı bayat oranlarla tutarsız bir
        // kur tablosu bırakıyordu.
        expect(depthDuringWrite).toBe(1)
        expect(result.upserted).toBe(2)
        // Tam yanıt → snapshot: sağlayıcının artık döndürmediği eski satırlar
        // temizlensin diye replace kullanılır.
        expect(uc.calls).toEqual(['replaceForBase'])
    })

    it('yazma patlarsa hata yukarı taşınır (rollback UoW’a kalır)', async () => {
        const uc = useCase({ onUpsert: () => { throw new Error('disk dolu') } })

        await expect(uc.instance.execute(TRY.id)).rejects.toThrow('disk dolu')
    })

    it('eksik kalan birimi raporlar ama gelen kurları yazar', async () => {
        const uc = useCase({ conversionRates: { USD: 0.031, EUR: null, TRY: 1 } })

        const result = await uc.instance.execute(TRY.id)

        expect(result.upserted).toBe(1)
        expect(result.missingCodes).toEqual(['EUR'])
        // Kısmi yanıtta EUR'nun eldeki eski kuru silinmemeli: bayat ama
        // kullanılabilir bir kur yerine hiç kur kalmazsa o birimdeki bakiye
        // toplama hiç giremez. Eskiden tek eksik birim tüm yenilemeyi iptal
        // ediyordu; ECB tabanlı yedek sağlayıcı bu yüzden hiç iş göremiyordu.
        expect(uc.calls).toEqual(['upsertMany'])
    })

    it('hiç kullanılabilir kur yoksa hiçbir şey yazmaz', async () => {
        const uc = useCase({ conversionRates: { USD: null, EUR: null } })

        // Boş yanıtı "başarı" sayıp yazmak, çalışan bir kur grafiğini silerdi.
        await expect(uc.instance.execute(TRY.id)).rejects.toMatchObject({
            code: 'BUSINESS_RULE_VIOLATION'
        })
        expect(uc.upserted).toEqual([])
    })
})
