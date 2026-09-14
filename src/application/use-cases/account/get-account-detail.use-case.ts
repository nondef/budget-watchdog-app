import {
    IAccountRepository,
    IBudgetRepository,
    ICurrencyRepository,
    IMoney,
    ISavingGoalContributionRepository,
    ISavingGoalRepository,
    ITransactionBudgetEffectRepository,
    ITransactionRepository,
    IUnitOfWork,
    OUTGOING_CONTRIBUTION_TYPES,
    Budget,
    SavingGoalContribution,
    Transaction,
} from '@/domain';
import { assertExists } from '@/application/shared/assert-exists';
import {
    AccountMapper,
    BudgetMapper,
    SavingGoalContributionMapper,
    SavingGoalMapper,
    TransactionMapper,
} from '@/application/mappers';
import {
    AccountMovementBudgetRef,
    AccountMovementDTO,
    GetAccountDetailInput,
    GetAccountDetailOutput,
} from '@/application/dto/account-detail.dto';

const DEFAULT_MOVEMENT_LIMIT = 100;

/**
 * Bir hesabın tam görünümü: hareketleri, bağlı bütçeleri ve birikim hedefleri.
 *
 * Var oluş sebebi: hesap bakiyesi iki ayrı kaynaktan değişiyor — işlemler ve
 * birikim hedefi hareketleri — ama uygulama yalnızca ilkini gösterebiliyordu.
 * Hedefe para ayırmak bakiyeyi sessizce düşürüyor, kullanıcı farkı hiçbir
 * listede göremiyordu. Burada iki defter tek zaman çizgisinde birleşir.
 *
 * Birleştirme yalnızca GÖSTERİM içindir: birikim hareketleri `transactions`
 * tablosuna yazılmaz, dolayısıyla bütçe ve nakit akışı hesapları etkilenmez.
 */
export class GetAccountDetailUseCase {
    constructor(
        private accountRepository: IAccountRepository,
        private transactionRepository: ITransactionRepository,
        private budgetRepository: IBudgetRepository,
        private savingGoalRepository: ISavingGoalRepository,
        private contributionRepository: ISavingGoalContributionRepository,
        private effectRepository: ITransactionBudgetEffectRepository,
        private currencyRepository: ICurrencyRepository,
        private unitOfWork?: IUnitOfWork
    ) {}

    async execute(input: GetAccountDetailInput): Promise<GetAccountDetailOutput> {
        // Bakiye, işlemler ve defter tek snapshot içinde okunmalı: aralarına
        // giren bir yazma, bakiyeyi bir veri durumundan hareketleri başka
        // durumdan getirip ekranda tutmayan bir tablo üretirdi.
        const runRead =
            this.unitOfWork?.read?.bind(this.unitOfWork)
            ?? this.unitOfWork?.run?.bind(this.unitOfWork)
            ?? (<T>(work: () => Promise<T>) => work());

        return runRead(() => this.read(input));
    }

