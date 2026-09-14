<div align="center">

<img src="public/favicon.png" width="96" alt="Budget Watchdog" />

# Budget Watchdog

**İnternetsiz çalışan, çok para birimli kişisel bütçe uygulaması**
_Offline-first, multi-currency personal finance app for Android_

![license](https://img.shields.io/badge/license-MIT-blue) ![platform](https://img.shields.io/badge/platform-android-3DDC84) ![node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)

[Türkçe](#türkçe) · [English](#english)

</div>

---

# Türkçe

## Nedir?

Budget Watchdog; hesaplarını, harcamalarını, bütçelerini ve birikim hedeflerini
tek yerde takip etmeni sağlar.

- **Verin sadece telefonunda.** Hesap açma, sunucu ya da bulut yok.
- **İnternet gerekmez.** İnternet yalnızca döviz kurlarını güncellemek için
  kullanılır; bağlantı yoksa son bilinen kurlarla çalışmaya devam eder.
- **Veritabanı şifreli.** Anahtar telefonun güvenli donanımında (Android
  Keystore) saklanır.

## Özellikler

| | |
|---|---|
| **Hesaplar** | Birden fazla hesap, her hesaba ayrı para birimi, hesaplar arası ve farklı para birimleri arası transfer |
| **İşlemler** | Gelir, gider, transfer; kategori, not, tarih filtresi |
| **Bütçeler** | Haftalık / aylık / yıllık / tek seferlik, birden çok kategori, aşım bildirimi |
| **Birikim hedefleri** | Hedef tutar, hesaba bağlama, ilerleme takibi |
| **Döviz** | Güncel kurlar, finansal göstergeler |
| **Raporlar** | Nakit akışı, kategori dağılımı, aylık özet |
| **Güvenlik** | PIN ve biyometrik kilit |
| **Yedekleme** | Parolayla şifrelenmiş yedek alma / geri yükleme |
| **Diğer** | Açık / koyu tema, Türkçe / İngilizce / Almanca |

## Platform

| Platform | Durum |
|---|---|
| **Android** | ✅ Destekleniyor (Android 7.0+ / API 24+) |
| **iOS** | ❌ Henüz yok — `ios/` platformu eklenmedi. Eklenecekse önce [docs/ios-launch-checklist.md](docs/ios-launch-checklist.md) okunmalı |
| **Web** | 🛠 Yalnızca geliştirme için (`npm run dev`) |

> **Telefon değiştirirken:** Veriler Google yedeğine otomatik taşınmaz (şifreli
> veritabanı yeni telefonda açılamayacağı için bu bilinçli olarak kapalı).
> Uygulama içinden **Ayarlar → Yedekleme** ile yedek alıp yeni telefonda geri
> yükle.

## Hızlı başlangıç

Gereken: **Node.js 20+**

```bash
git clone <repo-url> budget-watchdog.app
```

```bash
cd budget-watchdog.app && npm install
```

```bash
npm run dev
```

Tarayıcıda `http://localhost:8821` açılır. `.env` dosyası gerekmez; ayarları
değiştirmek istersen `.env.example`'a bak.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusunu başlatır |
| `npm run build` | Tip kontrolü + üretim derlemesi (`dist/`) |
| `npm run test:unit -- --run` | Birim testleri |
| `npm run test:e2e` | Uçtan uca testler (önce `npm run build`) |
| `npm run lint` | Kod stili kontrolü |
| `npm run assets:android` | Logodan Android ikon ve açılış ekranı üretir |

## Android'e derleme

Gereken: **JDK 17** ve **Android Studio**.

```bash
npm run build && npx cap sync android
```

```bash
npx cap open android
```

Play Store için imzalı sürüm (keystore), logo değiştirme ve sorun giderme:
**[docs/android-build.md](docs/android-build.md)**

## Teknolojiler

Ionic 8 · Vue 3 · TypeScript · Capacitor 8 · SQLite (SQLCipher) · Pinia · Tailwind CSS · Chart.js · vue-i18n

## Proje yapısı

```
android/     Android projesi (repoya dahil — silme)
docs/        Ayrıntılı dokümanlar
src/
  domain/          İş kuralları (hesap, işlem, bütçe, para…)
  application/     Kullanıcı işlemleri (use case'ler)
  infrastructure/  Veritabanı, kur servisleri, yedekleme
  stores/          Ekran durumu (Pinia)
  views/           Sayfalar
  components/      Ortak bileşenler
tests/       Birim ve E2E testleri
```

## Dokümanlar

| Dosya | İçerik |
|---|---|
| [docs/privacy-policy.md](docs/privacy-policy.md) | Gizlilik politikası (Google Play için) |
| [docs/store-listing.md](docs/store-listing.md) | Google Play mağaza sayfası metinleri (TR / EN / DE) |
| [docs/developer-guide.md](docs/developer-guide.md) | Mimari, ortam değişkenleri, migration, kur API'leri, yedek formatı, testler |
| [docs/android-build.md](docs/android-build.md) | Android derleme, imzalama, logo, temiz kurulum |
| [docs/design-system.md](docs/design-system.md) | Tasarım kuralları |
| [docs/ios-launch-checklist.md](docs/ios-launch-checklist.md) | iOS eklenirse yapılması gerekenler |

## Lisans

**MIT** — [`LICENSE`](LICENSE). Telif hakkı © 2026 Atakan Şentürk.

Kodu ticari amaç dahil kullanabilir, değiştirebilir ve dağıtabilirsin; telif ve
lisans bildirimini koruman yeterli.

"Budget Watchdog" adı ve `assets/brand-source/` altındaki logo/ikonlar lisansa
dahil değildir; fork'larda kendi marka görsellerini kullan.

---

# English

## What is it?

Budget Watchdog tracks your accounts, spending, budgets and saving goals in one place.

- **Your data stays on your phone.** No account, no server, no cloud.
- **Works offline.** The internet is only used to refresh exchange rates; without
  a connection the app keeps using the last known rates.
- **Encrypted database.** The key lives in the phone's secure hardware (Android Keystore).

## Features

Multiple accounts and currencies · cross-currency transfers · weekly / monthly /
yearly / one-off budgets with overspend alerts · saving goals · live exchange
rates and market indicators · cash-flow and category reports · PIN and
biometric lock · password-encrypted backups · light / dark theme · Turkish,
English, German.

## Platform

| Platform | Status |
|---|---|
| **Android** | ✅ Supported (Android 7.0+ / API 24+) |
| **iOS** | ❌ Not yet — the `ios/` platform has not been added. See [docs/ios-launch-checklist.md](docs/ios-launch-checklist.md) first |
| **Web** | 🛠 Development only (`npm run dev`) |

> **Switching phones:** Data is not moved by Google backup (intentionally
> disabled — the encrypted database could not be opened on a new device). Use
> **Settings → Backup** in the app and restore on the new phone.

## Quick start

Requires **Node.js 20+**.

```bash
git clone <repo-url> budget-watchdog.app
```

```bash
cd budget-watchdog.app && npm install
```

```bash
npm run dev
```

Opens at `http://localhost:8821`. No `.env` needed; see `.env.example` for options.

## Build for Android

Requires **JDK 17** and **Android Studio**.

```bash
npm run build && npx cap sync android
```

```bash
npx cap open android
```

Release signing, icons and troubleshooting: [docs/android-build.md](docs/android-build.md)
(detailed docs are in Turkish).

## Privacy

See the [privacy policy](docs/privacy-policy.md).

## License

**MIT** — see [`LICENSE`](LICENSE). © 2026 Atakan Şentürk. The "Budget Watchdog"
name and the logo/icon files under `assets/brand-source/` are not covered by the
license.
