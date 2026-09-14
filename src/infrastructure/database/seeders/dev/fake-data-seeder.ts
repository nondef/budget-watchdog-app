import { BaseSeeder } from "@/infrastructure/database/seeders/base-seeder";
import { v6 as uuidv6 } from "uuid";
import { DatabaseAdapter } from "@/domain";
import { logger } from "@/infrastructure/logging";
import { ACCOUNT_TYPES, AccountType, MAX_ACCOUNT_COUNT } from "@/domain/entities/account";
import { WALLET_ICONS } from "@/shared/constants/wallet-options";
import { COLOR_PALETTE } from "@/shared/constants/color-palette";
import { translateCategoryName } from "@/composables/features/useCategoryName";
import { DEFAULT_LOCALE, isSupportedLocale, i18n, SupportedLocale } from "@/i18n";
// Yalnızca tip: derlemede silinir, prod bundle'a faker girmez (üretim yolu
// `seed()` içindeki dinamik import).
import type { Faker } from "@faker-js/faker";

const CTX = 'seeder';

const TRANSACTION_COUNT = 5000;
/** Domain sınırı 50 (MAX_ACCOUNT_COUNT); kalan slota göre ayrıca kırpılır. */
const ACCOUNT_COUNT = 8;
const SAVING_GOAL_COUNT = 3;
/** Bir yılı aşar: aylık/haftalık/yıllık bütçelerin hepsinin verisi olsun. */
const DAYS_BACK = 365;
/** Baz para birimi seçilmemişse kullanılacak varsayılan. */
const FALLBACK_CURRENCY_CODE = 'TRY';

/**
 * Baz para biriminin yanına eklenecek para birimleri. Hesaplar bunlar arasında
 * sırayla dağıtılır; çok para birimli toplam, kur çevrimi ve para birimi başına
 * gruplama yolları ancak böyle denenebiliyor.
 */
const EXTRA_CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'JPY'];

/**
 * TRY cinsinden yazılmış taban aralıkların para birimi başına kaba çarpanı.
 *
 * GERÇEK KUR DEĞİL, yalnızca büyüklük mertebesi: 3.000 birimlik bir gider
 * TRY'de makul, USD'de değil. Kur çevrimini uygulama `exchange_rates`
 * üzerinden yapıyor; buradaki tek amaç rakamların inandırıcı görünmesi.
 * Bilinmeyen para birimi 1 kabul edilir.
 */
const MAGNITUDE_BY_CODE: Record<string, number> = {
    TRY: 1, USD: 0.025, EUR: 0.023, GBP: 0.02, JPY: 3.8,
};

/**
 * Bütçe dönem tipleri. Hepsi 'monthly' olduğunda bütçe ekranı yalnızca içinde
 * bulunulan ayı gösteriyordu; 'yearly' ve 'once' çok aylık toplamları,
 * 'weekly' ise dar dönemi kapsıyor.
 */
const BUDGET_TYPES = ['monthly', 'weekly', 'yearly', 'once'] as const;

/** `Budget.MAX_DAILY_SPENT_DAYS` ile aynı: entity yalnızca son 31 günü tutuyor. */
const MAX_DAILY_SPENT_DAYS = 31;

/**
 * Üretilen her satırın id'si bu önekle başlar.
 *
 * Fake verinin işareti verinin KENDİSİ: ayrı bir bayrak kolonu, marker tablosu
 * ya da localStorage anahtarı yok. Böylece "fake veri zaten var mı" sorusu
 * DB'ye tek `LIKE` ile sorulabiliyor ve temizlik de aynı kesinlikte oluyor —
 * hiçbir yerde "kullanıcının verisi hangisiydi" tahmini yapılmıyor.
 *
 * `_` ve `%` LIKE joker karakterleri; önekte ikisi de yok.
 */
const FAKE_ID_PREFIX = 'bwfake-';

/**
 * Birikim hedefi adları. Kategori adlarının aksine bunların uygulama
 * sözlüğünde karşılığı yok; yalnızca dev verisi olduğu için çeviri dosyalarını
 * şişirmek yerine burada tutuluyor.
 */
