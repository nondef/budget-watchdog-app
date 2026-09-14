import { Transaction } from '@/domain/entities/transaction'
import { TransactionDTO } from "@/application";

/**
 * Transaction entity → plain DTO (ITransaction) dönüşümü.
 *
 * Entity'nin public getter'larını kullanır; private alanlara dokunmaz.
 * Böylece entity dışarıdaki DTO şeklini bilmek zorunda kalmaz
 * (toPlainObject entity'den buraya taşındı).
 */
export const TransactionMapper = {
    toDTO(entity: Transaction): TransactionDTO {
        return {
            id: entity.id,
            title: entity.title,
            amount: entity.amount.toPlainObject(),
            toAmount: entity.toAmount?.toPlainObject(),
            description: entity.description,
            categoryId: entity.categoryId,
            currencyId: entity.currencyId,
            accountId: entity.accountId,
            toAccountId: entity.toAccountId,
            date: entity.date,
            type: entity.type,
            notes: entity.notes,
            createdAt: entity.createdAt!,
            updatedAt: entity.updatedAt!,
        }
    },

    toDTOList(entities: Transaction[]): TransactionDTO[] {
        return entities.map(entity => this.toDTO(entity))
    },
}
