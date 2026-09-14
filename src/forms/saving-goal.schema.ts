import * as yup from 'yup'
import { vMsg } from '@/plugins/yup-locale'
import { MAX_AMOUNT, emptyToUndefined } from './field-rules'

/** Hedef adı sınırı — bütçe adıyla aynı. */
const MAX_GOAL_NAME_LENGTH = 60

/** Not alanı sınırı; `ion-textarea` sayacı da bu değeri gösteriyor. */
const MAX_GOAL_NOTE_LENGTH = 150

const nameField = () => yup
    .string()
    .trim()
    .max(MAX_GOAL_NAME_LENGTH)
    .required()

const targetAmountField = () => yup
    .number()
    .transform(emptyToUndefined)
    .required()
    .positive()
    .max(MAX_AMOUNT)

const targetDateField = () => yup
    .date()
    .transform(emptyToUndefined)
    .nullable()
    .notRequired()

const descriptionField = () => yup
    .string()
    .trim()
    .max(MAX_GOAL_NOTE_LENGTH)
    .notRequired()

export const createSavingGoalSchema = () => {
    return yup.object({
        name: nameField(),
        accountId: yup
            .string()
            .required(),
        initialAmount: yup
            .number()
            .transform(emptyToUndefined)
            .required()
            .min(0)
            .max(MAX_AMOUNT)
            /*
             * Cross-field kural `.test` ile yazılıyor: ikinci bir `.max()`
             * yup'ta aynı test adını ezerdi ve MAX_AMOUNT sınırı sessizce
             * kaybolurdu.
             */
            .test(
                'initial-not-above-target',
                vMsg('validation.custom.initialNotAboveTarget'),
                function (value) {
                    const target = this.parent.targetAmount
                    if (value == null || typeof target !== 'number') return true
                    return value <= target
                }
            ),
        targetAmount: targetAmountField(),
        targetDate: targetDateField(),
        description: descriptionField(),
    })
}

/**
 * Düzenleme: fon hesabı ve başlangıç tutarı hedef kurulduktan sonra
 * değiştirilmiyor (para birimi hesaptan türüyor, biriken tutar hareketlerden).
 */
export const updateSavingGoalSchema = () => {
    return yup.object({
        name: nameField(),
        targetAmount: targetAmountField(),
        targetDate: targetDateField(),
        description: descriptionField(),
    })
}
