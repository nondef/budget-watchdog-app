import { IAccountRepository } from "@/domain";
import { AccountMapper } from "@/application/mappers";
import { AccountDTO } from "@/application";

interface Filter {
    currencyId?: string
    activeOnly?: boolean
}

export class ListAccountsUseCase {
    constructor(private repository: IAccountRepository) {}

    async execute(filter: Filter = {}): Promise<AccountDTO[]> {
        const { currencyId, activeOnly = true } = filter

        if (activeOnly) {
            return AccountMapper.toDTOList(await this.repository.findActive(currencyId))
        }

        // `findAll` para birimi filtresi almıyor; pasifler de istendiğinde
        // `currencyId` sessizce düşüyordu. Bellekte daraltılır (hesap sayısı
        // `MAX_ACCOUNT_COUNT` ile sınırlı).
        const accounts = await this.repository.findAll()

        return AccountMapper.toDTOList(
            currencyId
                ? accounts.filter(account => account.currencyId === currencyId)
                : accounts
        )
    }
}