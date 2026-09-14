import { Budget } from '@/domain/entities/budget'
import { BudgetDTO } from "@/application";

/**
 * Budget entity → plain DTO (BudgetDTO) dönüşümü.
 *
 * Money / Icon / Percentage / DateRange value object'leri
 * primitive ya da props haline indirgenir.
 */
export const BudgetMapper = {
    toDTO(entity: Budget): BudgetDTO {
        return {
            id: entity.id,
            accountId: entity.accountId,
            name: entity.name,
            amount: entity.amount.toPlainObject(),
            spentAmount: entity.spentAmount.toPlainObject(),
            type: entity.type,
            status: entity.status,
            categoryIds: entity.categoryIds,
            startDate: entity.dateRange.startDate,
            endDate: entity.dateRange.endDate,
            warningPercentage: entity.warningPercentage.value,
            enableNotifications: entity.enableNotifications,
            isWarning: entity.isWarning(),
            isExceeded: entity.isExceeded(),
            icon: entity.icon.toPlainObject(),
            note: entity.note,
            dailySpent: entity.dailySpent,
            periodStart: entity.periodStart,
            trackingStartDate: entity.trackingStartDate,
            nextResetDate: entity.nextResetDate,
            lastResetDate: entity.lastResetDate,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
        }
    },

    toDTOList(entities: Budget[]): BudgetDTO[] {
        return entities.map(entity => this.toDTO(entity))
    },
}
