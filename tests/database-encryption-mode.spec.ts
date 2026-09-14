import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EncryptionKeyLostError } from '@/infrastructure/database/errors';

/**
 * `SqliteDatabaseAdapter`'ın açılış modu kararı.
 *
 * Kaynak hata: `ensureEncryptionSecret()` moddan ÖNCE koşuyordu. Diskte şifreli
 * bir veritabanı varken Keystore girdisi kaybolmuşsa sessizce YENİ bir
 * passphrase üretiyor, sonra dosyayı o anahtarla açmaya çalışıp sonsuza dek
 * patlıyordu — üstelik `isSecretStored()` artık true döndüğü için anahtar
 * kaybının izi bile kalmıyordu. Aşağıdaki en kritik iddia: bu senaryoda
 * `setEncryptionSecret` HİÇ çağrılmamalı.
 */

const stub = vi.hoisted(() => {
    const dbConnection = {
        open: vi.fn(async () => {}),
        execute: vi.fn(async () => ({ changes: { changes: 0 } })),
        query: vi.fn(async () => ({ values: [{ foreign_keys: 1 }] })),
    };

    const sqlite = {
        checkConnectionsConsistency: vi.fn(async () => ({ result: true })),
        isConnection: vi.fn(async () => ({ result: false })),
        isDatabase: vi.fn(async () => ({ result: false })),
        isDatabaseEncrypted: vi.fn(async () => ({ result: false })),
        isSecretStored: vi.fn(async () => ({ result: false })),
        setEncryptionSecret: vi.fn(async () => {}),
        createConnection: vi.fn(async () => dbConnection),
        retrieveConnection: vi.fn(async () => dbConnection),
    };

    return { sqlite, dbConnection };
});

vi.mock('@capacitor/core', () => ({
    Capacitor: {
        getPlatform: () => 'android',
        isNativePlatform: () => true,
    },
}));

vi.mock('jeep-sqlite/loader', () => ({ defineCustomElements: () => {} }));

vi.mock('@capacitor-community/sqlite', () => ({
    CapacitorSQLite: {},
    // Constructor bir nesne döndürünce `new` o nesneyi verir; adapter böylece
    // stub'ın kendisiyle çalışır.
    SQLiteConnection: class { constructor() { return stub.sqlite; } },
}));

const { SqliteDatabaseAdapter } = await import('@/infrastructure/adapters/sqlite-database-adapter');

/** `createConnection(name, encrypted, mode, ...)` çağrısındaki mod argümanı. */
function openedMode(): string {
    return stub.sqlite.createConnection.mock.calls.at(-1)?.[2] as string;
}

describe('SQLite açılış modu', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        stub.sqlite.checkConnectionsConsistency.mockResolvedValue({ result: true });
        stub.sqlite.isConnection.mockResolvedValue({ result: false });
        stub.sqlite.createConnection.mockResolvedValue(stub.dbConnection);
        stub.sqlite.retrieveConnection.mockResolvedValue(stub.dbConnection);
        stub.dbConnection.open.mockResolvedValue(undefined);
        stub.dbConnection.query.mockResolvedValue({ values: [{ foreign_keys: 1 }] });
    });

    it('şifreli veritabanı + kayıp anahtar: YENİ anahtar üretmez, açmayı denemez', async () => {
        stub.sqlite.isDatabase.mockResolvedValue({ result: true });
        stub.sqlite.isDatabaseEncrypted.mockResolvedValue({ result: true });
        stub.sqlite.isSecretStored.mockResolvedValue({ result: false });

        await expect(new SqliteDatabaseAdapter().initialize())
            .rejects.toBeInstanceOf(EncryptionKeyLostError);

        // Düzeltmenin bütün mesele ettiği iki satır.
        expect(stub.sqlite.setEncryptionSecret).not.toHaveBeenCalled();
        expect(stub.sqlite.createConnection).not.toHaveBeenCalled();
    });

    it('veritabanı yok: anahtar üretir ve doğrudan şifreli yaratır', async () => {
        stub.sqlite.isDatabase.mockResolvedValue({ result: false });
        stub.sqlite.isSecretStored.mockResolvedValue({ result: false });

        await new SqliteDatabaseAdapter().initialize();

        expect(stub.sqlite.setEncryptionSecret).toHaveBeenCalledTimes(1);
        expect(openedMode()).toBe('secret');
    });

    it('düz metin veritabanı: tek seferlik yerinde dönüşüm', async () => {
        stub.sqlite.isDatabase.mockResolvedValue({ result: true });
        stub.sqlite.isDatabaseEncrypted.mockResolvedValue({ result: false });
        stub.sqlite.isSecretStored.mockResolvedValue({ result: false });

        await new SqliteDatabaseAdapter().initialize();

        expect(stub.sqlite.setEncryptionSecret).toHaveBeenCalledTimes(1);
        expect(openedMode()).toBe('encryption');
    });

    it('şifreli veritabanı + anahtar duruyor: normal açılış, anahtar değişmez', async () => {
        stub.sqlite.isDatabase.mockResolvedValue({ result: true });
        stub.sqlite.isDatabaseEncrypted.mockResolvedValue({ result: true });
        stub.sqlite.isSecretStored.mockResolvedValue({ result: true });

        await new SqliteDatabaseAdapter().initialize();

        expect(stub.sqlite.setEncryptionSecret).not.toHaveBeenCalled();
        expect(openedMode()).toBe('secret');
    });

    it('saklanan anahtar dosyaya uymuyorsa ham SQLCipher hatası teşhise çevrilir', async () => {
        // Bu düzeltmeden ÖNCEKİ bir sürümün anahtar kaybının üstüne yeni anahtar
        // yazdığı kurulumlar sahada bu durumda: anahtar "var" ama yanlış.
        stub.sqlite.isDatabase.mockResolvedValue({ result: true });
        stub.sqlite.isDatabaseEncrypted.mockResolvedValue({ result: true });
        stub.sqlite.isSecretStored.mockResolvedValue({ result: true });
        stub.dbConnection.open.mockRejectedValue(new Error('Open: file is not a database'));

        await expect(new SqliteDatabaseAdapter().initialize())
            .rejects.toBeInstanceOf(EncryptionKeyLostError);
    });
});
