import * as yup from 'yup'
import { BUDGET_TYPES } from '@/domain'
import { vMsg } from '@/plugins/yup-locale'
import { MAX_AMOUNT, MAX_NOTE_LENGTH } from './field-rules'

export function createBudgetSchema() {
    return yup.object({
        name: yup
            .string()
            .trim()
            .max(60)
            .required(),
        type: yup
            .string()
            .oneOf(BUDGET_TYPES)
            .required(),
        account: yup
            .string()
            .required(),
        amount: yup
            .number()
            .required()
            .positive()
            .max(MAX_AMOUNT),
        startDate: yup
            .date()
            .required(),
        endDate: yup
            .date()
            .nullable()
            .when('type', {
                is: 'once',
                then: (schema) =>
                    schema
                        .required()
                        .min(yup.ref('startDate'), vMsg('validation.custom.endDateAfterStart')),
                otherwise: (schema) => schema.notRequired(),
            }),
        category: yup
            .array()
            .of(yup.string().required())
            .min(1)
            .max(5)
            .required(),
        warningPercentage: yup
            .number()
            .min(10)
            .max(100)
            .required(),
        note: yup
            .string()
            .max(MAX_NOTE_LENGTH)
            .notRequired(),
    })
}
