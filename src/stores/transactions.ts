import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { TransactionCategorizationService } from "@/domain";
import { resolveRepository } from "@/infrastructure/database/repositories/resolve";
import { resolveUnitOfWork } from "@/infrastructure/database/repositories/resolve";
import {
    AccountRepository,
    BudgetRepository,
    CategoryRepository,
    CurrencyRepository,
    TransactionBudgetEffectRepository,
    TransactionRepository
} from "@/infrastructure/database/repositories";
import {
    AddTransactionInput,
    AddTransactionUseCase,
    BudgetNotification,
    DeleteTransactionUseCase,
    GetTransactionUseCase,
    SkippedBudget,
    SkippedBudgetReason,
    TransactionDTO,
    UpdateTransactionInput,
    UpdateTransactionUseCase,
    PreviewTransactionBudgetImpactInput,
    PreviewTransactionBudgetImpactUseCase
} from "@/application";
import { useToast } from "@/composables/ui/useToast";
import { i18n } from "@/i18n";
import { useBudgetNotification } from "@/composables/features/useBudgetNotification";
import { useBudgetStore } from "@/stores/budgets";
import { useAccountsStore } from '@/stores/accounts';
import { ListTransactionUseCase } from "@/application/use-cases/transaction/list-transaction.use-case";

const LIST_PAGE_SIZE = 50
/** Home kartındaki "son işlemler" sayısı. */
const RECENT_LIMIT = 10
/**
 * `rangeCache`'te tutulacak azami aralık sayısı.
 *
 * Sınırsızdı: kullanıcının gezdiği her ay/hafta/yıl birikiyordu ve her işlem
 * mutasyonu hepsini yeniden çekiyordu.
 */
const RANGE_CACHE_LIMIT = 12
// Aralık (özet/grafik) sorguları için sayfa boyutu; use-case limiti 100 ile
// sınırlı.
const RANGE_PAGE_SIZE = 100

