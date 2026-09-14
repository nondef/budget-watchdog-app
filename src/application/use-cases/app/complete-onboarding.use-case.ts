import { IAppSettingsRepository } from '@/domain/interfaces/app-settings-repository.interface';
import { IAccountRepository } from '@/domain/interfaces/account-repository.interface';
import {
    AccountLimitExceededException,
    EntityNotFoundException
} from '@/domain/exceptions/domain.exception';
import { CompleteOnboardingInput, CompleteOnboardingOutput } from '@/application/dto/app.dto';
import { AppMapper } from '@/application/mappers/app.mapper';
import { AccountMapper } from '@/application/mappers';
import {
    Account,
    AppSettings,
    Icon,
    ICurrencyRepository,
    IUnitOfWork,
    Language,
    MAX_ACCOUNT_COUNT,
    OperationNotAllowedException
} from "@/domain";

export class CompleteOnboardingUseCase {
    constructor(
        private appSettingsRepository: IAppSettingsRepository,
        private accountRepository: IAccountRepository,
        private currencyRepository: ICurrencyRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: CompleteOnboardingInput): Promise<CompleteOnboardingOutput> {
        return this.unitOfWork.run(async () => {
            const currency = await this.currencyRepository.findById(input.baseCurrencyId)

            if (!currency) {
                throw new EntityNotFoundException('Currency', input.baseCurrencyId)
            }

            let settings = await this.appSettingsRepository.get();

            if (settings?.isOnboardingCompleted) {
                throw new OperationNotAllowedException(
                    'completeOnboarding',
                    'onboarding is already completed'
                );
            }

            if (!settings) {
                settings = AppSettings.create({
                    baseCurrencyId: input.baseCurrencyId,
                    language: input.language ? Language.from(input.language) : undefined
                })
            } else {
                settings.changeBaseCurrency(input.baseCurrencyId)

                if (input.language) {
                    settings.changeLanguage(Language.from(input.language))
                }
            }

            const activeAccounts = await this.accountRepository.findActive();
            let selectedAccount = activeAccounts.find(
                account => account.currencyId === input.baseCurrencyId
            );
            let accountCreated = false;

            if (!selectedAccount) {
                // `CreateAccountUseCase` ile aynı kural: limite yalnız aktif
                // hesaplar sayılır (arşivlenen/pasif hesaplar slot tüketmez).
                if (activeAccounts.length >= MAX_ACCOUNT_COUNT) {
                    throw new AccountLimitExceededException(MAX_ACCOUNT_COUNT);
                }

                selectedAccount = Account.create({
                    ...input.account,
                    currencyId: input.baseCurrencyId,
                    minorUnit: currency.minorUnit
                });

                await this.accountRepository.save(selectedAccount);
                accountCreated = true;
            } else {
                // Var olan hesabı yeniden kullanıyoruz; kullanıcının onboarding
                // "ilk cüzdan" formunda girdiği ad/tip/ikon/not sessizce
                // kaybolmasın diye mevcut hesaba uygulanır. Bakiye retroaktif
                // değiştirilmez (mevcut hesabın gerçek bakiyesi korunur).
                const info = input.account;

                if (info.name) selectedAccount.rename(info.name);
                if (info.type) selectedAccount.changeType(info.type);
                if (info.notes !== undefined) selectedAccount.updateNotes(info.notes);
                if (info.icon) {
                    selectedAccount.changeIcon(Icon.create(
                        info.icon.name ?? selectedAccount.icon.name,
                        info.icon.color ?? selectedAccount.icon.color
                    ));
                }

                await this.accountRepository.save(selectedAccount);
            }

            settings.completeOnboarding();
            await this.appSettingsRepository.save(settings);

            return {
                settings: AppMapper.toDTO(settings),
                account: AccountMapper.toDTO(selectedAccount),
                accountCreated
            };
        });
    }
}
