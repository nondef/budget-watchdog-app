import { describe, expect, it } from 'vitest'
import { Money } from '@/domain/value-objects/money'
import { Account } from '@/domain/entities/account'

const TRY = 'try-id'

describe('Money', () => {
    it('toplamada kayan nokta artığı bırakmaz', () => {
        const sum = Money.create(0.1, TRY).add(Money.create(0.2, TRY))

        expect(sum.amount).toBe(0.3)
    })

    it('ardışık işlemlerde birikimli hata oluşmaz', () => {
        let total = Money.zero(TRY)

        for (let i = 0; i < 10; i++) {
            total = total.add(Money.create(0.1, TRY))
        }

        expect(total.amount).toBe(1)
    })

    it('bölme sonucunu kuruşa yuvarlar', () => {
        expect(Money.create(10, TRY).divide(3).amount).toBe(3.33)
    })

    it('kuruş hassasiyeti karşılaştırmaları bozmaz', () => {
        const balance = Money.create(0.1, TRY).add(Money.create(0.2, TRY))

        // Yuvarlama olmasaydı 0.30000000000000004 < 0.3 karşılaştırması
        // beklenmedik sonuç veriyordu.
        expect(balance.isLessThan(Money.create(0.3, TRY))).toBe(false)
        expect(balance.equals(Money.create(0.3, TRY))).toBe(true)
    })

    it('para biriminin minor-unit hassasiyetini korur', () => {
        expect(Money.create(1.005, 'kwd-id', 3).amount).toBe(1.005)
        expect(Money.create(1.5, 'jpy-id', 0).amount).toBe(2)
    })

    it('sonlu olmayan tutarları reddeder', () => {
        for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
            expect(() => Money.create(amount, TRY)).toThrow('must be finite')
        }
    })

    it('minor-unit ölçeğinde güvenli sayı aralığını aşan tutarı reddeder', () => {
        expect(() => Money.create(Number.MAX_SAFE_INTEGER, 'kwd-id', 3))
            .toThrow('exceeds the safe range')
    })
})

describe('Account bakiyesi', () => {
    it('kuruşlu harcamalardan sonra tam olarak sıfırlanır', () => {
        const account = Account.create({
            name: 'Kasa',
            type: 'cash',
            currencyId: TRY,
            balance: 0.3,
            icon: { name: 'walletOutline', color: 'bg-blue-500' },
        })

        account.withdraw(Money.create(0.1, TRY))
        account.withdraw(Money.create(0.2, TRY))

        expect(account.balance.amount).toBe(0)
        expect(account.isZeroBalance()).toBe(true)
    })
})
