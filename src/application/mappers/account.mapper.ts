import { Account } from '@/domain/entities/account'
import { AccountDTO } from "@/application";

/**
 * Account entity → plain DTO (IAccount) dönüşümü.
 *
 * Entity'nin public getter'larını kullanır; private alanlara dokunmaz.
 * Money / Icon value object'lerinin kendi toPlainObject'i kullanılır
 * (yaprak değerler — toJSON gibi, entity'den ayrı tutuldu).
 */
export const AccountMapper = {
    toDTO(entity: Account): AccountDTO {
        return {
            id: entity.id,
            name: entity.name,
            type: entity.type,
            balance: entity.balance.toPlainObject(),
            icon: entity.icon.toPlainObject(),
            notes: entity.notes,
            isActive: entity.isActive,
            createdAt: entity.createdAt!,
            updatedAt: entity.updatedAt!,
        }
    },

    toDTOList(entities: Account[]): AccountDTO[] {
        return entities.map(entity => this.toDTO(entity))
    },
}
