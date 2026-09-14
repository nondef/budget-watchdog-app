import {
    AccountInactiveException,
    BusinessRuleViolationException,
    CurrencyMismatchException,
    DomainException,
    IAccountRepository,
    IBudgetRepository,
    ICategoryRepository,
    ICurrencyRepository,
    ITransactionBudgetEffectRepository,
    ITransactionRepository,
    IUnitOfWork,
    Money,
    Transaction,
    TransactionBudgetEffect,
    TransferDestinationAmountRequiredException,
    TransferRequiresDestinationException,
    TransferSameAccountException
} from '@/domain';
import { Budget } from '@/domain/entities/budget';
import { TransactionCategorizationService } from '@/domain/services/transaction-categorization.service';
import {
    AddTransactionInput,
    AddTransactionOutput,
    BudgetNotification,
    SkippedBudget
} from '@/application/dto/transaction.dto';
import { TransactionMapper } from '@/application/mappers';
import { buildBudgetNotification } from '@/application/shared/build-budget-notification';
import { budgetAlertLevel, BUDGET_ALERT_RANK } from '@/application/shared/budget-alert-level';
import { assertExists } from '@/application/shared/assert-exists';
import { rolloverDueBudgets } from '@/application/shared/rollover-due-budgets';
import { skippedBudgetReason } from '@/application/shared/skipped-budget-reason';

export class AddTransactionUseCase {
    constructor(
        private transactionRepository: ITransactionRepository,
        private accountRepository: IAccountRepository,
        private budgetRepository: IBudgetRepository,
        private categorizationService: TransactionCategorizationService,
        private categoryRepository: ICategoryRepository,
        private currencyRepository: ICurrencyRepository,
        private effectRepository: ITransactionBudgetEffectRepository,
        private unitOfWork: IUnitOfWork,
    ) {}

