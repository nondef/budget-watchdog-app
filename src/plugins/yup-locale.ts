import { i18n } from "@/i18n";
import * as yup from 'yup'

const t = (key: string, values?: Record<string, unknown>) =>
    i18n.global.t(key, values ?? {})

/** Alan adını fields.* sözlüğünden çevirir; çeviri yoksa path'i olduğu gibi kullanır. */
const field = (path: string) =>
    i18n.global.te(`fields.${path}`) ? i18n.global.t(`fields.${path}`) : path

/**
 * Şemalarda alana özel mesaj gerektiğinde kullanılır. Fonksiyon döndürdüğü için
 * çeviri doğrulama ANINDA yapılır; dil değişince mesaj da yeni dilde gelir.
 * Örn: .min(yup.ref('startDate'), vMsg('validation.custom.endDateAfterStart'))
 */
export const vMsg = (key: string) => () => t(key)

/**
 * Yup'ın varsayılan hata mesajlarını vue-i18n'e bağlar.
 * Mesajlar fonksiyon olduğu için doğrulama ANINDA çevrilir;
 * dil değişince yeni doğrulamalar otomatik yeni dilde gelir.
 *
 * DİKKAT: yup, varsayılan mesajı şema OLUŞTURULURKEN bağlar. Bu modül import
 * edildiği anda kurulumu yapar; main.ts'te router'dan önce import edilmeli ve
 * tüm şemalar factory fonksiyon olarak tanımlanmalıdır.
 */
yup.setLocale({
    mixed: {
        required: ({ path }) => t('validation.required', { field: field(path) }),
        notType: ({ path, type }) => t(`validation.notType.${type}`, { field: field(path) }),
        oneOf: ({ path }) => t('validation.oneOf', { field: field(path) }),
    },
    string: {
        min: ({ path, min }) => t('validation.string.min', { field: field(path), min }),
        max: ({ path, max }) => t('validation.string.max', { field: field(path), max }),
    },
    number: {
        min: ({ path, min }) => t('validation.number.min', { field: field(path), min }),
        max: ({ path, max }) => t('validation.number.max', { field: field(path), max }),
        positive: ({ path }) => t('validation.number.positive', { field: field(path) }),
        integer: ({ path }) => t('validation.number.integer', { field: field(path) }),
    },
    date: {
        min: ({ path, min }) => t('validation.date.min', { field: field(path), min: String(min) }),
    },
    array: {
        min: ({ path, min }) => t('validation.array.min', { field: field(path), min }),
        max: ({ path, max }) => t('validation.array.max', { field: field(path), max }),
    },
})
