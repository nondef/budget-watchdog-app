import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import tr from '@/locales/tr.json'
import en from '@/locales/en.json'
import de from '@/locales/de.json'

/**
 * Çeviri anahtarı bekçisi.
 *
 * Kaynak hata: hedefe ulaşma bildirimi hiçbir dilde tanımlı olmayan
 * `savingGoals.alerts.*` anahtarını okuyordu. vue-i18n bulamadığı anahtarı
 * aynen döndürdüğü için kullanıcının cihazına bildirim olarak
 * "savingGoals.alerts.reachedTitle" düşüyordu — çalışma zamanında hata yok,
 * test yok, yalnızca kullanıcı görüyor.
 */

const SRC = resolve(__dirname, '../src')

type Messages = Record<string, unknown>

function flatten(value: Messages, prefix = ''): string[] {
    return Object.entries(value).flatMap(([key, child]) =>
        child && typeof child === 'object' && !Array.isArray(child)
            ? flatten(child as Messages, `${prefix}${key}.`)
            : [`${prefix}${key}`]
    )
}

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) return sourceFiles(full)
        return /\.(ts|vue)$/.test(entry.name) ? [full] : []
    })
}

/** `t('a.b')` ve `$t("a.b")` çağrılarındaki SABİT anahtarlar. */
function staticKeys(): { key: string; file: string }[] {
    const pattern = /[$]?\bt\(\s*(['"])([^'"]+)\1/g

    return sourceFiles(SRC).flatMap(file => {
        const source = readFileSync(file, 'utf8')
        return [...source.matchAll(pattern)]
            // Nokta ile biten eşleşme `t('weekDays.' + day)` gibi bir birleştirme;
            // anahtarın tamamı çalışma zamanında oluşuyor, statik olarak
            // doğrulanamaz.
            .filter(match => !match[2].endsWith('.'))
            .map(match => ({ key: match[2], file: relative(SRC, file) }))
    })
}

const trKeys = new Set(flatten(tr as Messages))

describe('i18n anahtarları', () => {
    it('kaynak koddaki her sabit t() anahtarı tanımlı', () => {
        const missing = staticKeys()
            .filter(({ key }) => !trKeys.has(key))
            .map(({ key, file }) => `${key}  (${file})`)

        expect([...new Set(missing)]).toEqual([])
    })

    it('hedefe ulaşma bildiriminin metinleri üç dilde de var', () => {
        for (const messages of [tr, en, de] as Messages[]) {
            const keys = new Set(flatten(messages))
            expect(keys.has('notifications.goalReachedTitle')).toBe(true)
            expect(keys.has('notifications.goalReachedBody')).toBe(true)
        }
    })

    it('tr/en/de anahtar kümeleri birebir aynı', () => {
        for (const [name, messages] of [['en', en], ['de', de]] as [string, Messages][]) {
            const keys = new Set(flatten(messages))

            expect({ [name]: [...trKeys].filter(key => !keys.has(key)) })
                .toEqual({ [name]: [] })
            expect({ [name]: [...keys].filter(key => !trKeys.has(key)) })
                .toEqual({ [name]: [] })
        }
    })
})