const SAVING_GOAL_NAMES: Record<SupportedLocale, string[]> = {
    tr: ['Tatil', 'Yeni araba', 'Acil durum fonu', 'Ev peşinatı', 'Yeni bilgisayar', 'Düğün'],
    en: ['Vacation', 'New car', 'Emergency fund', 'House deposit', 'New laptop', 'Wedding'],
    de: ['Urlaub', 'Neues Auto', 'Notgroschen', 'Anzahlung Haus', 'Neuer Laptop', 'Hochzeit'],
};

/** Hesap adı eki: `<şirket> Nakit` / `<şirket> Hesabı`. Aynı gerekçeyle burada. */
const ACCOUNT_SUFFIXES: Record<SupportedLocale, { cash: string; other: string }> = {
    tr: { cash: 'Nakit', other: 'Hesabı' },
    en: { cash: 'Cash', other: 'Account' },
    de: { cash: 'Bargeld', other: 'Konto' },
};

/** 'seed' → yoksa ekle, 'reset' → mevcut fake veriyi atıp yeniden üret. */
export type FakeDataMode = 'seed' | 'reset';

/**
 * Yeniden üretim açılış başına bir kez. `SeederManager.runAll()` soğuk açılışta
 * iki kez koşuyor (temiz kurulumda MigrationManager, sonra main.ts) ve reset
 * modu ikinci turda az önce ürettiğini atıp baştan üretirdi.
 */
let hasResetThisSession = false;

interface SeedRow {
    [column: string]: any;
}

/**
 * Sadece geliştirme ortamında çalışan sahte veri üreticisi (Laravel Faker benzeri).
 * SeederManager yalnızca dev'de ve mod 'off' değilken kaydeder.
 *
 * Üretim EKLEMELİDİR: kendi hesaplarını yaratır ve işlemlerini, bütçelerini,
 * hedeflerini yalnızca onlara bağlar. Kullanıcının mevcut cüzdanı, işlemleri,
 * bütçeleri ve hedefleri olduğu gibi kalır — kurulu bir uygulamada da
 * çalışmasının sebebi bu.
 */
export class FakeDataSeeder extends BaseSeeder {
    constructor(private readonly mode: FakeDataMode = 'seed') {
        super('transactions', 'fake-data');
    }

    private get shouldReset(): boolean {
        return this.mode === 'reset' && !hasResetThisSession;
    }

    /**
     * Ölçüt "DB boş mu" DEĞİL, "fake veri zaten duruyor mu".
     *
     * Eskiden `accounts > 0` sorulduğu için seeder yalnızca bomboş veritabanında
     * çalışıyordu; onboarding'i bir kez tamamlamış her kurulumda ilk cüzdan
     * zaten bir hesap demek olduğundan sessizce atlanıyordu.
     */
    protected async isAlreadySeeded(db: DatabaseAdapter): Promise<boolean> {
        if (this.shouldReset) {
            return false;
        }

        const result = await db.query(
            `SELECT COUNT(*) as count FROM accounts WHERE id LIKE ?`,
            [`${FAKE_ID_PREFIX}%`]
        );

        return result.rows[0]?.count > 0;
    }

