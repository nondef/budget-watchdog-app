import {
    Account,
    AccountInactiveException,
    Budget,
    BusinessRuleViolationException,
    CurrencyMismatchException,
    DomainException,
    EntityNotFoundException,
    IAccountRepository,
    IBudgetRepository,
    ICategoryRepository,
    ICurrencyRepository,
    ITransactionBudgetEffectRepository,
    ITransactionRepository,
    IUnitOfWork,
    Money,
    RequiredFieldException,
    Transaction,
    TransactionBudgetEffect,
    TransferDestinationAmountRequiredException,
    TransferRequiresDestinationException,
    TransferSameAccountException
} from '@/domain';
import { TransactionCategorizationService } from '@/domain/services/transaction-categorization.service';
import {
    BudgetNotification,
    SkippedBudget,
    UpdateTransactionInput,
    UpdateTransactionOutput
} from '@/application/dto/transaction.dto';
import { TransactionMapper } from '@/application/mappers';
import { assertExists } from '@/application/shared/assert-exists';
import { buildBudgetNotification } from '@/application/shared/build-budget-notification';
import { rolloverDueBudgets } from '@/application/shared/rollover-due-budgets';
import { skippedBudgetReason } from '@/application/shared/skipped-budget-reason';

type BalanceEffect = Map<string, number>;
type BudgetAlertLevel = 'none' | 'warning' | 'exceeded';

interface BudgetAlertSnapshot {
    level: BudgetAlertLevel;
    periodStart: number;
}

interface TransactionChangeSet {
    anyChanged: boolean;
    balanceChanged: boolean;
    budgetCoverageChanged: boolean;
    destinationChanged: boolean;
}

const ALERT_RANK: Record<BudgetAlertLevel, number> = {
    none: 0,
    warning: 1,
    exceeded: 2
};

