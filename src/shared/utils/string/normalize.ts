/**
 * Kategori adı karşılaştırma anahtarı.
 *
 * Create/update use-case'lerindeki benzersizlik kuralı ile yedek
 * birleştirmedeki (BackupService merge) eşleme aynı normalizasyonu kullanmak
 * zorunda: aksi halde uygulamanın "aynı" saydığı iki kategoriyi merge farklı
 * sayar ve kopyasını oluşturur.
 */
export const normalizeCategoryName = (value: string): string =>
    value.normalize('NFKC').trim().toLocaleLowerCase('tr-TR');
