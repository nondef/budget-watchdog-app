/**
 * Kalıcı durum (DB) kurulumunun başarısızlık türleri.
 *
 * Ayrım tek bir soruya hizmet ediyor: **yeniden denemenin bir anlamı var mı?**
 * `unknown` geçici olabilir (soğuk açılışta ilk sorgular ara sıra patlıyor,
 * bkz. router/guards.ts), diğer ikisi determinist — aynı girdiyle sonsuza dek
 * aynı hatayı verirler ve tekrar denemek yalnızca pil yakar.
 */
export type PersistenceFailureKind =
    | 'encryption-key-lost'
    | 'migration'
    | 'schema-too-new'
    | 'unknown';

/**
 * Şifreli veritabanı diskte duruyor ama onu açacak passphrase Keystore'da yok.
 *
 * Bu durumda YENİ passphrase ÜRETİLMEZ. Üretmek veriyi kurtarmaz — dosya eski
 * anahtarla şifreli kalır — ama "anahtar kayboldu" gerçeğini "veritabanı bozuk"
 * gibi gösterip teşhisi imkânsız hale getirir. Daha kötüsü, sonraki açılışta
 * `isSecretStored()` artık true döneceği için hatanın izi tamamen silinir.
 *
 * Kullanıcı için tek çıkış yolu temiz bir veritabanı + yedekten geri yükleme;
 * kurtarma ekranı bunu açıkça söyler (bkz. RecoveryPage.vue).
 */
export class EncryptionKeyLostError extends Error {
    constructor(cause?: unknown) {
        super('Database encryption key is missing; the existing database cannot be opened');
        this.name = 'EncryptionKeyLostError';
        this.cause = cause;
        Object.setPrototypeOf(this, EncryptionKeyLostError.prototype);
    }
}

/**
 * Bir migration uygulanamadı.
 *
 * Migration'lar tek tek atomik olduğu için (bkz. MigrationManager.transactional)
 * şema son başarılı sürümde kalır — veri bozulmaz. Ama uygulama açılamaz ve
 * yeniden denemek işe yaramaz: aynı migration aynı veride yine patlar. Hangi
 * sürümde takıldığı kurtarma ekranında gösterilir, destek için kritik.
 */
export class MigrationFailedError extends Error {
    constructor(
        public readonly version: number,
        public readonly migrationName: string,
        cause?: unknown,
    ) {
        // Asıl sebep MESAJA da yazılır, yalnızca `cause`'a değil: logger
        // `cause` zincirini serileştirmiyor ve sarmalayınca "NOT NULL
        // constraint failed: ..." gibi tek işe yarar bilgi kayboluyordu.
        // Kurtarma ekranı ve tanılama dosyası tam olarak bunu gösteriyor.
        const reason = cause instanceof Error
            ? cause.message
            : cause != null ? String(cause) : '';

        super(`Migration ${version} (${migrationName}) failed${reason ? `: ${reason}` : ''}`);
        this.name = 'MigrationFailedError';
        this.cause = cause;
        Object.setPrototypeOf(this, MigrationFailedError.prototype);
    }
}

/**
 * SQLCipher yanlış passphrase'de "dosya veritabanı değil" der; şifreli bir
 * dosyayı düz metin gibi açmaya çalışmak da aynı yere düşer. Plugin bu mesajı
 * kendi metnine sardığı için tam eşleşme değil, içerik araması yapılır.
 *
 * Amaç teşhis: bu kalıplar eşleştiğinde hata "geçici" sayılmaz ve kullanıcıya
 * genel bir "bir şeyler ters gitti" yerine anahtar kaybı anlatılır.
 */
const WRONG_KEY_PATTERNS = [
    'file is not a database',
    'no passphrase stored',
    'not an error',
    'wrong secret',
    'sqlite_notadb',
];

export function looksLikeWrongEncryptionKey(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const normalized = message.toLowerCase();

    return WRONG_KEY_PATTERNS.some(pattern => normalized.includes(pattern));
}

/**
 * Diskteki şema, bu uygulama sürümünün bildiğinden YENİ.
 *
 * `migrations` tablosunda bilinmeyen (daha büyük) bir sürüm duruyor: cihaza bir
 * ara daha yeni bir build kurulmuş ve sonra bu sürüme geri dönülmüş (internal
 * testing kanalı, staged rollout'tan dönen tester, sideload edilmiş APK).
 *
 * Bu durumda açılışa DEVAM EDİLMEZ. Migration runner yalnızca ileri yönde
 * filtreliyor, yani bilinmeyen sürümü görmezden gelip şemayı "tanıdık"
 * sanarak yazmaya başlardı: repository'ler yeni kolonları hiç yazmaz, yeni
 * sürümde girilmiş alanlar sessizce bayatlar, NOT NULL bir kolon varsa yazma
 * anlaşılmaz bir kısıt hatasıyla patlar. Hiçbirinde kullanıcı ne olduğunu
 * göremez.
 *
 * Yedek dosyası bu korumaya zaten SAHİPTİ (`BackupService.validateAndMigrate`:
 * `version > BACKUP_VERSION` → "uygulamayı güncelleyin"); aynı kural
 * veritabanına da uygulanıyor.
 *
 * Veri SAĞLAM: tek çözüm uygulamayı güncellemek. Kurtarma ekranı bu türde
 * sıfırlamayı ve dışa aktarmayı gizler — ikisi de sağlam veriyi eski bir
 * şema anlayışıyla ellemek olurdu (bkz. RecoveryPage.vue).
 */
export class SchemaTooNewError extends Error {
    constructor(
        public readonly onDiskVersion: number,
        public readonly supportedVersion: number,
    ) {
        super(
            `Database schema version ${onDiskVersion} is newer than this build supports (${supportedVersion})`,
        );
        this.name = 'SchemaTooNewError';
        Object.setPrototypeOf(this, SchemaTooNewError.prototype);
    }
}

export function classifyPersistenceError(error: unknown): PersistenceFailureKind {
    if (error instanceof EncryptionKeyLostError) return 'encryption-key-lost';
    if (error instanceof MigrationFailedError) return 'migration';
    if (error instanceof SchemaTooNewError) return 'schema-too-new';
    if (looksLikeWrongEncryptionKey(error)) return 'encryption-key-lost';

    return 'unknown';
}

/**
 * Bu tür tekrar denemekle düzelir mi.
 *
 * `unknown` için true: geçici olabilir ve sonsuz değil, sınırlı sayıda denenir
 * (bkz. main.ts `retryPersistenceInBackground`).
 */
export function isRetryableFailure(kind: PersistenceFailureKind): boolean {
    return kind === 'unknown';
}
