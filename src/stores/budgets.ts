import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { resolveRepository } from '@/infrastructure/database/repositories/resolve';
import {
    AccountRepository,
    BudgetRepository,
    CategoryRepository,
    CurrencyRepository,
    TransactionBudgetEffectRepository,
    TransactionRepository
} from '@/infrastructure/database/repositories';
import {
    BudgetDTO,
    CreateBudgetInput,
    CreateBudgetUseCase,
    UpdateBudgetInput,
    UpdateBudgetUseCase,
    ResetBudgetsUseCase,
    ResetBudgetUseCase,
    GetBudgetDetailUseCase,
    GetBudgetUseCase,
    DeleteBudgetUseCase,
    ListBudgetsUseCase,
    ChangeBudgetStatusUseCase,
    BudgetStatusAction
} from '@/application';
import { resolveUnitOfWork } from "@/infrastructure/database/repositories/resolve";
import { useExchangeRateStore } from '@/stores/exchange-rates';
import { useBudgetNotification } from "@/composables/features/useBudgetNotification";
import { TransactionCategorizationService } from '@/domain/services/transaction-categorization.service';

export const useBudgetStore = defineStore('budget', () => {
    const budgets = ref<BudgetDTO[]>([]);

    const exchangeRateStore = useExchangeRateStore();

    const budgetRepository = resolveRepository(BudgetRepository);
    const categoryRepository = resolveRepository(CategoryRepository);
    const accountRepository = resolveRepository(AccountRepository);
    const currencyRepository = resolveRepository(CurrencyRepository);
    const transactionRepository = resolveRepository(TransactionRepository)
    const effectRepository = resolveRepository(TransactionBudgetEffectRepository)

    const listBudgetsUseCase = new ListBudgetsUseCase(budgetRepository);

    /**
     * Hatırlatıcının OS'a yansımış son hâli: bütçe id → imza.
     *
     * Bu olmadan `syncResetReminders` her çağrıldığında bütçe başına iptal +
     * zamanlama gönderiyordu; çağrıldığı yer ise veri yükleme yoluydu
     * (`refreshBudgetList`). Native bir resume'da tek başına üç liste yüklemesi
     * oluyor (`runResetCheck` içinde iki, Home'a düşünce bir daha), yani 20
     * bütçede ~120 sıralı köprü turu — hepsi de listenin render'ını bekletiyor
     * ve ezici çoğunluğu hiçbir şeyi değiştirmiyordu.
     */
    const appliedReminders = new Map<string, string>();

    /** Hatırlatıcıyı belirleyen alanların tamamı. Biri değişirse yeniden kurulur. */
    const reminderSignature = (budget: BudgetDTO): string =>
        budget.status === 'active' && budget.enableNotifications && budget.nextResetDate
            ? `on|${new Date(budget.nextResetDate).getTime()}|${budget.name}`
            : 'off';

    /**
     * OS sıfırlama hatırlatıcılarını listedeki güncel `nextResetDate`'lerle
     * hizalar. Yalnızca **değişenlere** dokunur ve kalanı tek köprü turunda
     * gönderir.
     *
     * Tek noktadan senkron şart: rollover üç ayrı yoldan olabiliyor (App.vue
     * gece yarısı timer'ı, `loadBudgets`, işlem akışlarındaki
     * `rolloverDueBudgets`). Sonuncusu application katmanında sıfırlıyor ve
     * bildirim tarafına hiç dokunmuyordu; ardından çalışan `resetBudgets`
     * "sıfırlanacak bütçe yok" dediği için yeni dönemin hatırlatıcısı hiç
     * zamanlanmıyor, kullanıcı ise geçmiş dönemin hatırlatıcısını alıyordu.
     *
     * Listede olmayan bütçeye dokunulmaz: eksikliği "silinmiş" saymak, listenin
     * herhangi bir sebeple daraldığı anda hatırlatıcıları yanlışlıkla iptal
     * ederdi. Silme kendi iptalini `deleteBudget` içinde yapıyor.
     */
    const syncResetReminders = async () => {
        const {
            scheduleResetReminders,
            cancelResetReminders
        } = useBudgetNotification();

        const toSchedule: { budgetId: string; budgetName: string; at: Date }[] = [];
        const toCancel: string[] = [];
        const pending = new Map<string, string>();

        for (const budget of budgets.value) {
            const signature = reminderSignature(budget);

            if (appliedReminders.get(budget.id) === signature) continue;

            pending.set(budget.id, signature);

            if (budget.nextResetDate && signature !== 'off') {
                toSchedule.push({
                    budgetId: budget.id,
                    budgetName: budget.name,
                    at: new Date(budget.nextResetDate)
                });
            } else {
                toCancel.push(budget.id);
            }
        }

        if (!pending.size) return;

        const [scheduled, cancelled] = await Promise.all([
            scheduleResetReminders(toSchedule),
            cancelResetReminders(toCancel)
        ]);

        // Yalnızca OS'a gerçekten yansıyan imza önbelleğe alınır. Başarısız bir
        // çağrıyı "uygulandı" saymak, hatırlatıcıyı bütçe bir daha değişene
        // kadar kurulmaz bırakırdı.
        for (const [id, signature] of pending) {
            if (signature === 'off' ? cancelled : scheduled) {
                appliedReminders.set(id, signature);
            }
        }
    };

    const refreshBudgetList = async () => {
        budgets.value = (await listBudgetsUseCase.execute()).budgets;
        await syncResetReminders();
    };

    const loadBudgets = async () => {
        // Dönemi dolmuş bütçeleri göstermeden önce devret. Okuma use-case'leri
        // bilinçli olarak yan etkisizdir (mutate-on-read anti-pattern'i); rollover
        // bu yüzden store orkestrasyonunda tetiklenir. Yazma akışları
        // (`AddTransaction`/`UpdateTransaction`) da eşleştirmeden önce aynısını
        // yapıyor — böylece liste, işlem akışlarıyla aynı güncel dönemi gösterir.
        await resetBudgets();
        await refreshBudgetList();
    };

    // `loadActiveBudgets` kaldırıldı: `loadBudgets` ile AYNI ref'e yazıyor ama
    // farklı bir küme yüklüyordu. Home onu, BudgetGoalsPage `loadBudgets`'i
    // çağırdığı için `budgets.value`'nun anlamı en son hangi sayfanın
    // geçtiğine bağlıydı; Home'dan sonra `budgetById()` duraklatılmış bir
    // bütçe için undefined dönüyordu. Aktif küme zaten `activeBudgets`
    // computed'ıyla türetiliyor, ayrı bir yükleme yolu gereksiz.

    const addBudget = async (input: CreateBudgetInput) => {
        const useCase = new CreateBudgetUseCase(
            budgetRepository,
            categoryRepository,
            currencyRepository,
            accountRepository,
            transactionRepository,
            effectRepository,
            new TransactionCategorizationService(),
            resolveUnitOfWork()
        );
        const result = await useCase.execute(input);

        const plain = result.budget;
        budgets.value.push(plain);

        // Hatırlatıcı planlaması tek yerde: yeni bütçe listeye girdikten sonra
        // senkron, `status`/`enableNotifications` kurallarını da uygular.
        await syncResetReminders();

        return plain;
    };

    const updateBudget = async (input: UpdateBudgetInput) => {
        const useCase = new UpdateBudgetUseCase(
            budgetRepository,
            categoryRepository,
            accountRepository,
            transactionRepository,
            effectRepository,
            new TransactionCategorizationService(),
            resolveUnitOfWork()
        )

        const result = await useCase.execute(input)

        const index = budgets.value.findIndex(b => b.id === result.budget.id)

        if (index !== -1) {
            budgets.value[index] = result.budget;
        }

        // Tutar/kategori düzenlemesi bütçeyi uyarı eşiğine ulaştırdıysa/aştıysa
        // kullanıcıyı bilgilendir (işlem akışlarıyla aynı sözleşme).
        if (result.budgetNotification) {
            const { notifyWarning, notifyExceeded } = useBudgetNotification();
            if (result.budgetNotification.type === 'exceeded') {
                notifyExceeded(result.budgetNotification.budgetName);
            } else {
                notifyWarning(
                    result.budgetNotification.budgetName,
                    result.budgetNotification.progress
                );
            }
        }

        // Dönem düzenlemesi `nextResetDate`'i değiştirmiş olabilir; hatırlatıcı
        // eski tarihte kalmasın (ekleme ve toplu sıfırlama akışlarıyla aynı).
        await syncResetReminders();

        return result.budget;
    };

    const deleteBudget = async (budgetId: string) => {
        await new DeleteBudgetUseCase(budgetRepository, resolveUnitOfWork()).execute({ id: budgetId });

        const index = budgets.value.findIndex(b => b.id === budgetId);

        if (index !== -1) {
            budgets.value.splice(index, 1);
        }

        const { cancelResetReminder } = useBudgetNotification();
        await cancelResetReminder(budgetId);

        // Aynı id ile yeni bir bütçe yaratılırsa (import/geri yükleme) bayat
        // imza yüzünden hatırlatıcısı hiç kurulmasın.
        appliedReminders.delete(budgetId);

        return true;
    };

    // `addSpending` kaldırıldı: bütçenin harcamasını karşılık gelen bir işlem
    // yaratmadan artırıyordu ve bu harcama hiçbir silme/güncelleme akışıyla geri
    // alınamıyordu. Harcama tek yoldan işlenir: `transactions.addTransaction`.

    /** Tek bütçenin güncel dönem harcama geçmişini elle temizler. */
    const resetBudget = async (budgetId: string) => {
        const useCase = new ResetBudgetUseCase(
            budgetRepository,
            transactionRepository,
            effectRepository,
            new TransactionCategorizationService(),
            resolveUnitOfWork()
        );
        const budget = await useCase.execute({ id: budgetId });

        const index = budgets.value.findIndex(b => b.id === budgetId);

        if (index !== -1) {
            budgets.value[index] = budget;
        }

        await syncResetReminders();

        return budget;
    };

    const resetBudgets = async () => {
        const useCase = new ResetBudgetsUseCase(
            budgetRepository,
            effectRepository,
            resolveUnitOfWork()
        );
        const result = await useCase.execute();

        if (result.resetCount > 0) {
            // `refreshBudgetList` kullanılır, `loadBudgets` değil: `loadBudgets`
            // yeniden `resetBudgets`'i çağırıp karşılıklı özyineleme oluştururdu.
            // Yeni dönem hatırlatıcıları da onun içindeki `syncResetReminders`
            // ile planlanır; burada ayrıca döngü kurmaya gerek yok.
            await refreshBudgetList();
        }

        return result;
    };

    /**
     * Durum geçişleri use-case üzerinden yürür: eskiden store doğrudan
     * repository + entity kullandığı için "bulunamadı" hatası ham `Error`
     * oluyordu (i18n'e girmiyordu) ve geçiş kuralları test edilemiyordu.
     */
    const changeBudgetStatus = async (budgetId: string, action: BudgetStatusAction) => {
        const useCase = new ChangeBudgetStatusUseCase(
            budgetRepository,
            accountRepository,
            effectRepository,
            resolveUnitOfWork()
        );
        const budget = await useCase.execute({ id: budgetId, action });

        const index = budgets.value.findIndex(b => b.id === budgetId);

        if (index !== -1) {
            budgets.value[index] = budget;
        }

        // Kural tekrarı yok: hatırlatıcının olup olmayacağını `status` +
        // `enableNotifications` + `nextResetDate` belirliyor ve bunu tek yerde
        // `reminderSignature` biliyor. Eskiden aynı kurallar burada action
        // bazında ikinci kez yazılıydı ve ikisi ayrışabilirdi.
        await syncResetReminders();

        return budget;
    }

    const pauseBudget = (budgetId: string) => changeBudgetStatus(budgetId, 'pause');
    const resumeBudget = (budgetId: string) => changeBudgetStatus(budgetId, 'resume');
    const completeBudget = (budgetId: string) => changeBudgetStatus(budgetId, 'complete');

    const budgetById = (id: string) => {
        return budgets.value.find(b => b.id === id);
    };

    const getBudgetById = async (id: string) => {
        const cached = budgetById(id)

        if (cached) return cached;

        return new GetBudgetUseCase(budgetRepository).execute({ id });
    };

    const getBudgetDetail = async (budgetId: string) => {
        const query = new GetBudgetDetailUseCase(
            budgetRepository,
            accountRepository,
            categoryRepository,
            currencyRepository,
            transactionRepository,
            effectRepository,
            resolveUnitOfWork()
        )

        return await query.execute({ id: budgetId });
    }

    const activeBudgets = computed(() =>
        budgets.value.filter(b => b.status === 'active')
    );

    // Eşik mantığı entity'de yaşar (`Budget.isWarning`/`isExceeded`); store
    // bölmeyi yeniden yazmak yerine DTO'daki hazır bayrakları kullanır ki iki
    // yerde kural ayrışmasın.
    const warningBudgets = computed(() =>
        activeBudgets.value.filter(b => b.isWarning)
    );

    const exceededBudgets = computed(() =>
        activeBudgets.value.filter(b => b.isExceeded)
    );

    /**
     * Aktif bütçelerin ana para birimindeki toplamları.
     *
     * Bütçeler farklı para birimlerinde olabildiği için ham `amount` toplamak
     * anlamsız bir sayı üretirdi; hesap toplamıyla aynı yol (`sumInBase`)
     * kullanılır ve kuru bulunamayan bütçe toplama katılmaz.
     */
    const totalBudgetAmount = computed(() =>
        exchangeRateStore.sumInBase(
            activeBudgets.value.map(budget => ({
                amount: budget.amount.amount,
                currencyId: budget.amount.currencyId,
            }))
        ).total
    );

    const totalSpentAmount = computed(() =>
        exchangeRateStore.sumInBase(
            activeBudgets.value.map(budget => ({
                amount: budget.spentAmount.amount,
                currencyId: budget.spentAmount.currencyId,
            }))
        ).total
    );

    const getBudgetProgress = computed(() => (budgetId: string) => {
        const budget = budgets.value.find(b => b.id === budgetId);
        if (!budget || budget.amount.amount === 0) return 0;
        return Math.min((budget.spentAmount.amount / budget.amount.amount) * 100, 100);
    });

    return {
        // State
        budgets,

        // Data Loading
        loadBudgets,

        // Actions
        addBudget,
        updateBudget,
        deleteBudget,
        resetBudget,
        resetBudgets,
        pauseBudget,
        resumeBudget,
        completeBudget,
        changeBudgetStatus,
        syncResetReminders,

        // Getters
        budgetById,
        getBudgetById,

        // Computed
        activeBudgets,
        totalBudgetAmount,
        totalSpentAmount,
        warningBudgets,
        exceededBudgets,
        getBudgetProgress,
        getBudgetDetail,
    };
});