    async execute(input: AddTransactionInput): Promise<AddTransactionOutput> {
        return this.unitOfWork.run(async () => {
            if (input.type === 'transfer') {
                if (!input.toAccountId) {
                    throw new TransferRequiresDestinationException();
                }

                if (input.toAccountId === input.accountId) {
                    throw new TransferSameAccountException(input.accountId);
                }
            }

            if (input.type !== 'transfer') {
                const category = await assertExists(
                    'Category',
                    input.categoryId,
                    id => this.categoryRepository.findById(id)
                );

                if (category.type !== input.type) {
                    throw new BusinessRuleViolationException(
                        `A ${input.type} transaction requires a ${input.type} category`,
                        { categoryId: category.id, categoryType: category.type, transactionType: input.type }
                    );
                }
            }

            const currency = await assertExists(
                'Currency',
                input.currencyId,
                id => this.currencyRepository.findById(id)
            );

            const account = await assertExists(
                'Account',
                input.accountId,
                id => this.accountRepository.findById(id)
            );

            const toAccount = input.type === 'transfer' && input.toAccountId
                ? await assertExists(
                    'Account',
                    input.toAccountId,
                    id => this.accountRepository.findById(id)
                )
                : null;

            if (!account.isActive) {
                throw new AccountInactiveException(account.id);
            }
            if (toAccount && !toAccount.isActive) {
                throw new AccountInactiveException(toAccount.id);
            }
            // Kaynak bacak her zaman işlemin para birimindedir.
            if (account.currencyId !== input.currencyId) {
                throw new CurrencyMismatchException(account.currencyId, input.currencyId);
            }

            // Hedef bacak farklı para biriminde olabilir (kur dönüşümlü transfer).
            // Aynı para biriminde ise hedef tutar = kaynak tutar; farklı ise
            // çağıran hedef tutarı açıkça vermeli — banka kuru değişken olduğu
            // için `amount`'tan türetilemez.
            let toCurrencyId: string | undefined;
            let toMinorUnit: number | undefined;
            let toAmountValue: number | undefined;

            if (toAccount) {
                toCurrencyId = toAccount.currencyId;

                if (toCurrencyId === input.currencyId) {
                    toMinorUnit = currency.minorUnit;
                    toAmountValue = input.amount;
                } else {
                    if (input.toAmount === undefined || input.toAmount <= 0) {
                        throw new TransferDestinationAmountRequiredException();
                    }
                    const toCurrency = await assertExists(
                        'Currency',
                        toCurrencyId,
                        id => this.currencyRepository.findById(id)
                    );
                    toMinorUnit = toCurrency.minorUnit;
                    toAmountValue = input.toAmount;
                }
            }

            const amount = Money.create(input.amount, input.currencyId, currency.minorUnit);
            const transaction = Transaction.create({
                ...input,
                minorUnit: currency.minorUnit,
                toAmount: toAmountValue,
                toCurrencyId,
                toMinorUnit,
            });

            if (transaction.isIncome()) account.deposit(amount);
            else account.withdraw(amount);

            if (toAccount) {
                // Hedef hesabın para biriminde yatar (aynı-para transferde = amount).
                toAccount.deposit(transaction.toAmount!);
            }

            const notifications: BudgetNotification[] = [];
            const skippedBudgets: SkippedBudget[] = [];
            const budgetsToSave: Budget[] = [];
            const effects: TransactionBudgetEffect[] = [];

            if (transaction.isExpense()) {
                const activeBudgets = await this.budgetRepository.findActive();

                // Eşleştirmeden önce dönemi dolmuş bütçeleri devret: aksi halde
                // zamanlanmış rollover henüz çalışmadıysa bu harcama sessizce
                // hiçbir bütçeye yazılmadan kaybolurdu.
                await rolloverDueBudgets(
                    activeBudgets,
                    new Date(),
                    this.budgetRepository,
                    this.effectRepository
                );

                const matching = this.categorizationService.findMatchingBudgets(
                    transaction,
                    activeBudgets
                );

                for (const budget of matching) {
                    // Harcama öncesi seviye: bildirim yalnız bu gider seviyeyi
                    // yükseltirse çıksın. Aksi halde zaten aşılmış bir bütçeye
                    // eklenen her yeni gider tekrar "aşıldı" bildirimi üretiyordu
                    // (update akışı zaten seviye karşılaştırması yapıyor).
                    const levelBefore = budgetAlertLevel(budget);

                    try {
                        budget.addSpending(amount, transaction.date);
                    } catch (error) {
                        if (!DomainException.isDomainException(error)) throw error;
                        skippedBudgets.push({
                            budgetId: budget.id,
                            budgetName: budget.name,
                            reason: skippedBudgetReason(
                                budget,
                                transaction.date,
                                amount.currencyId
                            )
                        });
                        continue;
                    }

                    budgetsToSave.push(budget);
                    effects.push({
                        transactionId: transaction.id,
                        budgetId: budget.id,
                        periodStart: budget.periodStart,
                        amount: amount.amount,
                        currencyId: amount.currencyId,
                        occurredAt: transaction.date,
                    });

                    if (BUDGET_ALERT_RANK[budgetAlertLevel(budget)] > BUDGET_ALERT_RANK[levelBefore]) {
                        const notification = buildBudgetNotification(budget);
                        if (notification) notifications.push(notification);
                    }
                }

                // Hesap+kategori olarak eşleşen ama işlem tarihi güncel dönemin
                // dışında kaldığı için harcamayı alamayan bütçeleri bildir; aksi
                // halde geriye/ileriye tarihli gider sessizce hiçbir bütçeye
                // yazılmaz ve kullanıcı bütçesinin neden ilerlemediğini göremez.
                for (const budget of this.categorizationService.findOutOfPeriodBudgets(transaction, activeBudgets)) {
                    skippedBudgets.push({
                        budgetId: budget.id,
                        budgetName: budget.name,
                        reason: skippedBudgetReason(
                            budget,
                            transaction.date,
                            transaction.currencyId
                        )
                    });
                }
            }

            await this.transactionRepository.save(transaction);
            await this.accountRepository.save(account);

            if (toAccount) {
                await this.accountRepository.save(toAccount);
            }

            for (const budget of budgetsToSave) {
                await this.budgetRepository.save(budget);
            }

            await this.effectRepository.saveMany(effects);

            return {
                transaction: TransactionMapper.toDTO(transaction),
                budgetNotifications: notifications,
                skippedBudgets
            };
        });
    }
}
