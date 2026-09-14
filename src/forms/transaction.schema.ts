import * as yup from 'yup'
import { TRANSACTION_TYPE_VALUES } from '@/domain'
import { vMsg } from '@/plugins/yup-locale'
import { MAX_AMOUNT, MAX_NOTE_LENGTH } from './field-rules'

export const createTransactionSchema = () => {
    return yup.object({
        title: yup
            .string()
            .trim()
            .max(100)
            .required(),
        type: yup
            .string()
            .oneOf(TRANSACTION_TYPE_VALUES)
            .required(),
        categoryId: yup
            .string()
            .when('type', {
                is: (type: string) => type !== 'transfer',
                then: (schema) => schema.required(),
                otherwise: (schema) => schema.notRequired(),
            }),
        accountId: yup
            .string()
            .required(),
        targetAccountId: yup
            .string()
            .when('type', {
                is: 'transfer',
                then: (schema) =>
                    schema
                        .required()
                        .notOneOf([yup.ref('accountId')], vMsg('validation.custom.targetAccountDiffers')),
                otherwise: (schema) => schema.notRequired(),
            }),
        amount: yup
            .number()
            .required()
            .positive()
            .max(MAX_AMOUNT),
        description: yup
            .string()
            .max(MAX_NOTE_LENGTH)
            .notRequired(),
        date: yup
            .string()
            .required(),
    })
}
