# Gizlilik Politikası — Budget Watchdog

[Türkçe](#türkçe) · [English](#english)

# Türkçe

**Son güncelleme / yürürlük tarihi:** 1 Ekim 2026  
**Geliştirici ve geri bildirim kapsamındaki veri sorumlusu:** Atakan Şentürk  
**İletişim:** atkansenturk@gmail.com

## 1. Kapsam ve yerel veriler

Budget Watchdog kişisel bütçe ve harcama takibi için geliştirilmiştir. Uygulama hesabı açman gerekmez. Hesaplar, bakiyeler, gelir/gider/transfer kayıtları, notlar, bütçeler, birikim hedefleri, kategoriler ve uygulama ayarları cihazında saklanır. Geliştirici bu finansal kayıtları otomatik olarak toplamaz, kendi sunucusuna göndermez ve bunlara uzaktan erişmez.

Temel finansal işlemler internet olmadan çalışır. Döviz kuru bağlantıları, kendi seçtiğin dosya paylaşımları ve gönderdiğin geri bildirim e-postaları aşağıdaki istisnalardır.

## 2. Güvenlik ve yerel teknik kayıtlar

Android uygulamasının finansal veritabanı SQLCipher ile şifrelenir. Veritabanı anahtarı Android Keystore destekli şifreli depolamada korunur. Bu açıklama her cihazda donanım destekli güvenliğin mevcut olduğu veya tüm uygulama ayarlarının aynı veritabanı şifrelemesiyle korunduğu anlamına gelmez.

Tarayıcı sürümünün yerel veritabanı aynı SQLCipher şifreleme korumasını kullanmaz. Tarayıcı verilerini temizlemek yerel kayıtlarını silebilir.

PIN'in kendisi yerine yerel bir kriptografik özeti saklanır. Biyometrik doğrulamayı işletim sistemi gerçekleştirir; uygulama parmak izi veya yüz şablonlarına erişmez.

Teknik hata ve tanılama kayıtları cihazda tutulabilir. Bunlar otomatik olarak geliştiriciye veya bir hata raporlama hizmetine gönderilmez. Uygulamada reklam, kullanım analitiği ve takip kodu bulunmaz.

## 3. İnternet ve döviz kuru sağlayıcıları

Kurlar aşağıdaki hizmetlerden alınır:

| Hizmet | İstek adresi |
|---|---|
| ExchangeRate-API (Open Access) | `https://open.er-api.com/v6/latest` |
| Frankfurter | `https://api.frankfurter.app/latest` |

Güncelleme elle, uygulama açılırken veya uygulama yeniden öne geldiğinde otomatik yapılabilir. İsteklerde temel para birimi kodu (ör. `TRY`) kullanılır. Hesap adları, bakiyeler, işlemler, bütçeler ve notlar bu isteklere eklenmez.

Sağlayıcılar IP adresini ve bağlantının gerektirdiği teknik bilgileri görebilir. Bu hizmetlerin kendi gizlilik politikaları geçerlidir; veriler hizmetin kullandığı altyapıya göre yurt dışında da işlenebilir. Geliştirici sağlayıcıların günlük saklama uygulamalarını yönetmez. İnternet yoksa mevcut kurlar kullanılabilir; henüz alınmamış kurlar için güncel kur bilgisi bulunmayabilir.

## 4. Yedekleme, dışa aktarma ve paylaşım

**Yedek Oluştur** varsayılan olarak senin belirlediğin parolayla şifreli dosya üretir. Android'de dosya cihaz depolamasına kaydedilir; tarayıcıda indirilir. Geliştirici yedek parolanı bilmez ve sıfırlayamaz.

**Şifresiz yedek** ve **Verilerimi İndir** okunabilir JSON üretir ve ayrıca onay ister. Android'de şifresiz dosya geçici özel depolamadan paylaşılır; paylaşılmazsa kalıcı bir yedek olarak saklanacağına güvenmemelisin. Tarayıcıda dosya indirilir.

Başka uygulamalara, e-posta veya bulut depolama hizmetlerine paylaşmayı sen seçersin. Paylaştığın dosya finansal kayıtlarını içerir; şifresiz dosyayı alan kişi içeriğini okuyabilir. Dosya cihaz dışına çıkabilir ve alıcı hizmetin gizlilik koşulları uygulanır. Uygulama bu harici kopyaları yönetmez veya silemez.

Android otomatik uygulama yedeklemesi bu uygulama için kapalıdır. Bu ayar, senin ayrıca paylaştığın dosyaların veya cihazındaki diğer hizmetlerin oluşturabileceği kopyaların silindiği anlamına gelmez.

## 5. Bildirimler ve izinler

Bütçe uyarıları ve hatırlatmalar cihazında yerel olarak oluşturulur; geliştiricinin sunucusundan gönderilmez. Cihazının bildirim ayarlarına bağlı olarak içerik kilit ekranında görülebilir.

Uygulama internet iznini kur güncellemeleri, bildirim ve zamanlama izinlerini yerel uyarılar, biyometrik iznini isteğe bağlı uygulama kilidi için kullanır. Kullanılabilir izinler işletim sistemi ve sürümüne göre değişebilir.

## 6. İsteğe bağlı geri bildirim

Geri bildirim ekranı e-posta uygulamanda bir taslak açar; e-postayı otomatik göndermez. Göndermeyi seçersen geliştirici gönderici e-posta adresini, mesajını, geri bildirim türünü, değerlendirme puanını, uygulama sürümünü ve platform bilgisini alır. Mesaja eklediğin kişisel veya finansal bilgiler de e-postanın parçasıdır; gereksiz hassas bilgi eklememelisin.

Bu bilgiler talebini değerlendirmek, sorunları incelemek ve yanıtlamak için kullanılır. Bu işleme, temel hak ve özgürlüklerine zarar vermemek kaydıyla geliştiricinin destek sunmaya ilişkin meşru menfaatine (KVKK madde 5/2-f) dayanır. Uygulanabilir bir yasal yükümlülük varsa ilgili kayıtlar bu yükümlülüğün yerine getirilmesi için de işlenebilir (madde 5/2-ç).

E-postalar gönderici ve alıcı e-posta hizmetlerinde de işlenir; kullanılan altyapıya göre yurt dışında saklanabilir. Bu hizmetlerin kendi gizlilik koşulları geçerlidir. Yazışmalar talebin takibi ve yanıtlanması için gerekli süreyle; uygulanabilir yasal saklama yükümlülüğü varsa onun gerektirdiği süreyle sınırlı tutulur. Silme ve diğer veri talepleri için geliştiriciyle iletişime geçebilirsin.

## 7. Silme, geri yükleme ve haklar

Yerel kayıtlar sen silene kadar cihazında tutulur. **Verilerimi İndir** uygulamadaki kayıtların şifresiz JSON kopyasını dışa aktarır. **Verilerimi Sil** veya **Uygulamayı Sıfırla** uygulama içindeki kayıtları ve ayarları siler.

Bu işlemler daha önce dışa aktardığın yedekleri, paylaştığın dosyaları, e-postaları veya başka hizmetlerdeki kopyaları silmez. Bunları ilgili konum veya hizmetten ayrıca silmelisin. Uygulamayı kaldırmak da harici kopyaların silinmesini sağlamaz.

Kullanılabilir bir yedeğin yoksa silinen veya kaybolan finansal kayıtlarını geliştirici geri getiremez. Bir yedekten geri yükleme mümkündür; şifreli yedeğin parolası gerekir.

Geliştiricinin geri bildirim kapsamında işlediği kişisel veriler için, uygulanabildiği ölçüde KVKK madde 11 uyarınca işleme hakkında bilgi, işleme amacı ve alıcılar, düzeltme, silme veya yok etme, ilgili işlemlerin alıcılara bildirilmesi, otomatik analiz sonucuna itiraz ve hukuka aykırı işlemden doğan zararların giderilmesi taleplerini **atkansenturk@gmail.com** adresine iletebilirsin. Uygulamadaki dışa aktarma ve silme araçları tüm hukuki hakların yerine geçmez.

## 8. Kullanım ve değişiklikler

Uygulama finansal veya yatırım tavsiyesi vermez. Önemli kararlar öncesinde hesaplamaları ve döviz kurlarını doğrula; düzenli yedek al. Çocuklara yönelik bir hizmet değildir.

Bu metin, yürürlükteki mevzuattan doğan haklarını veya geliştiricinin zorunlu yükümlülüklerini sınırlamaz. Gizlilik politikasının içeriği değiştiğinde bu sayfa ve uygulamadaki güncelleme tarihi yenilenir.

---

# English

**Last updated / effective date:** October 1, 2026  
**Developer and controller for feedback data:** Atakan Şentürk  
**Contact:** atkansenturk@gmail.com

## 1. Scope and local data

Budget Watchdog is a personal budget and spending tracker. No app account is required. Accounts, balances, income/expense/transfer records, notes, budgets, saving goals, categories and app settings are stored on your device. The developer does not automatically collect these financial records, send them to a developer server or access them remotely.

Core financial features work without internet access. Exchange rate connections, file sharing you choose and feedback emails you send are the exceptions described below.

## 2. Security and local technical logs

The Android app's financial database is encrypted with SQLCipher. Its key is protected by encrypted storage backed by Android Keystore. This does not mean every device provides hardware-backed protection or all app settings use the same database encryption.

The browser version's local database does not use the same SQLCipher encryption protection. Clearing browser storage may delete local records.

A cryptographic hash of the PIN is stored locally rather than the PIN itself. The operating system performs biometric authentication; the app does not access fingerprint or face templates.

Technical error and diagnostic logs may be stored on the device. They are not automatically sent to the developer or a crash-reporting service. The app contains no advertising, usage analytics or tracking code.

## 3. Internet and exchange rate providers

Rates are retrieved from these services:

| Service | Request address |
|---|---|
| ExchangeRate-API (Open Access) | `https://open.er-api.com/v6/latest` |
| Frankfurter | `https://api.frankfurter.app/latest` |

Updates may run manually or automatically on launch and when the app returns to the foreground. Requests use a base currency code, such as `USD`. Account names, balances, transactions, budgets and notes are not included.

Providers may see your IP address and technical information needed for the connection. Their own privacy policies apply; processing may occur abroad depending on their infrastructure. The developer does not manage their log retention practices. Existing rates can be used offline; current rates may be unavailable for currencies not previously retrieved.

## 4. Backups, export and sharing

**Create Backup** produces a file encrypted with a password you choose by default. On Android the file is saved to device storage; in the browser it is downloaded. The developer does not know or reset your backup password.

**Unencrypted backup** and **Download My Data** produce readable JSON and require additional confirmation. On Android an unencrypted file is shared from temporary private storage; do not rely on it as a permanent backup if you do not share it. In the browser the file is downloaded.

You choose whether to share with other apps, email or cloud storage services. Shared files contain your financial records; anyone who receives an unencrypted file can read it. Files may leave your device and the receiving service's privacy terms apply. The app cannot manage or delete these external copies.

Android automatic app backup is disabled for this app. This setting does not delete files you share separately or copies other services on your device may create.

## 5. Notifications and permissions

Budget alerts and reminders are created locally on your device and are not sent from a developer server. Their contents may appear on the lock screen depending on device notification settings.

The app uses internet permission for exchange rate updates, notification and scheduling permissions for local alerts, and biometric permission for optional app locking. Available permissions may vary by operating system and version.

## 6. Optional feedback

The feedback screen opens a draft in your email app and does not send it automatically. If you send it, the developer receives your sender email address, message, feedback type, rating, app version and platform information. Personal or financial details you add become part of that email; avoid unnecessary sensitive information.

This information is used to assess requests, investigate issues and respond. Processing relies on the developer's legitimate interest in providing support, provided your fundamental rights and freedoms are not adversely affected (Turkish Personal Data Protection Law, article 5/2-f). Where an applicable legal obligation exists, relevant records may also be processed to comply with it (article 5/2-ç).

Emails are also processed by the sender's and recipient's email services and may be stored abroad depending on their infrastructure. Their privacy terms apply. Correspondence is retained only as needed to follow up and respond, or for a period required by applicable legal retention obligations. Contact the developer for deletion and other data requests.

## 7. Deletion, recovery and your rights

Local records remain on your device until you delete them. **Download My Data** exports an unencrypted JSON copy of app records. **Delete My Data** or **Reset App** deletes records and settings within the app.

These actions do not delete previously exported backups, shared files, emails or copies held by other services. Delete those separately at the relevant location or service. Uninstalling the app does not remove external copies either.

Without a usable backup, the developer cannot recover deleted or lost financial records. Restoration from a backup is possible; encrypted backups require their password.

For personal data processed by the developer through feedback, you may contact **atkansenturk@gmail.com** to exercise applicable rights, including information about processing, purposes and recipients, correction, deletion or destruction, notification of relevant actions to recipients, objection to automated analysis results and remedies for harm caused by unlawful processing under article 11 of the Turkish Personal Data Protection Law. The app's export and deletion tools do not replace all legal rights.

## 8. Use and changes

The app does not provide financial or investment advice. Verify calculations and exchange rates before important decisions and make regular backups. The service is not directed at children.

This policy does not limit statutory rights or the developer's mandatory obligations. When its content changes, this page and the policy update date shown in the app will be updated.
