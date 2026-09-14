# iOS çıkış listesi

`ios/` platformu henüz eklenmedi ve **eklenmesi macOS + Xcode gerektiriyor**
(`npx cap add ios` Windows'ta çalışmaz). Bu dosya, platform eklendiğinde
Android'de zaten verilmiş olan veri güvenliği kararlarının iOS'ta da
verilmesini garanti etmek için var.

Android tarafındaki karar tek cümleyle şudur: **finansal veri hiçbir koşulda
cihaz dışına çıkmaz.** `AndroidManifest.xml` içinde `allowBackup="false"`,
`res/xml/data_extraction_rules.xml` içinde hem `cloud-backup` hem
`device-transfer` için tam dışlama, veritabanı ise SQLCipher ile şifreli.
Kullanıcının tek geri dönüş yolu uygulama içi Yedekle/Geri Yükle ve bunu
`useBackupReminder` 14 günde bir hatırlatıyor.

iOS'ta bu kararın karşılığı aşağıdaki adımlar. Hiçbiri varsayılan değil.

## 1. Şifreleme (config hazır)

`capacitor.config.ts` içindeki `CapacitorSQLite` bloğu iOS anahtarlarını
zaten taşıyor:

- `iosIsEncryption: true` — **verilmezse plugin veritabanını düz metin açar.**
  Android şifreli, iOS şifresiz bir sürüm çıkarmak sessiz bir güvenlik farkı
  yaratırdı ve bunu kimse fark etmezdi.
- `iosKeychainPrefix: 'budget-watchdog'` — sabit. Varsayılan bundle id'den
  türüyor; id değişirse (ör. ayrı bir TestFlight bundle'ı) passphrase
  "kaybolmuş" görünür, yani `EncryptionKeyLostError` ve kullanıcının tüm
  geçmişinin okunamaz hale gelmesi.
- `iosDatabaseLocation: 'Library/CapacitorDatabase'` — `Library/Caches`
  **değil**. iOS yer açmak için Caches'i haber vermeden siler; kullanıcının tek
  veri kopyası orada duramaz.

Anahtar adlarını plugin kaynağından doğrulayın:
`node_modules/@capacitor-community/sqlite/ios/Plugin/SqliteConfig.swift`.

## 2. Veritabanını iCloud yedeğinden hariç tutun (native, elle)

Bu **kalan tek iş** ve plugin'de config karşılığı yok.

`Library/CapacitorDatabase` varsayılan olarak iCloud yedeğine **dahildir**.
Şifreli DB iCloud'dan yeni bir cihaza dönüp Keychain girdisi dönmezse
(kullanıcı iCloud Keychain kullanmıyorsa) dosya kalıcı olarak açılamaz —
`EncryptionKeyLostError`, tüm finansal geçmiş gider. Plugin'in Keychain
girdisi `kSecAttrAccessible` değerini açıkça set etmiyor
(`ios/Plugin/Models/KeychainServices.swift`), yani geri gelip gelmeyeceği
kullanıcının iCloud Keychain ayarına kalıyor. Bu kumar oynanmaz.

Doğru çözüm Android ile aynı: **veri cihazdan hiç çıkmaz.** Böylece
"DB var ama anahtar yok" durumu fiziksel olarak imkânsız hale gelir.

`AppDelegate.swift` içinde, `application(_:didFinishLaunchingWithOptions:)`
sonunda:

```swift
var dbURL = FileManager.default
    .urls(for: .libraryDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("CapacitorDatabase")

// Dizin, plugin ilk DB'yi açmadan önce mevcut olmayabilir.
try? FileManager.default.createDirectory(
    at: dbURL, withIntermediateDirectories: true)

var values = URLResourceValues()
values.isExcludedFromBackup = true
try? dbURL.setResourceValues(values)
```

Bayrağın dizine (dosyaya değil) konması bilinçli: WAL/journal yan dosyaları da
kapsanır ve plugin dosyayı sonradan yeniden yaratsa bile dizin bayrağı kalır.

## 3. Info.plist

- `NSFaceIDUsageDescription` — `@aparajita/capacitor-biometric-auth` kilit
  ekranı için zorunlu; yoksa uygulama Face ID'ye ilk dokunuşta çöker.
- `ITSAppUsesNonExemptEncryption = false` — SQLCipher yalnızca yerel veri
  koruması için kullanılıyor. Bu satır olmadan her TestFlight yüklemesi
  ihracat uyumluluğu formunu elle doldurmayı bekletir.

## 4. Kabul testi (gerçek cihaz, simülatör değil)

Sırayla, atlamadan:

1. Temiz kurulum → 29 migration'ın tamamının koştuğunu doğrulayın
   (`tests/migration-chain.spec.ts` bunu sql.js üzerinde garanti ediyor;
   burada doğrulanan gerçek SQLCipher).
2. Birkaç hesap ve işlem girin, uygulamayı force-quit edip yeniden açın →
   veri yerinde mi.
3. Şifreli yedek alın, "Tüm verileri sil"i çalıştırın, yedekten geri yükleyin →
   satır sayıları birebir mi.
4. Cihazı iCloud'a yedekleyin, uygulamayı silin, yedekten geri yükleyin →
   **uygulama temiz kurulum olarak açılmalı**, "veritabanı bozuk" ya da
   kurtarma ekranı ile değil. Bu, 2. adımdaki dışlamanın çalıştığının kanıtı.
5. Sürüm atlama provası: App Store'daki sürümü kurun, veri girin, üstüne yeni
   build'i yükleyin → veri korunuyor mu.

## 5. Yayın sırası

İlk sürümü **yalnızca Google Play**'e çıkarın. Yukarıdaki 2. ve 4. maddeler
tamamlanmadan App Store'a gönderim yapılmamalı: iOS'ta yanlış varsayılanla
çıkılan bir sürüm, kullanıcının verisini kurtarma imkânı olmadan kaybettirir
ve sonraki bir güncelleme bunu geri getiremez.