    private async read(input: GetAccountDetailInput): Promise<GetAccountDetailOutput> {
        const limit = input.movementLimit ?? DEFAULT_MOVEMENT_LIMIT;

        const account = await assertExists(
            'Account',
            input.accountId,
            id => this.accountRepository.findById(id)
        );

        const currency = await this.currencyRepository.findById(account.balance.currencyId);
        const minorUnit = currency?.minorUnit ?? 2;

        const [transactions, budgets, savingGoals, contributions] = await Promise.all([
            this.transactionRepository.findByAccount(input.accountId),
            this.budgetRepository.findByAccount(input.accountId),
            this.savingGoalRepository.findByAccount(input.accountId),
            this.contributionRepository.findByAccount(input.accountId),
        ]);

        const goalNames = new Map(savingGoals.map(goal => [goal.id, goal.name]));

        const movements = [
            ...transactions.map(tx => this.toTransactionMovement(tx, input.accountId)),
            ...contributions.map(entry => this.toContributionMovement(entry, goalNames, minorUnit)),
        ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

        const totals = this.totals(movements, account.balance.currencyId, minorUnit);
        const page = movements.slice(0, limit);

        await this.attachBudgetRefs(page, budgets, minorUnit);

        return {
            account: AccountMapper.toDTO(account),
            movements: page,
            budgets: BudgetMapper.toDTOList(budgets),
            savingGoals: SavingGoalMapper.toDTOList(savingGoals),
            totals,
            hasMoreMovements: movements.length > page.length,
        };
    }

    /**
     * Transfer'in iki bacağı da bu hesabı ilgilendirebilir: kaynaksa para
     * çıkar (`amount`), hedefse girer ve tutar hedef hesabın para birimindeki
     * `toAmount`'tır — kur dönüşümlü transferde `amount` yanlış olurdu.
     */
    private toTransactionMovement(
        transaction: Transaction,
        accountId: string
    ): AccountMovementDTO {
        const dto = TransactionMapper.toDTO(transaction);
        const isDestination = dto.type === 'transfer' && dto.toAccountId === accountId;

        const amount: IMoney = isDestination
            ? dto.toAmount ?? dto.amount
            : dto.amount;

        const direction = dto.type === 'income' || isDestination ? 'in' : 'out';

        return {
            id: `tx:${dto.id}`,
            kind: 'transaction',
            direction,
            amount,
            occurredAt: new Date(dto.date),
            transaction: dto,
        };
    }

    /**
     * Hedefe ayrılan para hesaptan ÇIKAR, geri çekilen/iade edilen para GİRER.
     * `savedAmount` yönüyle terstir: defter hedefin değil hesabın gözünden
     * okunur.
     */
    private toContributionMovement(
        entry: SavingGoalContribution,
        goalNames: Map<string, string>,
        minorUnit: number
    ): AccountMovementDTO {
        const dto = SavingGoalContributionMapper.toDTO(entry, minorUnit);

        return {
            id: `sg:${entry.id}`,
            kind: 'savingGoal',
            direction: OUTGOING_CONTRIBUTION_TYPES.includes(entry.type) ? 'in' : 'out',
            amount: dto.amount,
            occurredAt: entry.occurredAt,
            contribution: dto,
            savingGoalName: goalNames.get(entry.goalId),
        };
    }

    /**
     * Gider işlemlerinin hangi bütçelere yazıldığını efekt defterinden ekler.
     * Tek toplu sorgu: sayfa başına işlem sayısı kadar sorgu atmak listeyi
     * gözle görülür yavaşlatıyordu.
     */
    private async attachBudgetRefs(
        movements: AccountMovementDTO[],
        budgets: Budget[],
        minorUnit: number
    ): Promise<void> {
        const expenseIds = movements
            .filter(m => m.kind === 'transaction' && m.transaction?.type === 'expense')
            .map(m => m.transaction!.id);

        if (!expenseIds.length) return;

        const effects = await this.effectRepository.findByTransactions(expenseIds);
        if (!effects.length) return;

        const budgetNames = new Map(budgets.map(budget => [budget.id, budget.name]));
        const byTransaction = new Map<string, AccountMovementBudgetRef[]>();

        for (const effect of effects) {
            const refs = byTransaction.get(effect.transactionId) ?? [];
            refs.push({
                budgetId: effect.budgetId,
                // Bütçe başka bir hesaba taşınmış olabilir; adı bulunamazsa
                // satır yine de gösterilir, isim tarafını UI çözer.
                budgetName: budgetNames.get(effect.budgetId) ?? '',
                amount: {
                    amount: effect.amount,
                    currencyId: effect.currencyId,
                    minorUnit,
                },
            });
            byTransaction.set(effect.transactionId, refs);
        }

        for (const movement of movements) {
            if (movement.kind !== 'transaction' || !movement.transaction) continue;
            const refs = byTransaction.get(movement.transaction.id);
            if (refs?.length) movement.budgets = refs;
        }
    }

    private totals(
        movements: AccountMovementDTO[],
        currencyId: string,
        minorUnit: number
    ) {
        let income = 0;
        let expense = 0;
        let allocated = 0;
        let transactionCount = 0;

        for (const movement of movements) {
            if (movement.kind === 'transaction') {
                transactionCount++;
                // Transfer'ler gelir/gider değildir: iki hesap arasında yer
                // değiştiren para toplamları şişirirdi.
                if (movement.transaction?.type === 'income') income += movement.amount.amount;
                if (movement.transaction?.type === 'expense') expense += movement.amount.amount;
                continue;
            }

            // Hedefe ayrılan (hesaptan çıkan) artı, geri dönen eksi: net
            // "şu an hedeflerde bağlı olan para".
            allocated += movement.direction === 'out'
                ? movement.amount.amount
                : -movement.amount.amount;
        }

        const money = (amount: number): IMoney => ({ amount, currencyId, minorUnit });

        return {
            income: money(income),
            expense: money(expense),
            allocatedToGoals: money(allocated),
            transactionCount,
            movementCount: movements.length,
        };
    }
}