    protected async seed(db: DatabaseAdapter): Promise<number> {
        // Prod bundle'a girmemesi için dinamik import
        const { fakerTR, fakerEN, fakerDE } = await import('@faker-js/faker');

        if (this.shouldReset) {
            await this.removeFakeData(db);
            hasResetThisSession = true;
        }

        const settings = await this.readSettings(db);
        const locale = settings.locale;
        const faker = { tr: fakerTR, en: fakerEN, de: fakerDE }[locale];

        const currencies = await this.resolveCurrencies(db, settings.baseCurrencyId);
        if (!currencies.length) {
            logger.warn('Para birimi bulunamadı, fake seed atlanıyor', { context: CTX });
            return 0
        }

        // Baz para birimi her zaman ilk sırada (bkz. resolveCurrencies): ayar
        // satırı yazmak gerekirse bu kullanılır.
        const baseCurrency = currencies[0];

        const categories = await db.query(`SELECT id, name, type FROM categories`);
        const expenseCategories = categories.rows.filter(c => c.type === 'expense');
        const incomeCategories = categories.rows.filter(c => c.type === 'income');
        if (!expenseCategories.length || !incomeCategories.length) {
            logger.warn('Kategoriler bulunamadı, fake seed atlanıyor', { context: CTX });
            return 0
        }

        // Kullanıcının hesapları da limite sayılır: üstüne çıkarsak
        // `CreateAccountUseCase` bundan sonra hiç hesap eklettirmez.
        const accountCount = await this.availableAccountSlots(db);
        if (accountCount === 0) {
            logger.warn('Hesap limiti dolu, fake seed atlanıyor', {
                context: CTX,
                data: { limit: MAX_ACCOUNT_COUNT },
            });
            return 0
        }

        const now = new Date();
        const nowIso = now.toISOString();

        const suffix = ACCOUNT_SUFFIXES[locale];

        // Para birimleri hesaplara sırayla dağıtılır; ilk hesap her zaman baz
        // para biriminde kalır ki kur çekilemese bile toplam anlamlı olsun.
        const accounts = Array.from({ length: accountCount }, (_, i) => {
            const currency = currencies[i % currencies.length];

            return {
                id: `${FAKE_ID_PREFIX}acc-${i}`,
                currency_id: currency.id,
                // Satırın ölçeği para biriminin ölçeğiyle aynı olmalı; kolonun
                // varsayılanı (2) JPY gibi 0 haneli birimlerde Money'nin
                // "conflicting scales" guard'ına takılıyordu.
                minor_unit: currency.minorUnit,
                name: `${faker.company.name()} ${i === 0 ? suffix.cash : suffix.other}`,
                type: ACCOUNT_TYPES[i % ACCOUNT_TYPES.length] as AccountType,
                balance: scaleAmount(faker.number.int({ min: 20_000, max: 80_000 }), currency),
                color: faker.helpers.arrayElement(COLOR_PALETTE),
                icon: faker.helpers.arrayElement(WALLET_ICONS),
                notes: null as string | null,
                is_active: 1,
                created_at: nowIso,
                updated_at: nowIso,
                /** Yalnızca üretim sırasında kullanılır, INSERT'ten önce çıkarılır. */
                currency,
            };
        });

        // `account` yalnızca üretilen hesaplardan seçilir: kullanıcının gerçek
        // cüzdanına sahte işlem yazmak bakiyesini bozardı. İşlemin para birimi
        // hesabınkiyle aynı olmak zorunda: farklı olsaydı bakiye toplamı
        // birbirine karışmış iki para biriminden oluşurdu.
        const transactions = Array.from({ length: TRANSACTION_COUNT }, (_, i) => {
            const isIncome = faker.number.float() < 0.25;
            const category = faker.helpers.arrayElement(isIncome ? incomeCategories : expenseCategories);
            const account = faker.helpers.arrayElement(accounts);
            const date = faker.date.recent({ days: DAYS_BACK }).toISOString();

            return {
                id: `${FAKE_ID_PREFIX}tx-${i}`,
                account_id: account.id,
                to_account_id: null as string | null,
                category_id: category.id,
                currency_id: account.currency_id,
                minor_unit: account.currency.minorUnit,
                title: isIncome
                    ? translateCategoryName(category.name, locale)
                    : faker.commerce.productName(),
                amount: scaleAmount(
                    isIncome
                        ? faker.number.int({ min: 5_000, max: 60_000 })
                        : faker.number.float({ min: 50, max: 3_000, fractionDigits: 2 }),
                    account.currency
                ),
                description: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.4 }) ?? null,
                date,
                type: isIncome ? 'income' : 'expense',
                created_at: date,
                updated_at: date,
            };
        });

        // Bakiyeler işlemlerle tutarlı olsun: başlangıç + gelir - gider.
        // Migration 021'deki bütünlük trigger'ı negatif bakiyede INSERT'i ABORT
        // ettiği için sonuç 0'ın altına inemez (rastgele dağılımda mümkün).
        for (const tx of transactions) {
            const account = accounts.find(a => a.id === tx.account_id)!;
            account.balance = roundTo(
                account.balance + (tx.type === 'income' ? tx.amount : -tx.amount),
                account.currency.minorUnit
            );
        }

        for (const account of accounts) {
            account.balance = Math.max(account.balance, 0);
        }

        const budgets = this.buildBudgets(
            faker, accounts, transactions, expenseCategories, locale, now
        );
        const savingGoals = this.buildSavingGoals(faker, accounts, locale, now);

        // Sıra FK'lerin dayattığı sıra: junction ve efekt satırları
        // ebeveynlerinden sonra yazılmalı.
        await this.insertInto(
            db,
            'accounts',
            // `currency` yalnızca üretim sırasında taşınan bir yardımcı;
            // `insertInto` kolonları ilk satırın anahtarlarından çıkardığı için
            // kalırsa var olmayan bir kolona INSERT denenir.
            accounts.map(({ currency: _currency, ...row }) => row)
        );
        await this.insertBatch(db, transactions);
        await this.insertInto(db, 'budgets', budgets.rows);
        await this.insertInto(db, 'budget_categories', budgets.categories);
        await this.insertInto(db, 'budget_daily_spent', budgets.dailySpent);
        await this.insertInto(db, 'transaction_budget_effects', budgets.effects);
        await this.insertInto(db, 'saving_goals', savingGoals);

        const settingsWritten = await this.ensureOnboardingCompleted(
            db, baseCurrency.id, locale, settings.row, nowIso
        );

        return accounts.length
            + transactions.length
            + budgets.rows.length
            + savingGoals.length
            + settingsWritten
    }

    /**
     * Bütçeleri ÜRETİLEN İŞLEMLERDEN türetir; rastgele bir `spent_amount`
     * atmaz.
     *
     * Uydurma bir toplam, bütçe ekranlarında yanlış ilerleme çubuğu göstermenin
     * ötesinde gerçek bir soruna yol açardı: `transaction_budget_effects`
     * defteri boş kalır ve bir işlem silindiğinde/güncellendiğinde use-case
     * bütçeden düşecek kaydı bulamaz, toplam kalıcı olarak şişerdi.
     *
     * Her bütçe farklı bir dönem tipi alır (aylık/haftalık/yıllık/tek sefer).
     * Hepsi 'monthly' iken ekranda yalnızca içinde bulunulan ay görünüyordu;
     * 'yearly' ve 'once' çok aylık toplamları kapsıyor.
     *
     * `next_reset_date` her zaman GELECEKTE: geçmiş bir sıfırlama sınırı,
     * açılışta `rolloverDueBudgets` tarafından hemen devrilir ve harcama
     * sıfırlanırdı (bkz. rollover-due-budgets.ts). 'once' bütçelerin sınırı
     * yoktur ve o sorgu onları zaten dışarıda bırakır.
     */
    private buildBudgets(
        faker: Faker,
        accounts: SeedRow[],
        transactions: SeedRow[],
        expenseCategories: SeedRow[],
        locale: SupportedLocale,
        now: Date
    ): { rows: SeedRow[]; categories: SeedRow[]; dailySpent: SeedRow[]; effects: SeedRow[] } {
        const rows: SeedRow[] = [];
        const categories: SeedRow[] = [];
        const dailySpent: SeedRow[] = [];
        const effects: SeedRow[] = [];

        const usedCategoryIds = new Set<string>();

        for (let i = 0; i < BUDGET_TYPES.length; i++) {
            const type = BUDGET_TYPES[i];
            const { start, end } = periodBoundsFor(type, now);
            const startIso = start.toISOString();
            const endIso = end?.toISOString() ?? null;

            // Kategori seçimi dönem başına yapılır: haftalık pencerede dolu olan
            // çift ile yıllık pencerede dolu olan çift aynı olmak zorunda değil.
            const pair = this.rankSpendingPairs(
                transactions, accounts, expenseCategories, startIso, endIso
            ).find(candidate => !usedCategoryIds.has(candidate.category.id));

            if (!pair) continue;

            usedCategoryIds.add(pair.category.id);

            const { category, account, matching } = pair;
            const budgetId = `${FAKE_ID_PREFIX}budget-${i}`;
            const minorUnit = account.currency.minorUnit;

            const spent = roundTo(matching.reduce((sum, tx) => sum + tx.amount, 0), minorUnit);

            // Limit harcamadan türetilir ki bazıları limit altında, bazıları
            // uyarı eşiğinde, bazıları aşmış görünsün — üç durumu da denemek için.
            const ratio = [1.8, 1.15, 0.85, 1.4][i % 4];
            // Taban YALNIZCA harcama sıfırken: trigger `amount > 0` istiyor ama
            // sabit bir taban, harcamanın küçük olduğu dar dönemlerde (haftalık)
            // ve büyük mertebeli para birimlerinde (JPY) oranı eziyordu —
            // %87 beklenen bütçe %15 görünüyordu.
            const amount = spent > 0
                ? roundTo(spent * ratio, minorUnit)
                : scaleAmount(500, account.currency);

            rows.push({
                id: budgetId,
                account_id: account.id,
                // Bütçenin para birimi hesabınkiyle aynı olmak ZORUNDA: harcama
                // eşleşmesi `b.currency_id = t.currency_id` üzerinden kuruluyor
                // (bkz. migration 018), farklı olursa bütçe hiçbir işlemi görmez.
                currency_id: account.currency_id,
                minor_unit: minorUnit,
                name: translateCategoryName(category.name, locale),
                amount,
                spent_amount: spent,
                type,
                icon: 'walletOutline',
                icon_bg_color: faker.helpers.arrayElement(COLOR_PALETTE),
                start_date: startIso,
                end_date: null,
                enable_notifications: 1,
                warning_percentage: 80,
                note: null,
                status: 'active',
                last_reset_date: null,
                next_reset_date: endIso,
                period_start: startIso,
                tracking_start_date: null,
                created_at: startIso,
                updated_at: now.toISOString(),
            });

            categories.push({ budget_id: budgetId, category_id: category.id });

            // Günlük kovalar YEREL takvim gününe göre — `Budget.toDateKey` de
            // öyle; UTC'ye göre yazılsa gece yarısına yakın işlemler yanlış güne düşerdi.
            const perDay = new Map<string, number>();

            for (const tx of matching) {
                effects.push({
                    transaction_id: tx.id,
                    budget_id: budgetId,
                    period_start: startIso,
                    amount: tx.amount,
                    currency_id: account.currency_id,
                    occurred_at: tx.date,
                });

                const key = toDateKey(new Date(tx.date));
                perDay.set(key, roundTo((perDay.get(key) ?? 0) + tx.amount, minorUnit));
            }

            // Entity yalnızca en yeni 31 günü tutuyor (`MAX_DAILY_SPENT_DAYS`);
            // yıllık/tek seferlik dönemlerde yüzlerce gün birikiyor ve fazlası
            // uygulamanın hiç okumayacağı satır olurdu.
            const recentDays = [...perDay.entries()]
                .sort(([a], [b]) => (a < b ? 1 : -1))
                .slice(0, MAX_DAILY_SPENT_DAYS);

            for (const [date, dayAmount] of recentDays) {
                dailySpent.push({
                    id: uuidv6(),
                    budget_id: budgetId,
                    date,
                    amount: dayAmount,
                });
            }
        }

        return { rows, categories, dailySpent, effects };
    }

    /**
     * (hesap, kategori) çiftlerini dönem içi harcama sayısına göre sıralar.
     *
     * Bütçe tek bir hesaba bağlı ve harcama eşleşmesi `account_id` + kategori
     * üzerinden kurulduğu için hesap sırayla dağıtılırsa çiftlerin çoğu boş
     * çıkıyor: ayın 5'inde seed edildiğinde işlemlerin ancak %2,5'i dönem
     * içinde kalıyor ve bu da 8 hesap × 10 gider kategorisine bölünüyor.
     * Sonuç "0,00 ₺ / 500,00 ₺" gibi hiçbir şey göstermeyen bütçelerdi.
     *
     * Kategori başına en dolu hesap seçilir ve kategoriler tekrar etmez: aynı
     * işlem iki bütçeye sayılsa toplamlar teknik olarak geçerli ama okurken
     * kafa karıştırıcı olurdu.
     */
    private rankSpendingPairs(
        transactions: SeedRow[],
        accounts: SeedRow[],
        expenseCategories: SeedRow[],
        periodStartIso: string,
        /** `null` = üst sınır yok ('once' bütçeler). */
        nextResetIso: string | null
    ): { category: SeedRow; account: SeedRow; matching: SeedRow[] }[] {
        const byPair = new Map<string, SeedRow[]>();

        for (const tx of transactions) {
            const inPeriod = tx.date >= periodStartIso
                && (nextResetIso === null || tx.date < nextResetIso);

            if (tx.type !== 'expense' || !inPeriod) {
                continue;
            }

            const key = `${tx.account_id} ${tx.category_id}`;
            const bucket = byPair.get(key);

            if (bucket) bucket.push(tx);
            else byPair.set(key, [tx]);
        }

        const best = expenseCategories.map(category => {
            let account = accounts[0];
            let matching: SeedRow[] = [];

            for (const candidate of accounts) {
                const bucket = byPair.get(`${candidate.id} ${category.id}`) ?? [];

                if (bucket.length > matching.length) {
                    account = candidate;
                    matching = bucket;
                }
            }

            return { category, account, matching };
        });

        return best.sort((a, b) => b.matching.length - a.matching.length);
    }

    /**
     * Hedefe biriken tutar bağlı hesaptan DÜŞÜLÜR (`AddSavingUseCase` de
     * `account.withdraw()` çağırıyor). Düşülmezse aynı para hem hesap
     * bakiyesinde hem hedefte görünür ve toplam varlık şişer.
     */
    private buildSavingGoals(
        faker: Faker,
        accounts: SeedRow[],
        locale: SupportedLocale,
        now: Date
    ): SeedRow[] {
        const names = faker.helpers.shuffle([...SAVING_GOAL_NAMES[locale]]);
        const count = Math.min(SAVING_GOAL_COUNT, names.length, accounts.length);
        const rows: SeedRow[] = [];

        for (let i = 0; i < count; i++) {
            const account = accounts[i % accounts.length];
            const minorUnit = account.currency.minorUnit;
            const target = scaleAmount(
                faker.number.int({ min: 25_000, max: 250_000 }),
                account.currency
            );
            // Bakiyeyi aşan birikim hesabı negatife düşürür ve migration
            // 021'in trigger'ı INSERT'i ABORT eder.
            const saved = roundTo(
                Math.min(faker.number.float({ min: 0, max: target }), account.balance),
                minorUnit
            );

            account.balance = roundTo(account.balance - saved, minorUnit);

            const targetDate = new Date(now);
            targetDate.setMonth(targetDate.getMonth() + faker.number.int({ min: 3, max: 24 }));

            rows.push({
                id: `${FAKE_ID_PREFIX}goal-${i}`,
                // Hedefin para birimi hesabınkiyle aynı: birikim o hesaptan
                // düşülüyor, farklı olsaydı bakiyeden çıkan tutarla hedefe
                // yazılan tutar aynı para biriminde olmazdı.
                currency_id: account.currency_id,
                minor_unit: account.currency.minorUnit,
                account_id: account.id,
                name: names[i],
                target_amount: target,
                saved_amount: saved,
                target_date: targetDate.toISOString(),
                status: saved >= target ? 'completed' : 'active',
                icon: 'flagOutline',
                icon_color: faker.helpers.arrayElement(COLOR_PALETTE),
                description: null,
                created_at: now.toISOString(),
                updated_at: now.toISOString(),
            });
        }

        return rows;
    }

    /**
     * Dil ve baz para birimi tercihini DB'den okur.
     *
     * Dil için i18n'in o anki değeri tek başına yetmiyor: `app_settings`'teki
     * tercih i18n'e ancak app store `initialize()` içinde uygulanıyor ve seeder
     * ondan önce koşuyor. Kayıt yoksa (kurulum tamamlanmamış) i18n'in
     * localStorage/cihaz dilinden çözdüğü değere düşülür — onboarding de aynı
     * cihaz diliyle başlayacak.
     */
    private async readSettings(db: DatabaseAdapter): Promise<{
        row: SeedRow | undefined;
        locale: SupportedLocale;
        baseCurrencyId: string | null;
    }> {
        const result = await db.query(
            `SELECT id, base_currency_id, onboarding_completed, language FROM app_settings LIMIT 1`
        );
        const row = result.rows[0];

        const candidate = row?.language ?? i18n.global.locale.value;
        const locale = isSupportedLocale(candidate) ? candidate : DEFAULT_LOCALE;

        return { row, locale, baseCurrencyId: row?.base_currency_id ?? null };
    }

    /**
     * Hesaplara dağıtılacak para birimlerini döndürür; ilk sıradaki BAZ para
     * birimidir.
     *
     * Baz para biriminin listede olması şart: kur çekilemediğinde (banner
     * durumu) hiçbir hesap çevrilemez ve toplam bakiye tamamen boş görünürdü.
     * Ek para birimlerinden DB'de bulunmayanlar sessizce atlanır.
     */
    private async resolveCurrencies(
        db: DatabaseAdapter,
        baseCurrencyId: string | null
    ): Promise<{ id: string; code: string; minorUnit: number }[]> {
        const wanted = [...EXTRA_CURRENCY_CODES, FALLBACK_CURRENCY_CODE];
        const placeholders = wanted.map(() => '?').join(', ');

        const result = await db.query(
            `SELECT id, code, minor_unit FROM currencies WHERE id = ? OR code IN (${placeholders})`,
            [baseCurrencyId ?? '', ...wanted]
        );

        const rows = result.rows.map(row => ({
            id: row.id,
            code: row.code,
            minorUnit: Number(row.minor_unit ?? 2),
        }));

        const base = rows.find(row => row.id === baseCurrencyId)
            ?? rows.find(row => row.code === FALLBACK_CURRENCY_CODE);

        if (!base) {
            return [];
        }

        return [base, ...rows.filter(row => row.id !== base.id)];
    }

    /** Limite yalnız aktif hesaplar sayılır — `CreateAccountUseCase` ile aynı kural. */
    private async availableAccountSlots(db: DatabaseAdapter): Promise<number> {
        const result = await db.query(
            `SELECT COUNT(*) as count FROM accounts WHERE is_active = 1`
        );
        const active = Number(result.rows[0]?.count ?? 0);

        return Math.max(Math.min(ACCOUNT_COUNT, MAX_ACCOUNT_COUNT - active), 0);
    }

    /**
     * Kurulum yarım kalmışsa tamamlar. Zaten tamamsa HİÇ DOKUNMAZ: kullanıcının
     * seçtiği baz para birimini/temasını fake seed ezmemeli.
     *
     * Kurulumu bitmemiş bir DB'de bu adım olmadan seed görünmez olurdu: router
     * guard'ı `onBoardingCompleted` bayrağına bakıyor (bkz. router/guards.ts) ve
     * arkada binlerce fake kayıt dururken açılışta /welcome'a düşürüyordu.
     */
    private async ensureOnboardingCompleted(
        db: DatabaseAdapter,
        currencyId: string,
        locale: SupportedLocale,
        row: SeedRow | undefined,
        nowIso: string
    ): Promise<number> {
        if (row?.onboarding_completed) {
            return 0
        }

        if (row) {
            await db.run(
                `UPDATE app_settings SET base_currency_id = ?, onboarding_completed = 1 WHERE id = ?`,
                [currencyId, row.id]
            );
            return 0
        }

        // `language` AÇIKÇA yazılır: kolonun DEFAULT'u 'tr' ve bırakılırsa app
        // store açılışta `setLocale('tr')` çağırıp dili geri çeviriyor —
        // İngilizce üretilmiş veri Türkçe arayüzle açılıyordu. Gerçek kurulum
        // da aynısını yapıyor (CompleteOnboardingUseCase cihaz dilini yazar).
        //
        // Kalan kolonlar (tema, biçim, hafta başlangıcı) migration 003/012'deki
        // DEFAULT değerleriyle doğar — repository de aynı varsayılanlara
        // hydrate ediyor.
        await this.insertInto(db, 'app_settings', [{
            id: uuidv6(),
            base_currency_id: currencyId,
            onboarding_completed: 1,
            language: locale,
            created_at: nowIso,
        }]);

        return 1
    }

    /**
     * Yalnızca fake satırları siler; kullanıcının verisine dokunmaz.
     *
     * Sıra FK'lerin dayattığı sıra: `transactions.account_id` ve
     * `budgets.account_id` RESTRICT ile `accounts`'a bağlı, `saving_goals` ise
     * migration 025'teki trigger yüzünden hesaptan önce gitmeli. İşlem koşuluna
     * `account_id`/`to_account_id` da giriyor: kullanıcı fake bir cüzdana elle
     * işlem eklemişse o satır fake id taşımaz ama hesabın silinmesini RESTRICT
     * ile bloklardı. `transaction_budget_effects`, `budget_categories` ve
     * `budget_daily_spent` CASCADE ile kendiliğinden gider.
     */
    private async removeFakeData(db: DatabaseAdapter): Promise<void> {
        const like = `${FAKE_ID_PREFIX}%`;

        await db.run(
            `DELETE FROM transactions
             WHERE id LIKE ? OR account_id LIKE ? OR to_account_id LIKE ?`,
            [like, like, like]
        );
        await db.run(`DELETE FROM budgets WHERE id LIKE ? OR account_id LIKE ?`, [like, like]);
        await db.run(`DELETE FROM saving_goals WHERE id LIKE ? OR account_id LIKE ?`, [like, like]);
        await db.run(`DELETE FROM accounts WHERE id LIKE ?`, [like]);

        logger.debug('Fake veriler temizlendi', { context: CTX });
    }

    async rollback(db: DatabaseAdapter): Promise<void> {
        await this.removeFakeData(db);
    }
}

