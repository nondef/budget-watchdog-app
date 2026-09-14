import type { CapacitorConfig } from '@capacitor/cli';

// Fail-closed: WebView debug yalnızca BW_DEBUG_WEBVIEW=1 ile açılır. Release
// build'de bu değişken tanımlı olmadığından yayındaki APK debug'a kapalıdır
// (aksi halde chrome://inspect ile tüm finansal veri okunabilirdi).
const debugWebView = process.env.BW_DEBUG_WEBVIEW === '1';

const config: CapacitorConfig = {
    appId: 'com.atakansenturk.budgetwatchdog',
    appName: 'Budget Watchdog',
    webDir: 'dist',
    android: {
        webContentsDebuggingEnabled: debugWebView,
    },
    plugins: {
        // @capacitor-community/safe-area ile Capacitor 8'in dahili SystemBars
        // inset yönetimi çakışıyordu: klavye açılınca IME inset'i iki kez
        // uygulanıyor, içerik klavye yüksekliğinin iki katı kadar yukarı
        // itiliyor ve arada kalan şeritte decorView'ın kendi arka planı
        // (light'ta beyaz, dark'ta gri) görünüyordu. Plugin bu değeri kendisi
        // de kontrol edip logluyor (SafeAreaPlugin.warnAboutUnsupported...).
        SystemBars: {
            insetsHandling: 'disable'
        },
        // Bildirimin durum çubuğunda / kilit ekranında görünen küçük ikonu.
        // Verilmediğinde plugin `ic_launcher`a düşüyor; Android küçük ikonu
        // yalnızca alfa maskesi olarak kullandığı için renkli launcher ikonu
        // ekranda düz beyaz bir leke olarak çıkıyordu. `ic_stat_notify` bunun
        // için çizilmiş tek renk siluet (bkz. res/drawable/ic_stat_notify.xml).
        //
        // `iconColor` Android 5+ üzerinde ikonu tint'ler; logodaki altın cüzdan
        // rengi kullanıldı ki bildirim marka ile aynı tonu taşısın.
        LocalNotifications: {
            smallIcon: 'ic_stat_notify',
            iconColor: '#B09456',
        },
        CapacitorCookies: {
            enabled: true
        },
        CapacitorHttp: {
            enabled: true
        },
        CapacitorSQLite: {
            // SQLCipher: DB dosyası düz metin olarak durmaz. Passphrase,
            // Android Keystore destekli EncryptedSharedPreferences'ta saklanır
            // (bkz. SqliteDatabaseAdapter.ensureEncryptionSecret).
            androidIsEncryption: true,
            androidBiometric: {
                // Kapalı kalmalı: true olsaydı MasterKey
                // setUserAuthenticationRequired ile kilitlenir ve DB açılmadan
                // ÖNCE her açılışta ayrı bir biyometri diyaloğu çıkardı —
                // uygulamanın kendi kilit ekranıyla çift sorgu olurdu.
                biometricAuth: false,
                biometricTitle: "Biometric login for capacitor sqlite",
                biometricSubTitle: "Log in using your biometric"
            },
            // ── iOS ──────────────────────────────────────────────────────
            // Platform henüz eklenmedi (`ios/` yok). Ayarlar YİNE DE burada
            // duruyor çünkü eksik oldukları senaryo sessiz ve geri dönüşsüz:
            // `iosIsEncryption` verilmediğinde plugin veritabanını DÜZ METİN
            // açar. Android şifreli, iOS şifresiz bir sürüm çıkarsak aynı
            // uygulamanın iki platformu arasında sessiz bir güvenlik farkı
            // olurdu ve bunu kimse fark etmezdi.
            iosIsEncryption: true,
            // Keychain girdilerinin ön eki. Sabitleniyor: varsayılan bundle
            // id'den türüyor ve id değişirse (ör. ayrı bir TestFlight bundle'ı)
            // passphrase "kaybolmuş" görünür — bu da EncryptionKeyLostError,
            // yani kullanıcının tüm geçmişinin okunamaz hale gelmesi demek.
            iosKeychainPrefix: 'budget-watchdog',
            // Library altında; Caches'te DEĞİL. iOS, yer açmak için Caches'i
            // haber vermeden siler — kullanıcının tek veri kopyası orada
            // duramaz. Bu dizinin iCloud yedeğinden hariç tutulması ayrıca
            // native tarafta yapılmalı (bkz. docs/ios-launch-checklist.md):
            // Keychain'i geri gelmeyen bir cihaza şifreli DB dönerse dosya
            // kalıcı olarak açılamaz.
            iosDatabaseLocation: 'Library/CapacitorDatabase',
            iosBiometric: {
                // androidBiometric ile aynı gerekçe: uygulamanın kendi kilit
                // ekranı zaten var, ikinci bir sistem diyaloğu çift sorgu olur.
                biometricAuth: false,
                biometricTitle: "Biometric login for capacitor sqlite",
                biometricSubTitle: "Log in using your biometric"
            }
        }
    }
};

export default config;
