import * as yup from 'yup'

export const FEEDBACK_TYPES = [
    'bug',
    'feature',
    'suggestion',
    'question'
] as const

export const MAX_FEEDBACK_LENGTH = 2000

export function createFeedbackSchema() {
    return yup.object({
        feedbackType: yup
            .string()
            .trim()
            .oneOf(FEEDBACK_TYPES)
            .required(),

        feedbackText: yup
            .string()
            .trim()
            .max(MAX_FEEDBACK_LENGTH)
            .required(),

        rating: yup
            .number()
            .integer()
            .min(1)
            .max(5)
            .required()
    })
}

export type FeedbackFormValues = yup.InferType<ReturnType<typeof createFeedbackSchema>>
