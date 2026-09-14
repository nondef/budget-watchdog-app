import { beforeEach, describe, expect, it } from 'vitest'
import { SqlJsTestAdapter } from './helpers/sqljs-adapter'
import { BackfillCategoryMetadata } from '@/infrastructure/database/migrations/027_backfill_category_metadata'

/** Migration 016 sonrasındaki `categories` şeması. */
const CREATE_TABLE = `
    CREATE TABLE categories (
        id TEXT PRIMARY KEY NOT NULL UNIQUE,
        name TEXT NOT NULL,
        icon TEXT,
        color TEXT,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'transfer')),
        is_system INTEGER NOT NULL DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    )
`

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const OLD = '2024-01-01T00:00:00.000Z'

describe('Migration 027 — kategori metadata backfill', () => {
    let db: SqlJsTestAdapter

    const rows = () => db.query('SELECT * FROM categories ORDER BY id')
    const migrate = () => new BackfillCategoryMetadata().up(db)

    beforeEach(async () => {
        db = await SqlJsTestAdapter.create()
        await db.execute(CREATE_TABLE)

        await db.run(
            `INSERT INTO categories (id, name, type, is_system, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            // Temiz kurulumun bıraktığı satır: iki damga da NULL, sistem işareti yok.
            ['broken', 'defaultCategories.foodDrink', 'expense', 0, null, null]
        )
        await db.run(
            `INSERT INTO categories (id, name, type, is_system, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            // Yarı eksik: `created_at` dolu, `updated_at` NULL.
            ['half', 'defaultCategories.salary', 'income', 1, OLD, null]
        )
        await db.run(
            `INSERT INTO categories (id, name, type, is_system, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            // Kullanıcı kategorisi: sağlam ve sistem kaydı değil.
            ['user', 'Kahve', 'expense', 0, OLD, OLD]
        )
    })

    it('iki damgası da NULL olan satırı doldurur', async () => {
        await migrate()

        const [broken] = (await rows()).rows.filter(r => r.id === 'broken')

        expect(broken.created_at).toMatch(ISO)
        expect(broken.updated_at).toMatch(ISO)
    })

    it('tek damga eksikse uydurmaz, dolu olandan türetir', async () => {
        await migrate()

        const [half] = (await rows()).rows.filter(r => r.id === 'half')

        expect(half.updated_at).toBe(OLD)
        expect(half.created_at).toBe(OLD)
    })

    it('varsayılan kategorileri sistem kaydı olarak işaretler', async () => {
        await migrate()

        const all = (await rows()).rows

        expect(all.find(r => r.id === 'broken')!.is_system).toBe(1)
        expect(all.find(r => r.id === 'half')!.is_system).toBe(1)
        // `defaultCategories.` öneki taşımayan kullanıcı kategorisine dokunulmaz;
        // aksi hâlde kullanıcı kendi kategorisini silemez hâle gelirdi.
        expect(all.find(r => r.id === 'user')!.is_system).toBe(0)
    })

    it('sağlam satırı değiştirmez', async () => {
        await migrate()

        const [user] = (await rows()).rows.filter(r => r.id === 'user')

        expect(user.created_at).toBe(OLD)
        expect(user.updated_at).toBe(OLD)
    })

    it('idempotent: ikinci kez çalışınca damgalar sabit kalır', async () => {
        await migrate()
        const first = (await rows()).rows

        await migrate()
        const second = (await rows()).rows

        expect(second).toEqual(first)
    })
})