export const useTransactionsStore = defineStore('transactions', () => {
    /**
     * TransactionsPage'in sayfalanmış listesi — "tüm işlemler" değil, yüklenmiş
     * sayfaların birleşimi. `total`/`hasNext`/`nextOffset` bu listenin imleci.
     *
     * TEK SAHİBİ TransactionsPage. Eskiden dört sayfa (Home, Overview,
     * Categories, Transactions) aynı ref'i birbirinden habersiz yazıyordu:
     * kullanıcı listede 250 kayda kadar kaydırıp Home'a geçtiğinde Home'un
     * `loadTransactions()`'ı diziyi ilk 50'ye ve imleci 50'ye sıfırlıyor, geri
     * dönüldüğünde liste sessizce 200 kayıt kaybetmiş oluyordu. Home artık
     * `recent`'i, Overview/Categories ise `rangeCache`'i kullanıyor.
     */
    const transactions = ref<TransactionDTO[]>([]);
    const total = ref(0)
    const hasNext = ref(false)
    const nextOffset = ref(0)
    const listLoading = ref(false)

    /** Home'un "son işlemler" kartı. Sayfalamadan tamamen bağımsız. */
    const recent = ref<TransactionDTO[]>([])

    const transactionRepository = resolveRepository(TransactionRepository)
    const accountRepository = resolveRepository(AccountRepository)
    const budgetRepository = resolveRepository(BudgetRepository)
    const categoryRepository = resolveRepository(CategoryRepository)
    const currencyRepository = resolveRepository(CurrencyRepository)
    const effectRepository = resolveRepository(TransactionBudgetEffectRepository)
    const categoryService = new TransactionCategorizationService()
    const unitOfWork = resolveUnitOfWork()
    const listTransactionUseCase = new ListTransactionUseCase(transactionRepository, unitOfWork)

    const applyFirstPage = (page: { items: TransactionDTO[]; total: number; hasNext: boolean }) => {
        transactions.value = page.items
        total.value = page.total
        hasNext.value = page.hasNext
        nextOffset.value = page.items.length
    }

    const loadTransactions = async () => {
        applyFirstPage(await listTransactionUseCase.execute({ limit: LIST_PAGE_SIZE, offset: 0 }))
    }

    /**
     * Home'un kartı için son N işlem. Sayfalama durumuna DOKUNMAZ — eskiden
     * bu da `applyFirstPage` çağırıp `nextOffset`'i 10'a çekiyordu, sonraki
     * `loadNextPage()` ise sayfa boyutunu 50 varsayarak kayıt atlıyordu.
     */
    const loadRecentTransactions = async (limit: number = RECENT_LIMIT) => {
        const page = await listTransactionUseCase.execute({ limit })
        recent.value = page.items
    }

    /**
     * Liste ekranı için bir sonraki sayfayı yükleyip mevcut listeye ekler
     * (infinite-scroll). Araya ekleme/silme girerse aynı id iki kez eklenmesin
     * diye birleştirme id bazlı yapılır.
     */
    const loadNextPage = async () => {
        if (!hasNext.value || listLoading.value) return

        listLoading.value = true
        try {
            const page = await listTransactionUseCase.execute({
                limit: LIST_PAGE_SIZE,
                offset: nextOffset.value
            })
            const seen = new Set(transactions.value.map(t => t.id))
            for (const item of page.items) {
                if (!seen.has(item.id)) transactions.value.push(item)
            }
            total.value = page.total
            hasNext.value = page.hasNext
            nextOffset.value += page.items.length
        } finally {
            listLoading.value = false
        }
    }

    // ===== Özet/grafik için tarih-aralığı verisi (sayfalamadan bağımsız) =====
    // Özetler (gelir/gider, nakit akışı, kategori kırılımı) truncated liste
    // yerine buradan beslenir; aksi halde 50'den fazla işlemde yanlış toplam
    // çıkıyordu. Aralık sorguları sınırlı (ay/hafta/yıl) olduğu için tüm
    // sayfalar çekilir.
    const rangeCache = ref<Record<string, TransactionDTO[]>>({})
    const rangeInFlight = new Map<string, Promise<TransactionDTO[]>>()

    const rangeKey = (startDate?: Date, endDate?: Date) =>
        `${startDate ? startDate.getTime() : ''}|${endDate ? endDate.getTime() : ''}`

    /**
     * O an ekranda gösterilen aralıklar (anahtar → izleyici sayısı).
     *
     * Tahliye bunlara dokunamaz. Dokunsaydı: `useRangeTransactions`'ın watch'ı
     * yalnızca aralık DEĞİŞİNCE tetikleniyor, dolayısıyla görüntülenen bir
     * aralık cache'ten atıldığında yeniden çekilmiyor ve özet kalıcı olarak
     * 0,00 ₺ gösteriyor. (Ölçtüm: 15 ay gezmek Home'un gelir/giderini
     * sıfırlıyordu.)
     */
    const observedRanges = new Map<string, number>()

    /**
     * Aralığı tahliyeden korur. `useRangeTransactions` mount'ta çağırır,
     * dönen fonksiyonu unmount'ta / aralık değişince çalıştırır.
     */
    const retainRange = (startDate?: Date, endDate?: Date): (() => void) => {
        const key = rangeKey(startDate, endDate)
        observedRanges.set(key, (observedRanges.get(key) ?? 0) + 1)

        let released = false

        return () => {
            if (released) return
            released = true

            const remaining = (observedRanges.get(key) ?? 1) - 1
            if (remaining > 0) observedRanges.set(key, remaining)
            else observedRanges.delete(key)
        }
    }

    /** Sınırı aşan ve izlenmeyen en eski aralıkları atar. */
    const evict = (cache: Record<string, TransactionDTO[]>): Record<string, TransactionDTO[]> => {
        // Object anahtar sırası ekleme sırasını korur → baştakiler en eski.
        const excess = Object.keys(cache).length - RANGE_CACHE_LIMIT
        if (excess <= 0) return cache

        for (const key of Object.keys(cache).filter(k => !observedRanges.has(k)).slice(0, excess)) {
            delete cache[key]
        }

        return cache
    }

    const loadRange = async (startDate?: Date, endDate?: Date): Promise<TransactionDTO[]> => {
        const key = rangeKey(startDate, endDate)
        const pending = rangeInFlight.get(key)
        if (pending) return pending

        const task = (async () => {
            const items: TransactionDTO[] = []
            let offset = 0

            for (;;) {
                const page = await listTransactionUseCase.execute({
                    startDate,
                    endDate,
                    limit: RANGE_PAGE_SIZE,
                    offset
                })
                items.push(...page.items)
                if (!page.hasNext || page.items.length === 0) break
                offset += page.items.length
            }

            rangeCache.value = evict({ ...rangeCache.value, [key]: items })
            return items
        })()

        rangeInFlight.set(key, task)
        try {
            return await task
        } finally {
            rangeInFlight.delete(key)
        }
    }

    const rangeTransactions = (startDate?: Date, endDate?: Date): TransactionDTO[] =>
        rangeCache.value[rangeKey(startDate, endDate)] ?? []

    /** Cache anahtarındaki aralık verilen anı kapsıyor mu. */
    const rangeCovers = (key: string, at: number): boolean => {
        const [start, end] = key.split('|')
        return at >= (start ? Number(start) : -Infinity)
            && at <= (end ? Number(end) : Infinity)
    }

    /**
     * Bir mutasyon sonrası özet cache'ini tazeler.
     *
     * Cache'i boşaltmak yetmez: tüketici (useRangeTransactions) watch'ı yalnız
     * aralık DEĞİŞİNCE tetikler, aynı ayı görüntülerken özet boş kalırdı. Bu
     * yüzden etkilenen aralıklar yerinde yeniden çekilir; reaktif cache
     * güncellenince özet kendiliğinden tazelenir.
     *
     * Yalnızca **etkilenen** aralıklar çekilir: işlemin tarihini kapsamayan bir
     * aralık o işlemden etkilenemez. Eskiden cache'teki her aralık yeniden
     * çekiliyordu — 12 ay gezmiş bir kullanıcının tek işlem eklemesi onlarca
     * sayfalı sorgu tetikliyordu.
     *
     * Tarih bilinmiyorsa (ör. güncellemede eski tarih hiçbir cache'te yok)
     * hepsi tazelenir: eksik tazeleme sessizce yanlış toplam gösterir.
     */
    const refreshCachedRanges = async (...dates: (Date | string | undefined)[]) => {
        const stamps = dates
            .filter((date): date is Date | string => date !== undefined)
            .map(date => new Date(date).getTime())
            .filter(Number.isFinite)

        const keys = Object.keys(rangeCache.value).filter(
            key => !stamps.length || stamps.some(at => rangeCovers(key, at))
        )

        await Promise.all(keys.map(key => {
            const [start, end] = key.split('|')
            return loadRange(
                start ? new Date(Number(start)) : undefined,
                end ? new Date(Number(end)) : undefined
            )
        }))
    }

    /** Bir işlemin bilinen tarihi — güncellemede ESKİ aralığı bulmak için. */
    const cachedDateOf = (id: string): Date | undefined => {
        for (const items of Object.values(rangeCache.value)) {
            const hit = items.find(item => item.id === id)
            if (hit) return new Date(hit.date)
        }

        const local = transactions.value.find(item => item.id === id)
            ?? recent.value.find(item => item.id === id)

        return local ? new Date(local.date) : undefined
    }

    /**
     * Sebep → çeviri anahtarı. Anahtarlar sabit yazılır ki i18n bekçisi
     * (`tests/i18n-keys.spec.ts`) eksik çeviriyi yakalayabilsin; birleştirilerek
     * üretilen anahtar statik olarak doğrulanamıyor.
     */
    const SKIPPED_BUDGET_MESSAGE: Record<SkippedBudgetReason, string> = {
        'out-of-period': 'budgets.alerts.notAppliedOutOfPeriod',
        'before-manual-reset': 'budgets.alerts.notAppliedBeforeManualReset',
        'inactive': 'budgets.alerts.notAppliedInactive',
        'currency-mismatch': 'budgets.alerts.notAppliedCurrencyMismatch',
        'unknown': 'budgets.alerts.notApplied',
    }

    /**
     * Domain kuralı gereği harcaması bütçeye yansıtılamayan kayıtlar için
     * kullanıcıyı uyarır. Eskiden bu durum yalnızca log'a düşüyor, kullanıcı
     * bütçesinin neden ilerlemediğini göremiyordu.
     *
     * Mesaj sebebe göre kurulur: yalnızca bütçe adını göstermek "neden
     * yansımadı" sorusunu cevapsız bırakıyordu. Aynı sebepteki bütçeler tek
     * toast'ta toplanır, farklı sebepler ayrı toast alır — sebep karışık
     * listelendiğinde metin hangi bütçenin hangi yüzden atlandığını söylemezdi.
     */
    const warnSkippedBudgets = (skipped: SkippedBudget[]) => {
        if (!skipped.length) return

        const { warning } = useToast()

        const byReason = new Map<SkippedBudgetReason, string[]>()

        for (const budget of skipped) {
            // Eski kayıtlar/testler `reason` taşımayabilir; genel metne düş.
            const reason = budget.reason ?? 'unknown'
            const names = byReason.get(reason) ?? []

            names.push(budget.budgetName)
            byReason.set(reason, names)
        }

        for (const [reason, names] of byReason) {
            warning(i18n.global.t(SKIPPED_BUDGET_MESSAGE[reason], {
                names: names.join(', ')
            }))
        }
    }

    /**
     * Bütçe uyarı/aşım bildirimlerini gösterir. Ekleme ve güncelleme aynı
     * yolu kullanır: güncelleme eskiden hiç bildirim üretmiyordu.
     */
    const notifyBudgets = (notifications: BudgetNotification[]) => {
        if (!notifications.length) return

        const { notifyWarning, notifyExceeded } = useBudgetNotification()

        for (const n of notifications) {
            if (n.type === 'exceeded') notifyExceeded(n.budgetName)
            else if (n.type === 'warning') notifyWarning(n.budgetName, n.progress)
        }
    }

/**
     * İşlemi kaydetmeden önce hangi bütçeleri limit üstüne taşıyacağını
     * söyler. Salt okunur — hiçbir şey yazmaz, çağrılmaması da güvenlidir.
     *
     * Sunum katmanı bunu onay diyaloğu için kullanır; kaydın kendisi yine
     * `addTransaction` üzerinden gider ve bütçe etkisini orası işler.
     */
    const previewBudgetImpact = async (input: PreviewTransactionBudgetImpactInput) => {
        const useCase = new PreviewTransactionBudgetImpactUseCase(
            budgetRepository,
            currencyRepository,
            categoryService,
            unitOfWork,
            effectRepository
        )

        return useCase.execute(input)
    }

    const addTransaction = async (input: AddTransactionInput) => {
        const useCase = new AddTransactionUseCase(
            transactionRepository,
            accountRepository,
            budgetRepository,
            categoryService,
            categoryRepository,
            currencyRepository,
            effectRepository,
            unitOfWork
        )

        // İşlem + hesap(lar) + bütçe yazımları tek transaction'da: ya hep ya hiç.
        const result = await useCase.execute(input)

        // Sayfalanmış listeye ELLE EKLENMEZ. Yeni kayıt sıralamada nereye
        // düştüğüne göre imleci kaydırıyor; sona push etmek hem sırayı hem
        // `total`/`nextOffset`'i tutarsız bırakıyordu. TransactionsPage'e geri
        // dönüldüğünde `ionViewWillEnter` zaten ilk sayfayı tazeliyor.
        void refreshCachedRanges(result.transaction.date)
        void loadRecentTransactions()

        notifyBudgets(result.budgetNotifications ?? [])
        warnSkippedBudgets(result.skippedBudgets)

        const refreshes: Promise<void>[] = [useAccountsStore().loadAccounts()]
        if (input.type === 'expense') {
            refreshes.push(useBudgetStore().loadBudgets())
        }
        await Promise.all(refreshes)

        return result.transaction
    }

    const deleteTransaction = async (id: string) => {
        const useCase = new DeleteTransactionUseCase(
            transactionRepository,
            accountRepository,
            budgetRepository,
            effectRepository,
            unitOfWork
        );

        // Aralık tazelemesi için tarih SİLMEDEN ÖNCE okunmalı.
        const removedAt = cachedDateOf(id)

        const result = await useCase.execute({ id })

        if (result.success) {
            const index = transactions.value.findIndex(t => t.id === id);
            if (index !== -1) {
                transactions.value.splice(index, 1);

                // İmleç yüklenmiş satır sayısını izlemek zorunda: satır
                // silindiğinde alttaki sıralama bir yukarı kayıyor ve imleç
                // eski değerinde kalırsa sonraki sayfa bir kaydı KALICI olarak
                // atlıyordu (id bazlı dedupe bunu yakalamaz).
                nextOffset.value = transactions.value.length
                total.value = Math.max(0, total.value - 1)
            }

            void refreshCachedRanges(removedAt)
            void loadRecentTransactions()
        }

        warnSkippedBudgets(result.skippedBudgets)

        // Silme hesap ve bütçeleri değiştirmiş olabilir — iki cache'i de tazele.
        await Promise.all([
            useBudgetStore().loadBudgets(),
            useAccountsStore().loadAccounts(),
        ]);

        return result.success;
    }

    /**
     * Tek işlemi DTO olarak döner. Eskiden domain entity'sinin kendisini
     * döndürüyordu; çağıranlar (düzenleme ekranı) `as any` cast'i yapmak
     * zorunda kalıyordu.
     */
    const findTransactionById = async (id: string) => {
        return new GetTransactionUseCase(transactionRepository).execute({ id })
    }

    // İşlem güncelle
    const updateTransaction = async (input: UpdateTransactionInput) => {
        const useCase = new UpdateTransactionUseCase(
            transactionRepository,
            accountRepository,
            categoryRepository,
            budgetRepository,
            categoryService,
            effectRepository,
            currencyRepository,
            unitOfWork
        )

        // Tarih değişmiş olabilir: hem ESKİ hem YENİ tarihi kapsayan aralıklar
        // etkilenir. Eskisi güncellemeden önce okunmalı.
        const previousAt = cachedDateOf(input.id)

        const result = await useCase.execute(input)

        // Kayıt sayısı değişmiyor, dolayısıyla imleç de değişmiyor: yerinde
        // güncellemek güvenli.
        const index = transactions.value.findIndex(transaction => transaction.id === result.transaction.id)

        if (index !== -1) {
            transactions.value[index] = result.transaction
        }

        void refreshCachedRanges(previousAt, result.transaction.date)
        void loadRecentTransactions()

        notifyBudgets(result.budgetNotifications)
        warnSkippedBudgets(result.skippedBudgets)

        // Güncelleme hesap ve bütçeleri değiştirmiş olabilir — iki cache'i de tazele.
        await Promise.all([
            useBudgetStore().loadBudgets(),
            useAccountsStore().loadAccounts(),
        ])

        return result.transaction
    }

    // Kaldırılanlar: `clearAllTransactions`, `transactionById`,
    // `incomeTransactions`, `expenseTransactions`, `transferTransactions`,
    // `loadThisMonthTransactions`. Hiçbirinin çağıranı yoktu ve hepsi
    // sayfalanmış listeyi "tüm işlemler" sanan hesaplar yapıyordu — 50'den
    // fazla kayıtta sessizce eksik sonuç veren bir tuzak.

    /**
     * Home kartı için son işlemler, tarihe göre azalan.
     *
     * `date` DTO'da Date olarak taşınır; yine de kalıcı katmandan string gelme
     * ihtimaline karşı savunmacı çevrim yapılır.
     */
    const sortedByDateDesc = computed(() =>
        [...recent.value].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )
    )

    return {
        // State — sayfalanmış liste (sahibi: TransactionsPage)
        transactions,
        total,
        hasNext,
        listLoading,

        // State — Home kartı
        recent,

        // Actions
        loadTransactions,
        loadRecentTransactions,
        loadNextPage,
        loadRange,
        retainRange,
        rangeTransactions,
        previewBudgetImpact,
        addTransaction,
        updateTransaction,
        deleteTransaction,

        // Computed
        sortedByDateDesc,

        findTransactionById,
    };
});