/**
 * Para biriminin küsurat basamağına yuvarlar; kayan nokta birikimi aksi hâlde
 * tutarları kaydırıyor. JPY gibi küsuratsız para birimlerinde ondalıklı bir
 * tutar `Money` doğrulamasına takılır, KWD'de ise 3 basamak gerekir.
 */
function roundTo(value: number, minorUnit: number): number {
    const factor = 10 ** minorUnit;
    return Math.round(value * factor) / factor;
}

/**
 * TRY cinsinden yazılmış taban tutarı hedef para biriminin büyüklüğüne çevirir
 * ve küsuratını düzeltir. Kaba bir mertebe dönüşümü — bkz. MAGNITUDE_BY_CODE.
 */
function scaleAmount(
    tryAmount: number,
    currency: { code: string; minorUnit: number }
): number {
    const scaled = tryAmount * (MAGNITUDE_BY_CODE[currency.code] ?? 1);
    // Küsuratsız para birimlerinde 0'a yuvarlanma riski var; bütünlük
    // trigger'ları `amount > 0` şart koşuyor.
    return Math.max(roundTo(scaled, currency.minorUnit), 10 ** -currency.minorUnit);
}

/**
 * `Budget.calculatePeriodBounds` + `Budget.addPeriods` ile AYNI hesap.
 *
 * Kopyalanmasının sebebi: seeder ham SQL yazıyor, entity'yi kurup
 * repository'den geçirmiyor. Entity'deki dönem mantığı değişirse burası da
 * güncellenmeli — aksi hâlde üretilen `period_start`/`next_reset_date`
 * uygulamanın hesapladığıyla ayrışır.
 */
