# Geliştirici Rehberi

- [Mimari](#mimari)
- [Ortam değişkenleri](#ortam-değişkenleri)
- [Veritabanı ve migration'lar](#veritabanı-ve-migrationlar)
- [Döviz kuru API'leri](#döviz-kuru-apileri)
- [Yedekleme formatı](#yedekleme-formatı)
- [Testler](#testler)
- [Çoklu dil](#çoklu-dil)
- [Sorun giderme](#sorun-giderme)

## Mimari

Katmanlı (clean/hexagonal esintili) bir yapı kullanılır. Bağımlılık yönü daima
**dışarıdan içeriye** doğrudur: `views → stores → use-cases → domain ← infrastructure`.

```
src/
├── domain/          # Saf iş kuralları — framework bağımsız
│   ├── entities/          # Account, Transaction, Budget, SavingGoal, Category, Currency…
│   ├── value-objects/     # Money, Percentage, DateRange, Theme, Language, Progress…
│   ├── services/          # AccountBalance, BudgetCalculation, MarketQuote, Categorization
│   ├── interfaces/        # Repository / DatabaseAdapter / UnitOfWork sözleşmeleri
│   └── exceptions/        # Alan hataları
│
├── application/     # Use case'ler — tek bir kullanıcı niyeti = tek bir sınıf
│   ├── use-cases/         # account, transaction, budget, saving-goal, category, currency, exchange-rate, app
│   ├── dto/               # Giriş/çıkış tipleri
│   └── mappers/           # Entity ↔ DTO
│
├── infrastructure/  # Dış dünya
│   ├── database/          # migrations, repositories, unit-of-work, transaction-coordinator, seeders, recovery
│   ├── adapters/          # sqlite-database-adapter, query-logging-database-adapter
│   ├── services/          # financial (kur sağlayıcıları), market, backup, biometric, pin-hasher
│   ├── http/              # fetch-json, timeout, hata tipleri
│   └── logging/           # merkezi logger
│
├── stores/          # Pinia — UI durumu; use case'leri çağırır, iş kuralı barındırmaz
├── composables/     # Yeniden kullanılabilir UI mantığı (useMoney, useBudgetSummary, …)
├── views/ components/ router/ locales/ theme/ shared/
```

**Öne çıkan kararlar**

- **Tek transaction sahibi:** Tek SQLite bağlantısı üzerindeki bütün yazmalar
  `TransactionCoordinator` kuyruğundan geçer. Çok tablolu yazmalar
  `SqliteUnitOfWork` ile tek transaction'da yürür; ya hepsi yazılır ya hiçbiri.
- **Money:** Tutarlar `Money` value object'inde para biriminin hassasiyetine
  (minor unit) yuvarlanır. Veritabanı seviyesinde geçersiz tutarları reddeden
  trigger'lar vardır (migration 021).
- **Şifreli veritabanı:** Android'de SQLCipher; anahtar Android Keystore destekli
  depoda tutulur, APK içinde değil.
- **Kurtarma ekranı:** Açılışta veritabanı açılamaz veya bir migration patlarsa
  uygulama boş ekranda kalmaz; kullanıcı `RecoveryPage`'e yönlenir, verisini
  dışa aktarabilir.
- **Kur sağlayıcıları:** `FinancialService` sırayla `open.er-api.com` ve
  `frankfurter.app` sağlayıcılarını dener; cache (30 dk) + cooldown (5 dk) +
  aynı anda tek istek (in-flight dedup) uygular.

## Ortam değişkenleri

`.env` isteğe bağlıdır — tüm değişkenlerin kodda varsayılanı vardır. Şablon:
`.env.example`.

> ⚠️ `VITE_` önekli her değişken build'e gömülür ve **client'ta herkese açıktır**.
> Buraya asla secret/token koyma.

| Değişken | Değerler | Varsayılan | Açıklama |
|---|---|---|---|
| `VITE_LOG_LEVEL` | `debug`…`fatal` | dev: `debug`, prod: `info` | Minimum log seviyesi |
| `VITE_LOG_CONSOLE` | `auto` / `on` / `off` | `auto` | Konsola yazım (`auto` → sadece dev) |
| `VITE_DB_LOG` | `auto` / `on` / `off` | `auto` | Çalışan SQL'i süre + parametreyle basar |
| `VITE_DB_LOG_SLOW` | ms | `0` | Yalnızca bu süreyi aşan sorguları bas |
| `VITE_DB_LOG_TX` | `off` / `summary` / `verbose` | `summary` | Transaction satırlarının ayrıntısı |
| `VITE_BRIDGE_LOG` | `off` / `logger` / `console` | `off` | Capacitor köprü trafiği (SQLite hariç) |
| `VITE_APP_NAME` | metin | `Budget Watchdog` | Ekranlarda gösterilen uygulama adı |
| `VITE_APP_VERSION` | metin | `1.0.0` | Ekranlarda gösterilen sürüm |
| `VITE_SEED_FAKE_DATA` | `false` / `true` / `reset` | `false` | Sahte veri üretimi (prod build'de her koşulda kapalı) |

**Sahte veri** — `true` iken 1 yıllık işlem geçmişi, çok para birimli hesaplar ve
örnek bütçe/hedefler üretir; yalnızca kendi ürettiği satırlara dokunur. `reset`
önce eski sahte veriyi siler. Restart istemeden tarayıcı konsolundan da
açılabilir:

```js
localStorage.bw_seed_fake = 'reset'
```

Diğer runtime anahtarları: `bw_debug`, `bw_db_log`.

Android'e özgü `BW_DEBUG_WEBVIEW` için bkz. [android-build.md](android-build.md#webview-debug-bw_debug_webview).

## Veritabanı ve migration'lar

Şema değişiklikleri `src/infrastructure/database/migrations/NNN_*.ts`
dosyalarındadır ve `MigrationManager` tarafından sırayla uygulanır (şu an 29
migration).

- Her migration kendi transaction'ında çalışır: yarıda patlarsa şema bir önceki
  sürümde kalır, veri bozulmaz.
- Diskteki şema uygulamanın bildiğinden yeniyse (eski sürüme dönüş) açılış
  durdurulur; tanımadığı şemanın üstüne yazılmaz.

Yeni migration eklemek için:

1. `src/infrastructure/database/migrations/0NN_aciklayici_ad.ts` dosyasını
   `BaseMigration`'dan türeterek oluştur.
2. `migrations/index.ts` listesine ekle (sıra önemlidir).
3. `tests/repository-schema-conformance.spec.ts` yeşil kalmalı.
4. Yayınlanmış bir migration'ı **asla değiştirme**; düzeltme için yeni migration yaz.

> **Dikkat:** `@capacitor-community/sqlite` çağrılarında `transaction` bayrağı
> varsayılan olarak `true`'dur. Dışarıda açık bir transaction varken bunu
> kapatmazsan web sessizce commit eder, Android ise hata verir — bu yüzden
> yazmalar daima Unit of Work üzerinden yapılmalıdır.

## Döviz kuru API'leri

Uygulamanın dışarıya çıktığı **tek** yer kur sağlayıcılarıdır. İkisi de ücretsizdir
ve **API anahtarı istemez** — bu yüzden repoda hiçbir kur secret'ı yoktur.

| Sağlayıcı | Endpoint | Kapsam | Güncelleme |
|---|---|---|---|
| **open.er-api.com** (birincil) | `https://open.er-api.com/v6/latest/{BASE}` | 160+ para birimi | günde ~1 kez |
| **frankfurter.app** (yedek) | `https://api.frankfurter.app/latest?from={BASE}` | ECB referans kurları (~30 para birimi) | ECB yayın günlerinde |

**Çağrı politikası** (`FinancialService`):

- Sağlayıcılar **sırayla** denenir; ilk başarılı yanıt kazanır, hepsi düşerse
  `AllProvidersFailedError` fırlatılır ve varsa bayat (`isStale: true`) cache döner.
- **Cache:** 30 dk. **Cooldown:** 5 dk (yalnızca manuel "Kurları yenile" için).
- Aynı baz kod için eşzamanlı istekler tek promise'e katlanır (in-flight dedup).
- Her isteğin 10 sn timeout'u vardır; iptal (`AbortSignal`) sağlayıcı hatası
  sayılmaz, sonraki sağlayıcıya geçilmez.

### Yeni bir sağlayıcı eklemek

1. `src/infrastructure/services/financial/providers/<ad>.provider.ts` dosyasını
   oluştur ve `IExchangeRateProvider`'ı uygula:

```ts
import { fetchJson, HttpStatusError, HttpTimeoutError } from '@/infrastructure/http'
import { ExchangeRateError, ExchangeRateTimeoutError, type ExchangeRateData } from '../types'
import type { IExchangeRateProvider } from './exchange-rate-provider.interface'

export class MyRatesProvider implements IExchangeRateProvider {
    readonly name = 'my-rates'
    private readonly baseUrl = 'https://api.example.com/latest'
    private readonly timeoutMs: number

    constructor(opts: { timeoutMs?: number } = {}) {
        this.timeoutMs = opts.timeoutMs ?? 10_000
    }

    /** İsteğe bağlı: tanımlanmazsa tüm baz kodlar destekleniyor sayılır. */
    supports(baseCode: string) {
        return ['USD', 'EUR', 'TRY'].includes(baseCode.toUpperCase())
    }

    async fetch(baseCode: string, signal?: AbortSignal): Promise<ExchangeRateData> {
        const url = `${this.baseUrl}?base=${encodeURIComponent(baseCode.toUpperCase())}`

        let data: { base: string; rates: Record<string, number>; updated: string }
        try {
            data = await fetchJson(url, { timeoutMs: this.timeoutMs, signal })
        } catch (err) {
            if (err instanceof HttpTimeoutError) throw new ExchangeRateTimeoutError(this.name, this.timeoutMs)
            if (err instanceof HttpStatusError) {
                throw new ExchangeRateError(`HTTP ${err.status}`, { provider: this.name, cause: err })
            }
            throw err // AbortError → servis katmanı ele alıyor
        }

        return {
            baseCode: data.base,
            conversionRates: { ...data.rates, [data.base]: 1 }, // baz kod 1 olmalı
            fetchedAt: new Date(data.updated),
            nextUpdateAt: null,
            provider: this.name,
        }
    }
}
```

2. `src/infrastructure/services/financial/index.ts` içinde servise tanıt. Sıra =
   öncelik sırasıdır:

```ts
export const financialService = new FinancialService({
    providers: [new MyRatesProvider(), new OpenErApiProvider(), new FrankfurterProvider()],
    logger: /* mevcut logger */,
})
```

3. `types.ts` içindeki `ExchangeRateProviderName` union'ına adını ekle.
4. `tests/exchange-rate-refresh.spec.ts` içine sahte sağlayıcıyla bir vaka ekle
   (başarı, hata → fallback, timeout).

**Uyarılar**

- `conversionRates` anahtarları daima **ISO 4217 kodu**, değerler ise
  `1 baz birim = X hedef birim` olmalıdır; baz kodun kendisi `1` olarak eklenir.
- Sağlayıcı katmanı **ham HTTP'ye erişmez**: her zaman `@/infrastructure/http`
  içindeki `fetchJson` kullanılmalı.
- API anahtarı gereken bir servis eklersen: `VITE_` önekli değişkenler bundle'a
  gömülür ve **herkese açıktır**. Ücretsiz/anahtarsız bir sağlayıcı tercih et.
- Sağlayıcının kullanım limitine ve lisansına uy (ECB verisi için kaynak
  belirtme yükümlülüğü gibi).

## Yedekleme formatı

Yedekler versiyonlu JSON'dur (`BACKUP_VERSION = 4`, `BACKUP_APP_ID = 'budget-watchdog'`).
İçe aktarma, foreign key bağımlılığına göre sabit bir tablo sırasıyla ve **tek
transaction'da** yapılır: bir satır bile patlarsa hiçbir şey değişmez. Eski
sürümler `migrateBackup()` ile yükseltilir; uygulamadan yeni bir sürümle
alınmış yedek reddedilir. Şema değiştiğinde **versiyonu artır ve migrasyon ekle**.

Kolon adları yedek dosyasından değil **şemadan** doğrulanır (`PRAGMA table_info`);
şema okunamazsa import sessizce tablo atlamak yerine hata verip geri alır.

### Şifreleme (v4)

**Yedekler varsayılan olarak şifrelidir.** Dosya üretildiği anda cihazın koruma
alanından çıkar (Drive, WhatsApp, e-posta…); veritabanını şifreleyip yedeği düz
bırakmak o korumayı geçersiz kılardı.

| Katman | Seçim |
|---|---|
| Anahtar türetme | PBKDF2-HMAC-SHA256, 600.000 tur, 16 baytlık rastgele salt |
| Şifreleme | AES-256-GCM, 12 baytlık rastgele IV (her export'ta yeni) |
| Şifrelenen | `meta` + `data` |
| Düz kalan | `app`, `version`, `exportedAt`, `encrypted`, KDF/IV parametreleri |

Zarf bilinçli olarak düz bırakılır: import "bozuk dosya" yerine "bu yedek şifreli,
parolayı gir" diyebilsin diye. Çözme parametreleri zarftan okunur, böylece tur
sayısı ileride artsa da eski yedekler açılmaya devam eder.

Parola uygulama PIN'inden **türetilmez** — 4 hane çevrimdışı saldırıya karşı
değersizdir. Parola en az 8 karakterdir ve **unutulursa yedek kurtarılamaz**.

Testler: `tests/backup-crypto.spec.ts`, `tests/backup-encryption.spec.ts`.

> AES-GCM'in saf-JS fallback'i **yoktur**. Native'de `capacitor://localhost` güvenli
> bağlamdır; yalnızca dev sunucusunu http üzerinden LAN IP'siyle açarsan şifreli
> yedek devre dışı kalır ve net bir hata verir.

## Testler

**Birim testleri (Vitest)** — `tests/*.spec.ts`: para aritmetiği, bütçe dönemleri,
çapraz kur transferi, repository / transaction sınırı / şema uyumu, use case'ler,
yedekleme.

```bash
npm run test:unit -- --run
```

**E2E (Cypress)** — `tests/e2e/specs/*.cy.ts`. Derlenmiş `dist/`i **8821**
portunda serve eder; önce build almalısın. İlk çalıştırmada Cypress binary'si
indirilir (internet gerekir).

```bash
npm run build && npm run test:e2e
```

## Çoklu dil

Diller: **Türkçe (tr)**, **İngilizce (en)**, **Almanca (de)** — `src/locales/*.json`.
Doğrulama mesajları da yerelleştirilmiştir (`src/plugins/yup-locale.ts`). Varsayılan
kategoriler i18n anahtarlarıyla saklanır (migration 014), böylece dil değişince
kategori adları da değişir.

Yeni dil eklerken: `src/locales/<kod>.json` oluştur, `src/i18n` içindeki listeye ekle
ve `Language` value object'ini güncelle.

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Web'de veritabanı açılmıyor | Uygulamayı `npm run dev` ile aç; `dist/index.html`'i doğrudan `file://` ile açma |
| Açılışta init hatası | Açılış 3 kez dener, sonra arka planda 5 kez daha; kalıcıysa kurtarma ekranı açılır. Ayrıntı için `VITE_LOG_CONSOLE=on` ve `VITE_DB_LOG=on` |
| Kurlar güncellenmiyor | 5 dk cooldown ve 30 dk cache vardır; sağlayıcılar düşmüşse `AllProvidersFailedError` loglanır |
| Android'de transaction hatası | Yazmaları Unit of Work üzerinden yap (bkz. [migration notu](#veritabanı-ve-migrationlar)) |
| E2E "connection refused" | Önce `npm run build` |
