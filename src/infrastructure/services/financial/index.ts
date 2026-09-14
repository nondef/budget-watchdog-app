import { FinancialService } from "@/infrastructure/services/financial/financial-service";
import { logger } from "@/infrastructure/logging";

export const financialService = new FinancialService({
    logger: (e) => {
        const level = e.level === 'info' ? 'debug' : e.level
        const isError = e.meta instanceof Error
        const data = !isError && e.meta && typeof e.meta === 'object'
            ? e.meta as Record<string, unknown>
            : undefined

        logger.log(level, e.message, {
            context: 'financial',
            data,
            error: isError ? e.meta : undefined
        })
    }
})