function periodBoundsFor(
    type: typeof BUDGET_TYPES[number],
    now: Date
): { start: Date; end?: Date } {
    if (type === 'once') {
        // Tek seferlik bütçe: üretilen en eski işleme kadar geriye uzanır ve
        // sıfırlama sınırı yoktur, yani bütün aylar tek toplamda görünür.
        const start = new Date(now);
        start.setDate(start.getDate() - DAYS_BACK);
        start.setHours(0, 0, 0, 0);
        return { start };
    }

    const anchor = new Date(now);
    anchor.setHours(0, 0, 0, 0);

    // Çapa geçmişe atılır; aşağıdaki döngü dönemi bugüne kadar ilerletir.
    if (type === 'weekly') anchor.setDate(anchor.getDate() - 84);
    if (type === 'monthly') anchor.setMonth(anchor.getMonth() - 6, 1);
    if (type === 'yearly') anchor.setFullYear(anchor.getFullYear() - 1, 0, 1);

    let start = new Date(anchor);
    let count = 1;
    let end = addPeriods(type, anchor, count);

    while (end && end <= now) {
        start = end;
        count++;
        end = addPeriods(type, anchor, count);
    }

    return { start, end };
}

function addPeriods(
    type: typeof BUDGET_TYPES[number],
    anchor: Date,
    count: number
): Date | undefined {
    if (type === 'once') return undefined;

    const date = new Date(anchor);
    date.setHours(0, 0, 0, 0);

    if (type === 'weekly') {
        date.setDate(date.getDate() + 7 * count);
        return date;
    }

    // Ay/yıl eklemesinde gün taşmasını engelle: 31 Ocak + 1 ay 3 Mart'a
    // kaymasın (entity de aynı kırpmayı yapıyor).
    const day = date.getDate();
    const month = date.getMonth();

    date.setDate(1);

    if (type === 'monthly') {
        date.setMonth(month + count);
    } else {
        date.setFullYear(date.getFullYear() + count);
        date.setMonth(month);
    }

    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));

    return date;
}

/** `Budget.toDateKey` ile aynı: YEREL takvim gününe göre YYYY-MM-DD. */
function toDateKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
}
