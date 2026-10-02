<div align="center">

<img src="public/favicon.png" width="120" alt="Budget Watchdog" />

# Budget Watchdog

**İnternetsiz çalışan, çok para birimli kişisel bütçe uygulaması**
_Offline-first, multi-currency personal finance app for Android_

![version](https://img.shields.io/badge/version-1.3.0-informational) ![license](https://img.shields.io/badge/license-MIT-blue) ![platform](https://img.shields.io/badge/android-7.0%2B-3DDC84) ![node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)

[Türkçe](#türkçe) · [English](#english)

</div>

---

# Türkçe

Hesaplarını, harcamalarını, bütçelerini ve birikim hedeflerini tek yerde takip et.
Hesap açma yok, sunucu yok, bulut yok.

- **Veri yalnızca telefonda** — SQLCipher ile şifreli; anahtar Android Keystore'da.
- **İnternet gerekmez** — yalnızca döviz kurlarını güncellemek için kullanılır; bağlantı yoksa son bilinen kurlarla devam eder.

**Özellikler:** çoklu hesap ve para birimi · kurlar arası transfer · haftalık / aylık /
yıllık / tek seferlik bütçe ve aşım bildirimi · birikim hedefleri · canlı kurlar ve
piyasa göstergeleri · nakit akışı ve kategori raporları · PIN ve biyometrik kilit ·
parolalı yedekleme · açık / koyu tema · Türkçe, İngilizce, Almanca.

## İçindekiler

1. [Telefona kurulum](#telefona-kurulum)
2. [Kullanım](#kullanım)
3. [Geliştirme ortamı](#geliştirme-ortamı)
4. [Android derlemesi](#android-derlemesi)
5. [Dokümanlar](#dokümanlar)
6. [Lisans](#lisans)

## Telefona kurulum

Hazır APK yayınlanmıyor; kaynaktan derleyip kurarsın. Gerekenler:
**Node.js 20+**, **JDK 17**, **Android SDK (API 36)** ve USB hata ayıklaması açık bir
Android 7.0+ cihaz.

```bash
git clone https://github.com/nondef/budget-watchdog-app.git
```

```bash
cd budget-watchdog-app && npm install
```

```bash
npm run build && npx cap sync android
```

Telefonu USB ile bağla, sonra ya doğrudan çalıştır:

```bash
npx cap run android
```

ya da APK üretip elle kur (Windows'ta `gradlew.bat`):

```bash
cd android && ./gradlew assembleDebug
```

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Kullanım

1. **İlk açılış** — ana para birimini seç, ilk hesabını (banka, nakit, kredi kartı) oluştur. Dil: **Ayarlar → Dil**.
2. **İşlem ekle** — ana sayfadaki **Gelir / Gider / Transfer** kısayolları ya da İşlemler ekranındaki **+** ile. Farklı para birimleri otomatik çevrilir.
3. **Bütçe ve hedefler** — **Ayarlar → Bütçe Hedefleri / Tasarruf Hedefleri**. Bütçe aşılınca bildirim gelir.
4. **Raporlar** — Genel Bakış ekranında nakit akışı ve kategori dağılımı.
5. **Kilit** — **Ayarlar → Güvenlik** ile PIN ve biyometrik kilidi aç.
6. **Yedekleme** — **Ayarlar → Yedekleme** ile parolalı yedek al; yeni telefonda aynı ekrandan geri yükle.

> ⚠️ **Telefon değiştirirken** veriler Google yedeğiyle taşınmaz (şifreli veritabanı
> yeni cihazda açılamayacağı için bilinçli olarak kapalı). Mutlaka uygulama içinden
> yedek al. Yedek parolasını unutursan yedek açılamaz.

## Geliştirme ortamı

```bash
npm run dev
```

`http://localhost:8821` açılır (web sürümü yalnızca geliştirme içindir). `.env`
zorunlu değil; log ve test verisi seçenekleri için `.env.example`'a bak.

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Tip kontrolü + üretim derlemesi (`dist/`) |
| `npm run test:unit -- --run` | Birim testleri (Vitest) |
| `npm run test:e2e` | Uçtan uca testler (Cypress, önce `npm run build`) |
| `npm run lint` | ESLint |
| `npm run assets:android` | Logodan Android ikon ve splash üretir |

**Teknolojiler:** Ionic 8 · Vue 3 · TypeScript · Capacitor 8 · SQLite (SQLCipher) ·
Pinia · Tailwind CSS · Chart.js · vue-i18n

```
android/           Android projesi (repoya dahil, silme)
docs/              Ayrıntılı dokümanlar
src/domain/        İş kuralları (hesap, işlem, bütçe, para)
src/application/   Use case'ler
src/infrastructure/ Veritabanı, kur servisleri, yedekleme
src/stores/        Pinia store'ları
src/views/         Sayfalar
tests/             Birim ve E2E testleri
```

## Android derlemesi

Android Studio ile açmak için:

```bash
npx cap open android
```

İmzalı Play Store sürümü (`./gradlew bundleRelease`), keystore kurulumu, WebView
debug, logo değiştirme ve `android/` klasörü kaybolursa temiz kurulum:
**[docs/android-build.md](docs/android-build.md)**

| | |
|---|---|
| Uygulama kimliği | `com.atakansenturk.budgetwatchdog` |
| minSdk / targetSdk | 24 / 36 |
| iOS | Henüz yok — bkz. [docs/ios-launch-checklist.md](docs/ios-launch-checklist.md) |

## Dokümanlar

| Dosya | İçerik |
|---|---|
| [developer-guide.md](docs/developer-guide.md) | Mimari, ortam değişkenleri, migration, kur API'leri, yedek formatı, testler |
| [android-build.md](docs/android-build.md) | Derleme, imzalama, logo, temiz kurulum |
| [design-system.md](docs/design-system.md) | Tasarım kuralları |
| [privacy-policy.md](docs/privacy-policy.md) | Gizlilik politikası |
| [store-listing.md](docs/store-listing.md) | Google Play mağaza metinleri (TR / EN / DE) |
| [ios-launch-checklist.md](docs/ios-launch-checklist.md) | iOS eklenirse yapılacaklar |
| [CHANGELOG.md](CHANGELOG.md) | Sürüm notları |

## Lisans

**MIT** — [`LICENSE`](LICENSE). © 2026 Atakan Şentürk. Ticari kullanım dahil
serbestsin; telif ve lisans bildirimini koru. "Budget Watchdog" adı ve
`assets/brand-source/` altındaki logo/ikonlar lisansa dahil değildir; fork'larda
kendi marka görsellerini kullan.

---

# English

Track accounts, spending, budgets and saving goals in one place — no account, no
server, no cloud. Data stays on the phone in an SQLCipher-encrypted database whose
key lives in the Android Keystore. The internet is only used to refresh exchange
rates; offline, the last known rates are used.

**Features:** multiple accounts and currencies · cross-currency transfers · weekly /
monthly / yearly / one-off budgets with overspend alerts · saving goals · live rates
and market indicators · cash-flow and category reports · PIN and biometric lock ·
password-encrypted backups · light / dark theme · Turkish, English, German.

## Install on a phone

No prebuilt APK is published; build from source. Requires **Node.js 20+**,
**JDK 17**, **Android SDK (API 36)** and an Android 7.0+ device with USB debugging.

```bash
git clone https://github.com/nondef/budget-watchdog-app.git
```

```bash
cd budget-watchdog-app && npm install
```

```bash
npm run build && npx cap sync android
```

```bash
npx cap run android
```

Or build an APK (`gradlew.bat` on Windows) and install it:

```bash
cd android && ./gradlew assembleDebug
```

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Usage

1. **First launch** — pick a base currency and create your first account. Language: **Settings → Language**.
2. **Add transactions** — use the **Income / Expense / Transfer** shortcuts on Home or **+** on Transactions; currencies convert automatically.
3. **Budgets & goals** — **Settings → Budget Goals / Savings Goals**.
4. **Lock** — **Settings → Security** for PIN and biometrics.
5. **Backup** — **Settings → Backup**; restore from the same screen on a new phone.

> ⚠️ Google backup does not move your data between phones (intentionally disabled).
> Always create an in-app backup before switching devices.

## Development

```bash
npm run dev
```

Opens at `http://localhost:8821` (web is for development only). See the command
table above and `.env.example`. Release signing and more:
[docs/android-build.md](docs/android-build.md) (detailed docs are in Turkish).

## License

**MIT** — see [`LICENSE`](LICENSE). © 2026 Atakan Şentürk. The "Budget Watchdog"
name and the logo/icon files under `assets/brand-source/` are not covered by the
license. Privacy: [docs/privacy-policy.md](docs/privacy-policy.md).
