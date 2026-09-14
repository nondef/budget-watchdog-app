import { describe, expect, it } from 'vitest'
import { Transaction } from '@/domain/entities/transaction'
import { DomainErrorCode, DomainException } from '@/domain/exceptions/domain.exception'

const base = {
    title: 'Test',
    amount: 100,
    currencyId: 'TRY',
    categoryId: 'cat1',
    date: new Date('2026-05-19T10:00:00'),
}

/** Fırlatılan hatayı yakalayıp döner (kod üzerinden assert edebilmek için). */
function catchError(fn: () => unknown): unknown {
    try {
        fn()
        return null
    } catch (error) {
        return error
    }
}

describe('Transaction.create doğrulamaları', () => {
    it('boş başlık için domain exception fırlatır (ham Error değil)', () => {
        const error = catchError(() =>
            Transaction.create({ ...base, title: '  ', type: 'expense', accountId: 'a1' }),
        )

        // Regresyon: eskiden `throw new Error(...)` idi; normalizeError bunu
        // UNKNOWN'a düşürdüğü için kullanıcı generic mesaj görüyordu.
        expect(error).toBeInstanceOf(DomainException)
        expect(error).toMatchObject({ code: DomainErrorCode.VALIDATION_ERROR })
    })

    it('pozitif olmayan tutar için domain exception fırlatır', () => {
        const error = catchError(() =>
            Transaction.create({ ...base, amount: 0, type: 'expense', accountId: 'a1' }),
        )

        expect(error).toMatchObject({ code: DomainErrorCode.NEGATIVE_AMOUNT })
    })

    it('hesapsız işlemi reddeder', () => {
        const error = catchError(() => Transaction.create({ ...base, type: 'expense' }))

        // `transactions.account_id` NOT NULL: guard olmadan kayıt domain'den
        // geçip veritabanında ham constraint hatasına düşüyordu. Güncelleme
        // yolu bu alanı zaten zorunlu tutuyor.
        expect(error).toMatchObject({ code: DomainErrorCode.VALIDATION_ERROR })
    })

    it('hedefsiz transferi reddeder', () => {
        const error = catchError(() =>
            Transaction.create({ ...base, type: 'transfer', accountId: 'a1' }),
        )

        // Regresyon: guard `!props.accountId` sorduğu için kaynak dolu olan
        // (yani normal) hedefsiz transferler kontrolden sızıyordu.
        expect(error).toMatchObject({ code: DomainErrorCode.TRANSFER_REQUIRES_DESTINATION })
    })

    it('kaynak ve hedefi aynı olan transferi reddeder', () => {
        const error = catchError(() =>
            Transaction.create({ ...base, type: 'transfer', accountId: 'a1', toAccountId: 'a1' }),
        )

        expect(error).toMatchObject({ code: DomainErrorCode.TRANSFER_SAME_ACCOUNT })
    })

    it('geçerli transferi kabul eder', () => {
        const transaction = Transaction.create({
            ...base,
            type: 'transfer',
            accountId: 'a1',
            toAccountId: 'a2',
        })

        expect(transaction.isTransfer()).toBe(true)
        expect(transaction.toAccountId).toBe('a2')
    })
})
