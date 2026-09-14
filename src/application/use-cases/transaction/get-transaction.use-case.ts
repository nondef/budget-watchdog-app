import { ITransactionRepository } from '@/domain/interfaces/transaction-repository.interface';
import { TransactionDTO } from '@/application/dto/transaction.dto';
import { TransactionMapper } from '@/application/mappers';

/**
 * Tek işlemi DTO olarak getirir.
 *
 * Store'daki `findTransactionById` domain entity'sinin kendisini döndürüyordu;
 * düzenleme ekranı bu yüzden `Transaction` üzerinde `as any` cast'i yapmak
 * zorunda kalıyordu. Diğer tekil sorgular gibi düz veri döner.
 */
export class GetTransactionUseCase {
    constructor(private readonly transactionRepository: ITransactionRepository) {}

    async execute(input: { id: string }): Promise<TransactionDTO | null> {
        const transaction = await this.transactionRepository.findById(input.id);

        return transaction ? TransactionMapper.toDTO(transaction) : null;
    }
}
