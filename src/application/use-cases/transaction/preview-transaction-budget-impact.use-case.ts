import {
    IBudgetRepository,
    ICurrencyRepository,
    ITransactionBudgetEffectRepository,
    IUnitOfWork,
    Money,
    Transaction,
    TransactionBudgetEffect,
} from '@/domain';
import { TransactionCategorizationService } from '@/domain/services/transaction-categorization.service';
import { assertExists } from '@/application/shared/assert-exists';
import {
    BudgetLimitBreach,
    PreviewTransactionBudgetImpactInput,
    PreviewTransactionBudgetImpactOutput,
} from '@/application/dto/transaction.dto';

/**
 * Bir işlem KAYDEDİLMEDEN ÖNCE hangi bütçelerin limit üstünde kalacağını
 * hesaplar. Hiçbir şey yazmaz ve hiçbir entity'yi değiştirmez.
 *
 * Zaten aşılmış bütçeler de raporlanır (`alreadyExceeded`): sınırı bu işlem
 * geçirmiyor olsa da bütçe yine aşılıyor ve kullanıcının uyarılması gerekiyor.
 *
 * Hem yeni işlem hem düzenleme için çalışır. Düzenlemede `transactionId`
 * verilir: işlemin bütçelere hâlihazırda yazılmış etkisi düşülür, çünkü
 * `UpdateTransactionUseCase` de eski etkiyi geri alıp yenisini uyguluyor.
 * Düşülmezse tutar iki kez sayılır ve olmayan bir aşım raporlanırdı.
 *
 * Kuralları kopyalamamak için eşleştirme `AddTransactionUseCase` ile aynı
 * `findMatchingBudgets` üzerinden, aşım kararı ise entity'nin `wouldExceedWith`
 * sorgusuyla verilir; o da `isExceeded` ile aynı özel eşiği kullanır. Böylece
 * eşik ya da eşleştirme ileride değişirse diyalog ile gerçek sonuç birlikte
 * değişir.
 *
 * `addSpending` çağırıp sonucu okumak daha da doğrudan olurdu ama repository'den
 * gelen entity'yi kirletiyordu: aynı nesne üzerinde ikinci bir önizleme
 * harcamayı üst üste toplayıp olmayan bir aşım raporluyordu.
 */
export class PreviewTransactionBudgetImpactUseCase {
    constructor(
        private budgetRepository: IBudgetRepository,
        private currencyRepository: ICurrencyRepository,
        private categorizationService: TransactionCategorizationService,
        private unitOfWork?: IUnitOfWork,
        private effectRepository?: ITransactionBudgetEffectRepository
    ) {}

    async execute(
        input: PreviewTransactionBudgetImpactInput
    ): Promise<PreviewTransactionBudgetImpactOutput> {
        // Yalnız giderler bütçe tüketir; gelir/transfer için sorgu bile açma.
        if (input.type !== 'expense') {
            return { breaches: [] };
        }

        const runRead =
            this.unitOfWork?.read?.bind(this.unitOfWork)
            ?? this.unitOfWork?.run?.bind(this.unitOfWork)
            ?? (<T>(work: () => Promise<T>) => work());

        return runRead(() => this.read(input));
    }

    private async read(
        input: PreviewTransactionBudgetImpactInput
    ): Promise<PreviewTransactionBudgetImpactOutput> {
        const currency = await assertExists(
            'Currency',
            input.currencyId,
            id => this.currencyRepository.findById(id)
        );

        const amount = Money.create(input.amount, input.currencyId, currency.minorUnit);

        // Taslak işlem: yalnızca eşleştirme girdisi, hiçbir yere kaydedilmez.
        // `Transaction.create` boş başlık kabul etmediği için sabit bir yer
        // tutucu veriliyor — başlık eşleştirmeye girmiyor.
        const draft = Transaction.create({
            title: 'preview',
            amount: input.amount,
            currencyId: input.currencyId,
            minorUnit: currency.minorUnit,
            categoryId: input.categoryId,
            accountId: input.accountId,
            date: input.date,
            type: 'expense',
        });

        const activeBudgets = await this.budgetRepository.findActive();
        const existingEffects = await this.loadExistingEffects(input.transactionId);

        // Eşleştirme `addSpending`in guard'larını zaten kapsıyor: aktiflik,
        // para birimi, kategori/hesap ve dönem. Bu filtreden geçen bir bütçe
        // harcamayı gerçekten alır, dolayısıyla ayrıca try/catch gerekmez.
        const matching = this.categorizationService.findMatchingBudgets(draft, activeBudgets);
        const now = new Date();
        const breaches: BudgetLimitBreach[] = [];

        for (const budget of matching) {
            // Bildirimleri kapatılmış bütçe "bu bütçe için beni uyarma"
            // demektir (ayarın açıklaması: "Eşik aşıldığında uyar"); onay
            // diyaloğu da bir uyarı kanalı olduğu için aynı tercihe uyar.
            if (!budget.enableNotifications) continue;

            // Düzenlemede, bu işlemin bu bütçeye YAZILI olan tutarı yenisiyle
            // yer değiştirir. Dönem eşleşmesi şart: `UpdateTransactionUseCase`
            // de yalnızca `periodStart` tutan efektleri geri alıyor, kapanmış
            // dönemin efekti güncel harcamadan düşülemez.
            const replacing = this.replacedAmount(existingEffects, budget.id, budget.periodStart, budget.amount.minorUnit);

            // Tutarı düşüren ya da değiştirmeyen bir düzenleme bütçeyi daha
            // kötü hale getirmiyor; başlık/not düzenlemek için aşılmış bir
            // bütçede diyalog çıkarmak sadece gürültü olurdu.
            if (replacing && !amount.isGreaterThan(replacing)) continue;

            if (!budget.wouldExceedWith(amount, now, replacing)) continue;

            const spentAfter = budget.spentAmountWith(amount, now, replacing);
            const spentBefore = budget.spentAmountAsOf(now);
            const zero = Money.zero(budget.amount.currencyId, budget.amount.minorUnit);
            const alreadyExceeded = spentBefore.isGreaterThanOrEqual(budget.amount);

            breaches.push({
                budgetId: budget.id,
                budgetName: budget.name,
                limit: budget.amount.toPlainObject(),
                spentBefore: spentBefore.toPlainObject(),
                spentAfter: spentAfter.toPlainObject(),
                overBy: spentAfter.subtract(budget.amount).toPlainObject(),
                alreadyExceeded,
                overByBefore: (alreadyExceeded
                    ? spentBefore.subtract(budget.amount)
                    : zero).toPlainObject(),
            });
        }

        return { breaches };
    }

    private async loadExistingEffects(transactionId?: string): Promise<TransactionBudgetEffect[]> {
        if (!transactionId || !this.effectRepository) return [];
        return this.effectRepository.findByTransaction(transactionId);
    }

    /** İşlemin bu bütçenin GÜNCEL dönemine yazılmış tutarı (yoksa `undefined`). */
    private replacedAmount(
        effects: TransactionBudgetEffect[],
        budgetId: string,
        periodStart: Date,
        minorUnit: number
    ): Money | undefined {
        const effect = effects.find(e =>
            e.budgetId === budgetId &&
            e.periodStart.getTime() === periodStart.getTime()
        );

        return effect
            ? Money.create(effect.amount, effect.currencyId, minorUnit)
            : undefined;
    }
}
