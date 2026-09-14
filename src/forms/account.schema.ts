import * as yup from 'yup'
import { ACCOUNT_TYPES } from '@/domain'
import { MAX_AMOUNT, MAX_NAME_LENGTH, MAX_NOTE_LENGTH, emptyToUndefined } from './field-rules'

const cardNameField = () => yup
    .string()
    .trim()
    .max(MAX_NAME_LENGTH)
    .required()

const typeField = () => yup
    .string()
    .required()
    .oneOf(ACCOUNT_TYPES)

const detailsField = () => yup
    .string()
    .max(MAX_NOTE_LENGTH)
    .notRequired()

export const createAccountSchema = (validateCurrencies: string[]) => {
    return yup.object({
        cardName: cardNameField(),
        type: typeField(),
        currency: yup
            .string()
            .required()
            .oneOf(validateCurrencies),
        balance: yup
            .number()
            .required()
            .min(0)
            .max(MAX_AMOUNT),
        details: detailsField(),
    })
}

export const updateAccountSchema = () => {
    return yup.object({
        cardName: cardNameField(),
        type: typeField(),
        // currency & balance: hesap oluşturulduktan sonra düzenlenmiyor (kasıtlı)
        details: detailsField(),
    })
}

/**
 * İlk açılıştaki tek hesap adımı (FirstWallet): yalnızca ad ve bakiye sorulur,
 * tür/para birimi sonraki adımlarda belirlenir.
 */
export const createAccountOnboardingSchema = () =>
    yup.object({
        cardName: cardNameField(),
        balance: yup
            .number()
            .transform(emptyToUndefined)
            .required()
            .min(0)
            .max(MAX_AMOUNT),
    })
