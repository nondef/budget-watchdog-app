# Android Derlemesi

## Gereksinimler

| Araç | Sürüm | Not |
|---|---|---|
| JDK | **17** | Capacitor 8 / AGP 8.x zorunluluğu |
| Android Studio | Ladybug (2024.2) veya üzeri | — |
| Android SDK Platform | **API 36** (compile/target 36, min 24) | `android/variables.gradle` içinde tanımlı |
| Android SDK Build-Tools + Platform-Tools | güncel | `adb` için Platform-Tools |
| Gradle | proje wrapper'ı | Ayrıca kurmaya gerek yok |

Ortam değişkenleri: `JAVA_HOME` → JDK 17, `ANDROID_HOME` (veya `ANDROID_SDK_ROOT`)
→ SDK dizini; `platform-tools` `PATH`'e eklenmeli.

## Derle ve çalıştır

```bash
npm run build && npx cap sync android
```

```bash
npx cap open android
```

Uygulama kimliği: `com.atakansenturk.budgetwatchdog` (`capacitor.config.ts`).
`minSdk 24`, `compileSdk/targetSdk 36` (`android/variables.gradle`).

## Release imzalama

İmzalama sırları repoda tutulmaz. `android/keystore.properties` dosyası
`.gitignore`'dadır; yoksa build kırılmaz, sadece **imzasız** APK üretilir.

**1. Upload keystore üret** (bir kez — yedeğini mutlaka al, kaybedersen
uygulamayı Play üzerinde bir daha güncelleyemezsin):

```bash
keytool -genkeypair -v -keystore budget-watchdog-upload.jks -keyalg RSA -keysize 4096 -validity 10000 -alias upload
```

**2. Şablonu kopyala ve doldur:**

```bash
cp android/keystore.properties.example android/keystore.properties
```

`storeFile` yolu `android/app/` klasörüne göre çözülür.

**3. Derle:**

```bash
cd android && ./gradlew bundleRelease
```

Release build'de `minifyEnabled` ve `shrinkResources` açıktır; Capacitor,
SQLCipher ve Tink için gerekli keep kuralları `android/app/proguard-rules.pro`
içindedir. Yeni bir native plugin eklersen oraya da kural eklemen gerekebilir.

## WebView debug (`BW_DEBUG_WEBVIEW`)

`capacitor.config.ts` Vite bundle'ının parçası değildir — onu Capacitor CLI,
Node içinde çalıştırır. Bu yüzden orada `import.meta.env` değil `process.env`
geçerlidir ve **`.env` dosyası okunmaz**.

| Değişken | Değerler | Varsayılan | Açıklama |
|---|---|---|---|
| `BW_DEBUG_WEBVIEW` | `1` / tanımsız | tanımsız (kapalı) | Android WebView'ı `chrome://inspect`'e açar |

Yayın build'inde **kapalı olmalı** — açıkken cihaza erişen herkes uygulamanın
tüm verisini okuyabilir. Fail-closed tasarlandı: değişken verilmezse kapalıdır.
Debug'lı build için komut satırında ver:

```bash
BW_DEBUG_WEBVIEW=1 npx cap sync android
```

## Logoyu değiştirmek

Yeni, kare ve yüksek çözünürlüklü görselleri `assets/logo.png` ve isteğe bağlı
`assets/logo-dark.png` olarak yerleştir. Uygulama içindeki logo veya favicon da
değişecekse `public/brand/` ve `public/favicon.png` dosyalarını ayrıca güncelle.

```bash
npm run assets:android
```

```bash
npm run build && npx cap sync android
```

## `android/` klasörü silindiyse — temiz kurulum

> ⚠️ **`android/` klasörü sürüm kontrolüne DAHİLDİR — silinebilir bir çıktı klasörü
> değildir.** `android/.gitignore` yalnızca üretilmiş kısımları (`build/`,
> `.gradle/`, `assets/public`) dışlar; geriye gerçek kaynak kalır: manifest,
> gradle imzalama yapılandırması, ProGuard kuralları, marka ikonları, splash
> görselleri ve `MainActivity`.
>
> Aşağıdaki adımlar **yalnızca** klasör gerçekten kaybolduysa gerekir ve
> **her şeyi geri getirmez** — manifest sertleştirmesi, imzalama ayarı, ProGuard
> kuralları ve `MainActivity`'deki `EdgeToEdge.enable()` çağrısı elle yazılmalıdır.
>
> **Temiz derleme istiyorsan klasörü silme**, bunu çalıştır:
>
> ```bash
> cd android && ./gradlew clean && cd .. && npx cap sync android
> ```
>
> Commit'ten sonra kaybettiğin her şeyi `git checkout -- android/` ile geri alırsın.

Sıra önemlidir.

**1. Platformu yeniden ekle**

```bash
npm install && npm run build
```

```bash
npx cap add android
```

(`android/` klasörü hâlâ duruyorsa `npx cap add` çalışmaz; önce klasörü sil ya da
sadece `npx cap sync android` çalıştır.)

**2. Splash + launcher ikonları**

```bash
npm run assets:android
```

Bu adım `res/drawable*/splash.png`, `mipmap-*/ic_launcher*` ve splash tema
girdilerini yazar. Manifest standart launcher ikonlarını kullanmalıdır:

```xml
android:icon="@mipmap/ic_launcher"
android:roundIcon="@mipmap/ic_launcher_round"
```

**3. AndroidManifest.xml**

İzinleri ekle (`INTERNET` zaten gelir):

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
```

`<application>` üzerinde `android:allowBackup="false"` ve
`android:fullBackupContent="false"` **mutlaka** olmalı: Android Auto Backup
şifreli veritabanını yeni cihaza taşır ama Keystore'daki anahtarı taşımaz, dosya
kalıcı olarak açılamaz hale gelir. Referans için depodaki
`android/app/src/main/AndroidManifest.xml` dosyasına bak.

**4. Gradle sürümlerini doğrula**

`android/variables.gradle`: `minSdkVersion = 24`, `compileSdkVersion = 36`,
`targetSdkVersion = 36`.

**5. Senkronize et ve çalıştır**

```bash
npx cap sync android && npx cap open android
```

Cihazda doğrulama: uygulama ikonu koyu/açık temada doğru görünüyor mu, açılış
splash'i geliyor mu, bildirim ve biyometrik izinleri isteniyor mu, SQLite
veritabanı açılıyor mu (`VITE_LOG_CONSOLE=on` ile konsol çıktısı).
