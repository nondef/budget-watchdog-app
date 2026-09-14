# Gizlilik Politikası — Budget Watchdog

[Türkçe](#türkçe) · [English](#english)

---

# Türkçe

**Yürürlük tarihi:** 11 Eylül 2026
**Geliştirici:** Atakan Şentürk
**İletişim:** atkansenturk@gmail.com

## Özet

Budget Watchdog, verilerini **yalnızca senin telefonunda** saklayan bir kişisel
bütçe uygulamasıdır. Hesap açman gerekmez; sunucumuz yoktur; kişisel veya
finansal bilgilerini toplamayız, görmeyiz, satmayız ve kimseyle paylaşmayız.

## 1. Telefonunda saklanan veriler

Uygulamaya girdiğin bilgiler yalnızca telefonundaki veritabanında tutulur:

- Hesaplar, bakiyeler ve para birimleri
- Gelir, gider ve transfer işlemleri, notlar
- Bütçeler, birikim hedefleri ve kategoriler
- Uygulama ayarları (tema, dil, bildirim tercihleri)

Bu veritabanı **şifrelidir**. Şifreleme anahtarı telefonun güvenli donanımında
(Android Keystore) saklanır ve telefondan dışarı çıkmaz.

**PIN kilidi:** PIN'in kendisi saklanmaz; yalnızca geri çevrilemeyen bir özeti
(hash) telefonda tutulur.

**Biyometrik kilit:** Parmak izi ve yüz tanıma tamamen Android sistemi tarafından
yapılır. Uygulama biyometrik verine erişmez; sadece "doğrulandı / doğrulanmadı"
sonucunu alır.

## 2. Toplamadığımız veriler

Uygulama şunları **toplamaz**: ad, e-posta, telefon numarası, konum, rehber,
fotoğraflar, reklam kimliği, kullanım istatistikleri (analitik) veya hata
raporları. Uygulamada reklam ve takip kodu yoktur.

## 3. İnternet kullanımı

Uygulama interneti **yalnızca döviz kurlarını güncellemek** için kullanır. Kurlar
şu ücretsiz servislerden alınır:

| Servis | Adres |
|---|---|
| ExchangeRate-API (Open Access) | `open.er-api.com` |
| Frankfurter | `api.frankfurter.app` |

Bu isteklerde gönderilen tek bilgi seçtiğin **temel para biriminin kodudur**
(ör. `TRY`). Hesapların, işlemlerin veya başka bir finansal bilgin
**gönderilmez**. Her internet isteğinde olduğu gibi bu servisler telefonunun IP
adresini görebilir; bu durum ilgili servislerin kendi gizlilik politikalarına
tabidir.

İnternet bağlantısı yoksa uygulama son bilinen kurlarla çalışmaya devam eder.

## 4. Yedekler ve dışa aktarma

- **Yedek Oluştur** (Ayarlar → Yedekleme): Verilerinin bir kopyasını telefonunda
  bir dosya olarak oluşturur. Yedek dosyası varsayılan olarak **senin belirlediğin
  parolayla şifrelenir**. Parolayı biz bilmeyiz; unutursan yedek açılamaz.
- **Verilerimi İndir** (Ayarlar → Kişisel Veri & Gizlilik): Verilerini
  **şifresiz** bir JSON dosyası olarak dışa aktarır. Bu dosyayı güvenli bir yerde
  sakla.

Bu dosyaları nereye kaydedeceğine veya kiminle paylaşacağına (Google Drive,
e-posta vb.) **sen karar verirsin**. Paylaştığın servis, kendi gizlilik
politikasına tabidir.

Android'in otomatik Google yedeklemesi bu uygulama için **bilerek kapalıdır**;
verilerin Google sunucularına kopyalanmaz.

## 5. Bildirimler

Bütçe uyarıları gibi bildirimler **telefonunda yerel olarak** oluşturulur. Hiçbir
sunucu üzerinden gönderilmez.

## 6. Geri bildirim

Uygulamadaki geri bildirim ekranı, telefonundaki e-posta uygulamasını açar. Yalnızca
**senin göndermeyi seçtiğin** e-postayı ve e-posta adresini alırız. Bu bilgileri
sadece sana cevap vermek için kullanırız; talep etmen hâlinde sileriz.

## 7. İzinler

| İzin | Neden |
|---|---|
| İnternet | Döviz kurlarını güncellemek |
| Bildirim gönderme | Bütçe uyarıları ve hatırlatmalar |
| Biyometrik / parmak izi | Uygulama kilidini parmak izi veya yüzle açmak (isteğe bağlı) |
| Açılışta çalışma | Telefon yeniden başlatıldığında planlı bildirimleri yeniden kurmak |
| Titreşim | Dokunma geri bildirimi |
| Uyanık tutma | Planlı bildirimlerin zamanında gösterilmesi |

## 8. Verilerini silme ve haklarınız

Verilerin yalnızca telefonunda olduğu için onlar üzerinde tam kontrol sendedir.
KVKK ve GDPR kapsamındaki erişim ve silme haklarını doğrudan uygulamadan
kullanabilirsin:

- **Erişim / taşıma:** Ayarlar → Kişisel Veri & Gizlilik → **Verilerimi İndir**
- **Silme:** Ayarlar → Kişisel Veri & Gizlilik → **Verilerimi Sil**, ya da
  uygulamayı telefondan kaldır.

⚠️ Silinen veriler **geri getirilemez**. Sunucumuz olmadığı için bizde de bir
kopyası yoktur.

## 9. Çocuklar

Uygulama çocuklara yönelik değildir ve bilerek çocuklardan veri toplamaz.

## 10. Değişiklikler

Bu politika değişirse güncel hâli bu sayfada yayınlanır ve üstteki yürürlük
tarihi güncellenir.

## 11. İletişim

Sorularınız için: **atkansenturk@gmail.com**

---

# English

**Effective date:** September 11, 2026
**Developer:** Atakan Şentürk
**Contact:** atkansenturk@gmail.com

## Summary

Budget Watchdog is a personal budgeting app that stores your data **only on your
phone**. No account is required and there is no server. We do not collect, see,
sell or share your personal or financial information.

## 1. Data stored on your phone

Everything you enter is kept only in a database on your phone:

- Accounts, balances and currencies
- Income, expense and transfer transactions, notes
- Budgets, saving goals and categories
- App settings (theme, language, notification preferences)

This database is **encrypted**. The encryption key is kept in the phone's secure
hardware (Android Keystore) and never leaves the device.

**PIN lock:** Your PIN itself is not stored; only a one-way hash is kept on the
phone.

**Biometric lock:** Fingerprint and face recognition are handled entirely by
Android. The app never accesses your biometric data; it only receives a
"verified / not verified" result.

## 2. Data we do not collect

The app does **not** collect: name, email, phone number, location, contacts,
photos, advertising ID, usage analytics or crash reports. There are no ads and no
tracking code.

## 3. Internet use

The app uses the internet **only to refresh exchange rates**, from these free
services:

| Service | Address |
|---|---|
| ExchangeRate-API (Open Access) | `open.er-api.com` |
| Frankfurter | `api.frankfurter.app` |

The only information sent is your selected **base currency code** (e.g. `USD`).
Your accounts, transactions or any other financial data are **never sent**. As
with any internet request, these services can see your phone's IP address; this
is governed by their own privacy policies.

Without a connection, the app keeps working with the last known rates.

## 4. Backups and export

- **Create Backup** (Settings → Backup): Creates a copy of your data as a file on
  your phone. Backups are **encrypted with a password you choose** by default. We
  never know this password; if you forget it, the backup cannot be opened.
- **Download My Data** (Settings → Personal Data & Privacy): Exports your data as
  an **unencrypted** JSON file. Keep this file somewhere safe.

**You decide** where these files are saved or shared (Google Drive, email, etc.).
Any service you share them with is governed by its own privacy policy.

Android's automatic Google backup is **intentionally disabled** for this app;
your data is not copied to Google's servers.

## 5. Notifications

Notifications such as budget alerts are created **locally on your phone** and
are never sent through a server.

## 6. Feedback

The feedback screen opens your phone's email app. We only receive the email and
email address **you choose to send**. We use it solely to reply to you and will
delete it on request.

## 7. Permissions

| Permission | Why |
|---|---|
| Internet | Refresh exchange rates |
| Post notifications | Budget alerts and reminders |
| Biometric / fingerprint | Unlock the app with fingerprint or face (optional) |
| Run at startup | Re-schedule planned notifications after the phone restarts |
| Vibrate | Haptic feedback |
| Wake lock | Deliver scheduled notifications on time |

## 8. Deleting your data and your rights

Because your data lives only on your phone, you are in full control. You can
exercise your access and deletion rights (GDPR and similar laws) directly in the
app:

- **Access / portability:** Settings → Personal Data & Privacy → **Download My Data**
- **Deletion:** Settings → Personal Data & Privacy → **Delete My Data**, or
  uninstall the app.

⚠️ Deleted data **cannot be recovered**. Since there is no server, we do not have
a copy either.

## 9. Children

The app is not directed at children and does not knowingly collect data from
children.

## 10. Changes

If this policy changes, the updated version will be published on this page and
the effective date above will be updated.

## 11. Contact

Questions: **atkansenturk@gmail.com**