export class UpdateTransactionUseCase {
    constructor(
        private transactionRepository: ITransactionRepository,
        private accountRepository: IAccountRepository,
        private categoryRepository: ICategoryRepository,
        private budgetRepository: IBudgetRepository,
        private categorizationService: TransactionCategorizationService,
        private effectRepository: ITransactionBudgetEffectRepository,
        private currencyRepository: ICurrencyRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: UpdateTransactionInput): Promise<UpdateTransactionOutput> {
        return this.unitOfWork.run(async () => {
            const transaction = await this.transactionRepository.findById(input.id);

            if (!transaction) {
                throw new EntityNotFoundException('Transaction', input.id);
            }

            if (
                !transaction.isTransfer() &&
                (
                    input.toAccountId !== undefined ||
                    input.toAmount !== undefined
                )
            ) {
                throw new BusinessRuleViolationException(
                    'Only transfers have destination fields',
                    { transactionId: transaction.id }
                );
            }

            const changes = this.classifyChanges(transaction, input);

            if (!changes.anyChanged) {
                return {
                    transaction: TransactionMapper.toDTO(transaction),
                    budgetNotifications: [],
                    skippedBudgets: []
                };
            }

            if (!transaction.isTransfer()) {
                const categoryId = input.categoryId ?? transaction.categoryId;
                const category = await assertExists(
                    'Category',
                    categoryId,
                    id => this.categoryRepository.findById(id)
                );

                if (category.type !== transaction.type) {
                    throw new BusinessRuleViolationException(
                        `A ${transaction.type} transaction requires a ${transaction.type} category`,
                        {
                            categoryId: category.id,
                            categoryType: category.type,
                            transactionType: transaction.type
                        }
                    );
                }
            }

            const oldEffect = changes.balanceChanged
                ? this.balanceEffectOf(transaction)
                : new Map<string, number>();
            const oldBudgetEffects = changes.budgetCoverageChanged
                ? await this.effectRepository.findByTransaction(transaction.id)
                : [];
            const alertBefore = changes.budgetCoverageChanged
                ? new Map<string, BudgetAlertSnapshot>(
                    (await this.budgetRepository.findActive()).map(budget => [
                        budget.id,
                        {
                            level: this.alertLevel(budget),
                            periodStart: budget.periodStart.getTime()
                        }
                    ])
                )
                : new Map<string, BudgetAlertSnapshot>();

            let destinationAccount: Account | null = null;
            let destinationCurrencyMinorUnit: number | null = null;

            if (changes.destinationChanged) {
                destinationAccount = await assertExists(
                    'Account',
                    input.toAccountId,
                    id => this.accountRepository.findById(id)
                );

                if (!destinationAccount.isActive) {
                    throw new AccountInactiveException(destinationAccount.id);
                }

                const destinationCurrency = await assertExists(
                    'Currency',
                    destinationAccount.currencyId,
                    id => this.currencyRepository.findById(id)
                );
                destinationCurrencyMinorUnit = destinationCurrency.minorUnit;
            }

            transaction.updateDetails({
                title: input.title,
                amount: input.amount,
                toAmount:
                    transaction.isTransfer() && !changes.destinationChanged
                        ? input.toAmount
                        : undefined,
                description: input.description,
                categoryId: input.categoryId,
                date: input.date,
                notes: input.notes,
                accountId: input.accountId,
                toAccountId:
                    transaction.isTransfer() && !changes.destinationChanged
                        ? input.toAccountId
                        : undefined
            });

            if (
                changes.destinationChanged &&
                destinationAccount &&
                destinationCurrencyMinorUnit !== null
            ) {
                let destinationAmount = input.toAmount;

                if (destinationAmount === undefined) {
                    if (destinationAccount.currencyId === transaction.currencyId) {
                        destinationAmount = transaction.amount.amount;
                    } else if (
                        transaction.toAmount?.currencyId ===
                        destinationAccount.currencyId
                    ) {
                        destinationAmount = transaction.toAmount.amount;
                    } else {
                        throw new TransferDestinationAmountRequiredException();
                    }
                }

                transaction.changeTransferDestination(
                    destinationAccount.id,
                    Money.create(
                        destinationAmount,
                        destinationAccount.currencyId,
                        destinationCurrencyMinorUnit
                    )
                );
            }

            if (!transaction.accountId) {
                throw new RequiredFieldException('transaction account');
            }
            if (transaction.isTransfer() && !transaction.toAccountId) {
                throw new TransferRequiresDestinationException();
            }
            if (transaction.isTransfer() && transaction.accountId === transaction.toAccountId) {
                throw new TransferSameAccountException(transaction.accountId ?? '');
            }

            const accounts = new Map<string, Account>();

            if (changes.balanceChanged) {
                const previousAccountIds = new Set(oldEffect.keys());
                const newEffect = this.balanceEffectOf(transaction);
                const loaded = await this.loadAffectedAccounts(
                    new Set([...oldEffect.keys(), ...newEffect.keys()])
                );

                await this.assertNewAccountsUsable(
                    transaction,
                    loaded,
                    previousAccountIds
                );
                this.reapplyBalanceEffect(loaded, oldEffect, newEffect);

                for (const [id, account] of loaded) {
                    accounts.set(id, account);
                }
            }

            const skippedBudgets: SkippedBudget[] = [];
            const budgetNotifications: BudgetNotification[] = [];

            let newEffects: TransactionBudgetEffect[] = [];

            if (changes.budgetCoverageChanged) {
                await this.reverseBudgetEffects(oldBudgetEffects);
                await this.effectRepository.deleteByTransaction(transaction.id);

                newEffects = await this.applyBudgetEffects(
                    transaction,
                    skippedBudgets,
                    budgetNotifications,
                    alertBefore
                );
            }

            for (const account of accounts.values()) {
                await this.accountRepository.save(account);
            }
            await this.transactionRepository.save(transaction);
            if (changes.budgetCoverageChanged) {
                await this.effectRepository.saveMany(newEffects);
            }

            return {
                transaction: TransactionMapper.toDTO(transaction),
                budgetNotifications,
                skippedBudgets
            };
        });
    }

    private balanceEffectOf(transaction: Transaction): BalanceEffect {
        const result = new Map<string, number>();
        const add = (id: string | undefined, value: number) => {
            if (id) result.set(id, (result.get(id) ?? 0) + value);
        };

        if (transaction.isIncome()) add(transaction.accountId, transaction.amount.amount);
        if (transaction.isExpense()) add(transaction.accountId, -transaction.amount.amount);
        if (transaction.isTransfer()) {
            // Kaynak bacak kaynak para biriminde, hedef bacak hedef para
            // biriminde. Her hesabın etki değeri kendi para birimindedir; eski
            // (toAmount'suz) transferlerde hedef = kaynak tutar.
            const toAmount = transaction.toAmount?.amount ?? transaction.amount.amount;
            add(transaction.accountId, -transaction.amount.amount);
            add(transaction.toAccountId, toAmount);
        }

        return result;
    }

