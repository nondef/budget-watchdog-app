import { DatabaseAdapter, QueryResult } from "@/domain/interfaces/database-adapter";
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from "@capacitor-community/sqlite";
import { Capacitor } from "@capacitor/core";
import { defineCustomElements as jeepSQLite } from "jeep-sqlite/loader";
import { logger } from "@/infrastructure/logging";
import { secureRandomHex } from "@/shared/utils/crypto/crypto";
import { EncryptionKeyLostError, looksLikeWrongEncryptionKey } from "@/infrastructure/database/errors";

const CTX = "db";

export class SqliteDatabaseAdapter implements DatabaseAdapter {
    private sqlite: SQLiteConnection | null = null
    private db: SQLiteDBConnection | null = null
    private ready = false
    // Manuel (use-case seviyesi) transaction aktifse true. Aktifken alttaki
    // run/execute/executeSet çağrılarına `transaction:false` geçiyoruz ki plugin
    // her ifadeyi kendi BEGIN/COMMIT'ine sarıp "transaction within a transaction"
    // hatası vermesin ve rollback tüm ifadeleri kapsasın.
    private inTransaction = false
    private readonly DB_NAME = 'budget-watchdog.db'
    // createConnection/isConnection/retrieveConnection sondaki '.db'yi kendileri
    // kırpar ve bağlantıyı kırpılmış adla kaydeder; saveToStore ise KIRPMAZ
    // (@capacitor-community/sqlite definitions.js). Uzantılı ad verilince
    // "No available connection" der ve hiçbir şey kaydedilmez.
    private readonly DB_STORE_NAME = this.DB_NAME.replace(/\.db$/, '')
    private readonly DB_VERSION = 1

    private readonly isWeb = Capacitor.getPlatform() === 'web'
    /**
     * SQLCipher yalnızca native'de var: jeep-sqlite'ın şifreleme desteği yok
     * ve tüm *EncryptionSecret çağrıları web'de "Not implemented on web."
     * fırlatır. Web (dev/PWA) düz metin çalışmaya devam eder.
     */
    private readonly useEncryption = !this.isWeb
    /** Son kalıcı yazımdan (saveToStore) beri değişiklik var mı — yalnızca web. */
    private webStoreDirty = false
    /** Eşzamanlı saveToStore çağrılarını sıraya alan zincir. */
    private saveChain: Promise<void> = Promise.resolve()
    private removeWebPersistListeners: (() => void) | null = null

    async initialize(): Promise<void> {
        try {
            const platform = Capacitor.getPlatform()

            if (platform === 'web') {
                await this.initializeWebPlatform()
            }

            this.sqlite = new SQLiteConnection(CapacitorSQLite)

            if (platform === 'web') {
                await this.ensureWebStoreReady()
            }

            this.db = await this.getOrCreateConnection()
            await this.openConnection()
            await this.db.execute('PRAGMA foreign_keys = ON;', false)

            const foreignKeys = await this.db.query('PRAGMA foreign_keys;')
            const enabled = Number(foreignKeys.values?.[0]?.foreign_keys ?? 0) === 1

            if (!enabled) {
                throw new Error('SQLite foreign key enforcement could not be enabled')
            }

            this.installWebPersistListeners()

            this.ready = true
            logger.debug('SQLite veritabanı başlatıldı', { context: CTX })
        } catch (e) {
            logger.error('Veritabanı başlatılamadı', { context: CTX, error: e });
            throw e;
        }
    }

    private async initializeWebPlatform(): Promise<void> {
        // Stencil ilk render'ını requestAnimationFrame ile planlar; Chromium
        // gizli sekmelerde rAF'ı hiç tetiklemez, öğe hidrate olmaz ve
        // componentOnReady sekme görünür olana dek çözülmez → açılış
        // arka plan sekmesinde "Initializing database"de asılı kalır.
        // Öğe bağlanmadan ÖNCE rAF'ı gizliyken setTimeout'a düşen bir
        // shim ile değiştir; hidrasyon bitince orijinali geri koy.
        const restoreRaf = this.installHiddenTabRafFallback()

        try {
            jeepSQLite(window)
            await customElements.whenDefined('jeep-sqlite')

            let jeepElement = document.querySelector('jeep-sqlite')

            if (!jeepElement) {
                jeepElement = document.createElement('jeep-sqlite')
                jeepElement.setAttribute('autoSave', 'true')
                document.body.appendChild(jeepElement)
                await customElements.whenDefined('jeep-sqlite')
            }

            // whenDefined tanımı bekler ama Stencil hidrasyonunu BEKLEMEZ;
            // öğe hazır olmadan initWebStore çağrılırsa mesaj kaybolur ve
            // açılış sonsuza dek "Web store başlatılıyor"da asılı kalır
            // (web'de aralıklı beyaz ekranın nedeni).
            await (jeepElement as HTMLElement & { componentOnReady?: () => Promise<unknown> })
                .componentOnReady?.()
        } finally {
            restoreRaf()
        }
    }

