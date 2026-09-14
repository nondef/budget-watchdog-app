import { BaseMigration } from './base-migration';
import { DatabaseAdapter } from '@/domain';
import { logger } from '@/infrastructure/logging';

const CTX = 'migration';

/** BaseRepository ile aynı kural: DDL'de bildirilen tip ya da ad sezgisi. */
const DATE_COLUMN_TYPES = new Set(['DATE', 'DATETIME', 'TIMESTAMP']);
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** SQLite `CURRENT_TIMESTAMP` çıktısı: 'YYYY-MM-DD HH:MM:SS' (UTC, ek yok). */
const SQLITE_TIMESTAMP_GLOB =
    '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]*';

function isDateColumn(name: string, declaredType: string): boolean {
    if (DATE_COLUMN_TYPES.has(declaredType.toUpperCase())) return true;
    return name.endsWith('_at') || name === 'date' || name.endsWith('_date');
}

/**
 * Tarih kolonlarındaki 'YYYY-MM-DD HH:MM:SS' değerlerini ISO 8601'e çevirir.
 *
 * Repository tarihleri `toISOString()` ile ('2026-07-29T10:00:00.000Z') yazıyor,
 * ama `DEFAULT CURRENT_TIMESTAMP`'e düşen satırlar (migration backfill'leri, ham
 * INSERT'ler) '2026-07-29 10:00:00' formatında kalıyor. SQLite bu kolonları metin
 * olarak karşılaştırdığı için 11. karakterde 'T'(0x54) > ' '(0x20) çıkıyor:
 *
 * - `ORDER BY created_at DESC` bütün ISO satırlarını, gerçek zamanları ne olursa
 *   olsun, bütün CURRENT_TIMESTAMP satırlarının üstüne koyuyordu.
 * - `WHERE date >= ?` gibi aralık filtreleri aynı nedenle satır kaçırıyordu.
 *
 * Okuma yolu (`casts.parseDate`) iki formatı da doğru yorumluyor; bozulan yalnızca
 * SQL tarafındaki sıralama/karşılaştırma. Kalıcı çözüm veriyi tek formata almak.
 *
 * Idempotent: yalnızca desene uyan satırlara dokunur, ISO değerler zaten eşleşmez.
 */
export class NormalizeTimestampFormat extends BaseMigration {
    version = 26;
    name = 'normalize_timestamp_format';

    async up(db: DatabaseAdapter): Promise<void> {
        const tables = await db.query(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
        );

        for (const table of tables.rows) {
            const tableName = String(table.name);
            if (!IDENTIFIER_PATTERN.test(tableName)) continue;

            const info = await db.query(`PRAGMA table_info(${tableName})`);

            for (const column of info.rows) {
                const columnName = String(column.name ?? '');
                if (!IDENTIFIER_PATTERN.test(columnName)) continue;
                if (!isDateColumn(columnName, String(column.type ?? ''))) continue;

                // ' ' → 'T' ve sonuna 'Z': CURRENT_TIMESTAMP değerleri zaten UTC.
                await db.execute(`
                    UPDATE "${tableName}"
                       SET "${columnName}" = replace("${columnName}", ' ', 'T') || 'Z'
                     WHERE "${columnName}" GLOB '${SQLITE_TIMESTAMP_GLOB}'
                `);
            }
        }

        logger.debug('Tarih kolonları ISO 8601 formatına normalize edildi', { context: CTX });
    }

    /**
     * Geri alınmaz: ISO'ya çevrilen değerlerin hangilerinin başta
     * CURRENT_TIMESTAMP'ten geldiğini ayırt etmenin yolu yok ve geri çevirmek
     * milisaniye bilgisini atardı. Formatın kendisi de zaten hedef durum.
     */
    async down(): Promise<void> {}
}
