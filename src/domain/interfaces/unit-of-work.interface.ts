/**
 * Unit of Work — birden fazla aggregate'e yazan bir iş birimini tek bir
 * atomik sınıra alır.
 *
 * Neden gerekli: SQLite varsayılan olarak autocommit modundadır; her
 * `run()`/`execute()` çağrısı kendi transaction'ında commit olur. Bir use-case
 * içinde işlem + hesap(lar) + bütçe(ler) ayrı ayrı kaydedildiğinde araya giren
 * bir hata **kısmi durumu kalıcı** bırakır (para kaynaktan düşmüş ama hedefe
 * girmemiş gibi). `run()` bu yazmaları tek BEGIN/COMMIT arasına alır.
 */
export interface IUnitOfWork {
    /**
     * `work`'ü tek bir transaction sınırı içinde çalıştırır.
     *
     * Başarılıysa commit edilir, herhangi bir hata fırlarsa tümü rollback edilip
     * hata yeniden fırlatılır. Aynı anda gelen bağımsız çağrılar sıraya alınır.
     */
    run<T>(work: () => Promise<T>): Promise<T>;

    /**
     * Birden fazla sorgudan oluşan okumayı, bekleyen yazmaların ardından
     * bölünmez bir birim olarak çalıştırır: araya yazma giremez, dolayısıyla
     * sorgular birbiriyle tutarlı bir durumu görür.
     *
     * `run()`'dan farkı transaction AÇMAMASIDIR — salt okuma için yazma kilidi
     * tutmak bütün yazmaları gereksizce bekletiyordu. Eski/test adapter'ları
     * için opsiyoneldir; uygulamanın SQLite implementasyonu bunu sağlar.
     */
    read?<T>(work: () => Promise<T>): Promise<T>;

    /**
     * Yalnızca zaten açık olan `run()` callback'i içinden kullanılmalıdır.
     * Bu açık API, bağımsız bir çağrının yanlışlıkla iç içe sayılmasını önler.
     */
    runNested?<T>(work: () => Promise<T>): Promise<T>;
}