    private installHiddenTabRafFallback(): () => void {
        const nativeRaf = window.requestAnimationFrame
        const nativeCancel = window.cancelAnimationFrame
        const timeoutIds = new Set<number>()

        window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
            if (document.visibilityState !== 'hidden') {
                return nativeRaf.call(window, callback)
            }

            const id = window.setTimeout(() => {
                timeoutIds.delete(id)
                callback(performance.now())
            }, 16)
            timeoutIds.add(id)
            return id
        }

        window.cancelAnimationFrame = (id: number): void => {
            if (timeoutIds.delete(id)) {
                window.clearTimeout(id)
                return
            }
            nativeCancel.call(window, id)
        }

        return () => {
            window.requestAnimationFrame = nativeRaf
            window.cancelAnimationFrame = nativeCancel
        }
    }

    private async ensureWebStoreReady(): Promise<void> {
        if (!this.sqlite) {
            return
        }

        try {
            await this.sqlite.checkConnectionsConsistency()
        } catch (e) {
            logger.debug('Web store başlatılıyor', { context: CTX })
            await this.sqlite.initWebStore()
        }
    }

    /**
     * Web'de veriyi IndexedDB'ye yazar. Native'de no-op (gerçek dosya tabanlı DB).
     *
     * jeep-sqlite'ın `autoSave`'i YETMEZ: yalnızca kendi açtığı transaction
     * kapanırken çalışır (`database.js` → `if (this.autoSave && !this.isTransactionActive)`)
     * ve `commitTransaction()` hiç saveToStore çağırmaz. Uygulamadaki anlamlı
     * yazımların tamamı UnitOfWork üzerinden manuel bir transaction içinde
     * koştuğu için hiçbiri diske inmiyordu: reload sonrası uygulama kendini
     * temiz kurulum sanıyor, onboarding'i baştan gösteriyordu.
     *
     * Hata fırlatılmaz: commit zaten gerçekleşti, kalıcılaştırma başarısızlığı
     * başarılı bir işlemi geriye dönük hataya çeviremez. Bayrak açık kalır,
     * sonraki flush yeniden dener.
     */
    private async persistWebStore(): Promise<void> {
        if (!this.isWeb || !this.sqlite) {
            return
        }

        this.saveChain = this.saveChain.then(async () => {
            if (!this.webStoreDirty || !this.inTransaction) {
                return
            }

            this.webStoreDirty = false

            try {
                await this.sqlite!.saveToStore(this.DB_STORE_NAME)
            } catch (error) {
                this.webStoreDirty = true
                logger.error('Web store kaydedilemedi', { context: CTX, error })
            }
        })

        return this.saveChain
    }

    /**
     * Son çare kalıcılaştırma: transaction dışında kalan ya da gözden kaçan bir
     * yazım varsa sayfa gizlenirken/kapanırken yazılır. `pagehide` sırasında
     * async iş tamamlanmayabilir; bu yüzden asıl garanti commit'teki flush.
     */
    private installWebPersistListeners(): void {
        if (!this.isWeb || this.removeWebPersistListeners) {
            return
        }

        const flush = () => { void this.persistWebStore() }
        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') flush()
        }

        document.addEventListener('visibilitychange', onVisibilityChange)
        window.addEventListener('pagehide', flush)

        this.removeWebPersistListeners = () => {
            document.removeEventListener('visibilitychange', onVisibilityChange)
            window.removeEventListener('pagehide', flush)
        }
    }

    /**
     * Passphrase yoksa üretip Keystore destekli EncryptedSharedPreferences'a
     * yazar. createConnection'dan ÖNCE çağrılmalı: native `open()` şifreli
     * modda passphrase bulamazsa "No Passphrase stored" ile patlar.
     *
     * Modu parametre olarak alır ve KENDİ BAŞINA karar vermez: yeni anahtar
     * üretmenin güvenli olduğu tek durum "açılacak şifreli veri yok"tur ve bunu
     * yalnızca `resolveOpenMode()` bilir. Eskiden bu metot moddan önce
     * koşuyordu; diskte şifreli bir DB varken Keystore girdisi kaybolmuşsa
     * sessizce YENİ bir anahtar üretiyor, ardından `resolveOpenMode()` dosyayı
     * 'secret' modda açmaya çalışıyor ve yanlış anahtarla sonsuza dek
     * patlıyordu — üstelik `isSecretStored()` artık true döndüğü için sonraki
     * açılışlarda anahtar kaybının izi bile kalmıyordu.
     */
    private async ensureEncryptionSecret(mode: string): Promise<void> {
        if (!this.useEncryption || !this.sqlite || mode === 'no-encryption') {
            return
        }

        const { result: stored } = await this.sqlite.isSecretStored()

        if (stored) {
            return
        }

        // Passphrase bundle'da DEĞİL: APK'yı açan biri okuyamaz, yalnızca bu
        // cihazın Keystore'u çözebilir.
        await this.sqlite.setEncryptionSecret(secureRandomHex(32))
        logger.info('Veritabanı şifreleme anahtarı oluşturuldu', { context: CTX })
    }

    /**
     * Açılış modu:
     *  - web                        → 'no-encryption' (SQLCipher yok)
     *  - dosya yok                  → 'secret' (yeni DB doğrudan şifreli yaratılır)
     *  - düz metin                  → 'encryption' (tek seferlik yerinde dönüşüm)
     *  - şifreli + anahtar var      → 'secret'
     *  - şifreli + anahtar YOK      → `EncryptionKeyLostError`
     *
     * Son satır bu metodun asıl işi: anahtarsız şifreli bir DB gördüğünde
     * açılışı denemek yerine durur. Denemek veriyi kurtarmaz, yalnızca hatayı
     * anlaşılmaz bir "veritabanı bozuk"a çevirir (bkz. database/errors.ts).
     */
    private async resolveOpenMode(): Promise<string> {
        if (!this.useEncryption || !this.sqlite) {
            return 'no-encryption'
        }

        const { result: exists } = await this.sqlite.isDatabase(this.DB_NAME)

        if (!exists) {
            return 'secret'
        }

        const { result: encrypted } = await this.sqlite.isDatabaseEncrypted(this.DB_NAME)

        if (!encrypted) {
            return 'encryption'
        }

        const { result: stored } = await this.sqlite.isSecretStored()

        if (!stored) {
            logger.fatal('Şifreli veritabanı var ama şifreleme anahtarı bulunamadı', {
                context: CTX,
            })
            throw new EncryptionKeyLostError()
        }

        return 'secret'
    }

    private async getOrCreateConnection(): Promise<SQLiteDBConnection> {
        if (!this.sqlite) {
            throw new Error('SQLite connection not initialized');
        }

        const { result: isConsistent } = await this.sqlite.checkConnectionsConsistency();
        const { result: hasConnection } = await this.sqlite.isConnection(this.DB_NAME, false);

        if (isConsistent && hasConnection) {
            logger.debug('Mevcut bağlantı alınıyor', { context: CTX });
            return this.sqlite.retrieveConnection(this.DB_NAME, false);
        }

        // Sıra kritik: önce diskteki dosyanın durumuna bakılıp mod belirlenir,
        // sonra (yalnızca güvenliyse) passphrase saklanır, en son bağlantı
        // açılır. Ters sıra anahtar kaybını sessizce örtüyordu — bkz.
        // `ensureEncryptionSecret`.
        const mode = await this.resolveOpenMode()
        await this.ensureEncryptionSecret(mode)

        logger.debug('Yeni bağlantı oluşturuluyor', { context: CTX, data: { mode } });

        return this.sqlite.createConnection(
            this.DB_NAME,
            this.useEncryption,
            mode,
            this.DB_VERSION,
            false
        );
    }

    /**
     * `open()` + yanlış-anahtar teşhisi.
     *
     * `resolveOpenMode()` anahtarın VARLIĞINI kontrol eder, DOĞRULUĞUNU değil.
     * Saklanan anahtar dosyaya uymuyorsa (ör. bu düzeltmeden önceki bir sürüm
     * anahtar kaybının üstüne yenisini yazdıysa) SQLCipher "file is not a
     * database" der. Ham hata kullanıcıya "veritabanı bozuk" gibi görünür;
     * burada doğru teşhise çevrilir ki kurtarma ekranı yedekten geri yüklemeyi
     * önerebilsin.
     */
    private async openConnection(): Promise<void> {
        try {
            await this.db!.open()
        } catch (error) {
            if (this.useEncryption && looksLikeWrongEncryptionKey(error)) {
                logger.fatal('Veritabanı saklanan anahtarla açılamadı', { context: CTX, error })
                throw new EncryptionKeyLostError(error)
            }

            throw error
        }
    }

    async execute(sql: string): Promise<QueryResult> {
        this.ensureInitialized();

        try {
            const result = await this.db!.execute(sql, !this.inTransaction);
            this.webStoreDirty = true;
            return {
                rows: [],
                rowsAffected: result.changes?.changes || 0,
                insertId: result.changes?.lastId
            };
        } catch (error) {
            logger.error('SQL execute hatası', { context: CTX, error, data: { sql } });
            throw error;
        }
    }

    async executeBatch(statements: { sql: string; params?: any[] }[]): Promise<void> {
        this.ensureInitialized();

        try {
            const set = statements.map(stmt => ({
                statement: stmt.sql,
                values: stmt.params || []
            }));
            await this.db!.executeSet(set, !this.inTransaction);
            this.webStoreDirty = true;
        } catch (error) {
            logger.error('SQL batch hatası', { context: CTX, error });
            throw error;
        }
    }

    async query(sql: string, params?: any[]): Promise<QueryResult> {
        this.ensureInitialized();

        try {
            const result = await this.db!.query(sql, params);
            return {
                rows: result.values || [],
                rowsAffected: result.values?.length || 0
            };
        } catch (error) {
            logger.error('SQL query hatası', { context: CTX, error, data: { sql } });
            throw error;
        }
    }

    async run(sql: string, params?: any[]): Promise<QueryResult> {
        this.ensureInitialized();

        try {
            const result = await this.db!.run(sql, params || [], !this.inTransaction);
            this.webStoreDirty = true;
            return {
                rows: result?.changes?.values || [],
                rowsAffected: result?.changes?.changes || 0
            };
        } catch (error) {
            logger.error('SQL run hatası', { context: CTX, error, data: { sql } });
            throw error;
        }
    }

    async beginTransaction(): Promise<void> {
        this.ensureInitialized();

        if (this.inTransaction) {
            throw new Error('A database transaction is already active');
        }

        await this.db!.beginTransaction();
        this.inTransaction = true;
    }

    async commitTransaction(): Promise<void> {
        if (!this.inTransaction) {
            return;
        }

        try {
            await this.db!.commitTransaction();
        } finally {
            this.inTransaction = false;
        }

        // Commit web'de tek başına kalıcı değil; bkz. persistWebStore().
        await this.persistWebStore();
    }

    async rollbackTransaction(): Promise<void> {
        if (!this.inTransaction) {
            return;
        }

        try {
            await this.db!.rollbackTransaction();
        } finally {
            this.inTransaction = false;
        }
    }

    async isTransactionActive(): Promise<boolean> {
        return this.inTransaction;
    }

    async close(): Promise<void> {
        if (this.db) {
            // Kapanmadan önce bekleyen değişiklikleri yaz: bağlantı kapandıktan
            // sonra export edilecek bir DB kalmaz.
            await this.persistWebStore();

            this.removeWebPersistListeners?.();
            this.removeWebPersistListeners = null;

            await this.db.close();

            if (this.sqlite) {
                await this.sqlite.closeConnection(this.DB_NAME, false);
            }

            this.db = null;
            this.ready = false;
        }
    }

    /**
     * Veritabanı DOSYASINI siler. Yalnızca kurtarma akışı için.
     *
     * Bağlantının açık olması ŞART: plugin silmeden önce dosyayı kendisi
     * açmaya çalışıyor (`Database.deleteDB` → `if (_file.exists() && !_isOpen)
     * open()`). Yani açılamayan bir veritabanı — tam olarak anahtarı kaybolmuş
     * olan — uygulama içinden silinemez. Çağıran bunu kullanıcıya söylemek
     * zorunda; sessizce "silindi" demek en zararlı sonuç olurdu
     * (bkz. database/recovery.ts).
     */
    async deleteDatabaseFile(): Promise<void> {
        this.ensureInitialized();

        await this.db!.delete();

        this.removeWebPersistListeners?.();
        this.removeWebPersistListeners = null;
        this.db = null;
        this.ready = false;

        logger.warn('Veritabanı dosyası silindi (kurtarma)', { context: CTX });
    }

    isReady(): boolean {
        return this.ready;
    }

    private ensureInitialized(): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
    }
}
