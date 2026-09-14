import { Account, CreateAccountProps, MAX_ACCOUNT_COUNT } from '@/domain/entities/account';
import { AccountLimitExceededException } from '@/domain/exceptions/domain.exception';
import { IAccountRepository } from '@/domain/interfaces/account-repository.interface';
import { AccountDTO } from '@/application/dto/account.dto';
import { AccountMapper } from "@/application/mappers";
import { assertExists } from "@/application/shared/assert-exists";
import { ICurrencyRepository, IUnitOfWork } from "@/domain";

export class CreateAccountUseCase {
    constructor(
        private accountRepository: IAccountRepository,
        private currencyRepository: ICurrencyRepository,
        private unitOfWork: IUnitOfWork
    ) {}

    async execute(input: CreateAccountProps): Promise<AccountDTO> {
        return this.unitOfWork.run(async () => {
            const currency = await assertExists(
                'Currency',
                input.currencyId,
                id => this.currencyRepository.findById(id)
            )

            // Limite yalnız aktif hesaplar sayılır: geçmiş referansı olan bir
            // hesap silinemediği için (FK RESTRICT) tek arşivleme yolu
            // pasifleştirmedir. Pasifler de sayılsaydı kullanıcı slot'larını
            // kalıcı tüketip yeni hesap açamaz hale gelirdi. Pasifleştirme bakiye
            // sıfır iken yapıldığından arşiv hesapları slot'u serbest bırakır.
            const activeCount = (await this.accountRepository.findAll())
                .filter(account => account.isActive).length;

            if (activeCount >= MAX_ACCOUNT_COUNT) {
                throw new AccountLimitExceededException(MAX_ACCOUNT_COUNT);
            }

            const account = Account.create({
                ...input,
                minorUnit: currency.minorUnit,
            });
            await this.accountRepository.save(account);

            return AccountMapper.toDTO(account)
        })
    }
}