    private async loadAffectedAccounts(ids: Set<string>): Promise<Map<string, Account>> {
        const accounts = new Map<string, Account>();

        for (const id of ids) {
            const account = await this.accountRepository.findById(id);
            if (!account) throw new EntityNotFoundException('Account', id);
            accounts.set(id, account);
        }

        return accounts;
    }

    private async assertNewAccountsUsable(
        transaction: Transaction,
        accounts: Map<string, Account>,
        previousAccountIds: Set<string>
    ): Promise<void> {
        // Her bacağın beklenen para birimi ayrıdır: kaynak işlemin para birimi,
        // hedef ise hedef tutarın para birimi (kur dönüşümlü transferde farklı).
        const legs: Array<{ id?: string; expectedCurrencyId: string }> = [
            { id: transaction.accountId, expectedCurrencyId: transaction.currencyId },
            {
                id: transaction.toAccountId,
                expectedCurrencyId: transaction.toAmount?.currencyId ?? transaction.currencyId
            }
        ];

        for (const { id, expectedCurrencyId } of legs) {
            if (!id) continue;
            const account = accounts.get(id);
            if (!account) throw new EntityNotFoundException('Account', id);
            // Aktiflik yalnızca YENİ atanan hesap için istenir: zaten bu işleme
            // bağlı (pasifleştirilmiş olabilecek) bir hesabın başlık/tutar/not
            // düzenlemesini bloke etmek kullanıcıyı geçmişini düzeltemez hale
            // getiriyordu. Silme de aktiflik istemiyor — asimetri bilinçli.
            if (!account.isActive && !previousAccountIds.has(id)) {
                throw new AccountInactiveException(id);
            }
            // Hedef hesabı farklı para birimli bir hesaba taşırsa hedef tutar
            // eski para biriminde kalır; çağıran taze bir toAmount göndermeli.
            if (account.currencyId !== expectedCurrencyId) {
                throw new CurrencyMismatchException(expectedCurrencyId, account.currencyId);
            }
        }
    }

    /**
     * Önce eski bakiye etkisini geri alır, sonra yenisini uygular.
     *
     * Tek bir net delta üzerinden gidilemiyor: "harcanmış geliri düşürmek" de
     * "gideri artırmak" da negatif delta üretiyor, ama ilki bir düzeltme
     * (guard'sız geri alma), ikincisi yeni bir para çıkışı (yetersiz bakiye
     * guard'ı geçerli). Fazları ayırmak her birine doğru kuralı uygular; iki faz
     * arasında bakiye geçici olarak eksiye düşebilir.
     */
    private reapplyBalanceEffect(
        accounts: Map<string, Account>,
        oldEffect: BalanceEffect,
        newEffect: BalanceEffect
    ): void {
        // Etki değeri hesabın KENDİ para birimindedir (kaynak ve hedef bacak
        // farklı olabilir); Money'yi hesabın para biriminden kur.
        const moneyFor = (account: Account, value: number) =>
            Money.create(Math.abs(value), account.currencyId, account.balance.minorUnit);

        for (const [id, account] of accounts) {
            const previous = oldEffect.get(id) ?? 0;
            if (previous === 0) continue;

            if (previous > 0) account.reverseDeposit(moneyFor(account, previous));
            else account.deposit(moneyFor(account, previous));
        }

        for (const [id, account] of accounts) {
            const next = newEffect.get(id) ?? 0;
            if (next === 0) continue;

            if (next > 0) account.deposit(moneyFor(account, next));
            else account.withdraw(moneyFor(account, next));
        }
    }

    private async reverseBudgetEffects(
        effects: TransactionBudgetEffect[]
    ): Promise<void> {
        for (const effect of effects) {
            const budget = await this.budgetRepository.findById(effect.budgetId);

            if (!budget) {
                throw new EntityNotFoundException('Budget', effect.budgetId);
            }
            if (budget.periodStart.getTime() !== effect.periodStart.getTime()) {
                continue;
            }

            budget.removeSpending(
                Money.create(effect.amount, effect.currencyId, budget.amount.minorUnit),
                effect.occurredAt
            );

            await this.budgetRepository.save(budget);
        }
    }

