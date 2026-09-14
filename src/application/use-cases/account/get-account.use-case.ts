import { IAccountRepository } from "@/domain";
import { AccountDTO } from "@/application";
import { AccountMapper } from "@/application/mappers";

export class GetAccountUseCase {
    constructor(private readonly accountRepository: IAccountRepository) {}

    async execute(input: { id: string }): Promise<AccountDTO | null> {
        const account = await this.accountRepository.findById(input.id)

        if (!account) {
            return null
        }

        return AccountMapper.toDTO(account)
    }
}