    private async applyBudgetEffects(
        transaction: Transaction,
        skipped: SkippedBudget[],
        notifications: BudgetNotification[],
        alertBefore: Map<string, BudgetAlertSnapshot>
    ): Promise<TransactionBudgetEffect[]> {
        if (!transaction.isExpense()) return [];

        const activeBudgets = await this.budgetRepository.findActive();

        // Ekleme akışıyla aynı: eşleştirmeden önce dönemi dolmuş bütçeleri
        // devret ki güncellenen harcama doğru döneme yazılsın.
        await rolloverDueBudgets(
            activeBudgets,
            new Date(),
            this.budgetRepository,
            this.effectRepository
        );

        const budgets = this.categorizationService.findMatchingBudgets(
            transaction,
            activeBudgets
        );
        const effects: TransactionBudgetEffect[] = [];

        for (const budget of budgets) {
            const snapshot = alertBefore.get(budget.id);
            const levelBefore =
                snapshot &&
                snapshot.periodStart === budget.periodStart.getTime()
                    ? snapshot.level
                    : this.alertLevel(budget);

            try {
                budget.addSpending(transaction.amount, transaction.date);
            } catch (error) {
                if (!DomainException.isDomainException(error)) throw error;
                skipped.push({
                    budgetId: budget.id,
                    budgetName: budget.name,
                    reason: skippedBudgetReason(
                        budget,
                        transaction.date,
                        transaction.amount.currencyId
                    )
                });
                continue;
            }

            await this.budgetRepository.save(budget);
            effects.push({
                transactionId: transaction.id,
                budgetId: budget.id,
                periodStart: budget.periodStart,
                amount: transaction.amount.amount,
                currencyId: transaction.currencyId,
                occurredAt: transaction.date,
            });

            const levelAfter = this.alertLevel(budget);

            if (ALERT_RANK[levelAfter] > ALERT_RANK[levelBefore]) {
                const notification = buildBudgetNotification(budget);
                if (notification) notifications.push(notification);
            }
        }

        // Ekleme akışıyla aynı: tarih güncel dönem dışında kaldığı için
        // harcamayı alamayan eşleşen bütçeleri kullanıcıya bildir.
        for (const budget of this.categorizationService.findOutOfPeriodBudgets(transaction, activeBudgets)) {
            skipped.push({
                budgetId: budget.id,
                budgetName: budget.name,
                reason: skippedBudgetReason(
                    budget,
                    transaction.date,
                    transaction.currencyId
                )
            });
        }

        return effects;
    }

    private classifyChanges(
        transaction: Transaction,
        input: UpdateTransactionInput
    ): TransactionChangeSet {
        const normalizeOptional = (value: string | undefined) =>
            value?.trim() || undefined;

        const titleChanged =
            input.title !== undefined &&
            input.title.trim() !== transaction.title;
        const descriptionChanged =
            input.description !== undefined &&
            normalizeOptional(input.description) !==
                normalizeOptional(transaction.description);
        const notesChanged =
            input.notes !== undefined &&
            normalizeOptional(input.notes) !==
                normalizeOptional(transaction.notes);
        const amountChanged =
            input.amount !== undefined &&
            input.amount !== transaction.amount.amount;
        const accountChanged =
            input.accountId !== undefined &&
            input.accountId !== transaction.accountId;
        const categoryChanged =
            input.categoryId !== undefined &&
            input.categoryId !== transaction.categoryId;
        const dateChanged =
            input.date !== undefined &&
            input.date.getTime() !== transaction.date.getTime();
        const destinationChanged =
            transaction.isTransfer() &&
            input.toAccountId !== undefined &&
            input.toAccountId !== transaction.toAccountId;
        const destinationAmountChanged =
            transaction.isTransfer() &&
            input.toAmount !== undefined &&
            input.toAmount !== transaction.toAmount?.amount;

        const balanceChanged =
            amountChanged ||
            accountChanged ||
            destinationChanged ||
            destinationAmountChanged;
        const budgetCoverageChanged =
            transaction.isExpense() &&
            (
                amountChanged ||
                accountChanged ||
                categoryChanged ||
                dateChanged
            );

        return {
            destinationChanged,
            balanceChanged,
            budgetCoverageChanged,
            anyChanged:
                titleChanged ||
                descriptionChanged ||
                notesChanged ||
                amountChanged ||
                accountChanged ||
                categoryChanged ||
                dateChanged ||
                destinationChanged ||
                destinationAmountChanged
        };
    }

    private alertLevel(budget: Budget): BudgetAlertLevel {
        if (!budget.enableNotifications) return 'none';
        if (budget.isExceeded()) return 'exceeded';
        if (budget.isWarning()) return 'warning';
        return 'none';
    }
}
