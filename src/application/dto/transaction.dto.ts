import { TransactionType } from '@/domain/entities/transaction';
import { IMoney } from "@/domain";

export interface TransactionDTO {
    id: string;
    title: string;
    amount: IMoney;
    /** Transfer'in hedef bacağı (hedef hesabın para biriminde). Transfer dışında yok. */
    toAmount?: IMoney;
    description?: string;
    /** Transfer'lerde yoktur. */
    categoryId?: string;
    currencyId: string;
    date: Date;
    type: TransactionType;
    accountId?: string;
    toAccountId?: string;
    notes?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * Bildirimin ham verisi. Mesaj metni burada üretilmez: use-case katmanı i18n
 * bilmiyor ve gömülü Türkçe metinler dil değişince sabit kalıyordu. Metni
 * `useBudgetNotification` çeviri anahtarlarından üretir.
 */
export interface BudgetNotification {
    budgetId: string;
    budgetName: string;
    type: 'warning' | 'exceeded';
    progress: number;
}

/** Bir işlemin bütçe limitini aşıracağı durum (kaydetmeden önce hesaplanır). */
export interface BudgetLimitBreach {
    budgetId: string;
    budgetName: string;
    /** Bütçenin üst sınırı. */
    limit: IMoney;
    /** İşlemden önceki harcama. */
    spentBefore: IMoney;
    /** İşlem eklenirse oluşacak harcama. */
    spentAfter: IMoney;
    /** İşlemden sonra limiti aşan kısım. */
    overBy: IMoney;
    /**
     * Bütçe bu işlemden ÖNCE de aşılmış mıydı? Diyalog metni buna göre
     * değişir: sınırı bu işlem mi geçiriyor, yoksa mevcut aşımı mı derinleştiriyor.
     */
    alreadyExceeded: boolean;
    /** İşlemden önceki aşım (aşılmamışsa sıfır). */
    overByBefore: IMoney;
}

export interface PreviewTransactionBudgetImpactInput {
    /**
     * Düzenlenen işlemin id'si. Verilirse o işlemin bütçelere hâlihazırda
     * yazılmış etkisi düşülür; yeni işlemde verilmez.
     */
    transactionId?: string;
    accountId: string;
    /** Transfer dışında zorunlu. */
    categoryId?: string;
    currencyId: string;
    amount: number;
    date: Date;
    type: TransactionType;
}

export interface PreviewTransactionBudgetImpactOutput {
    /**
     * İşlemden SONRA limit üstünde kalacak bütçeler. Zaten aşılmış olanlar da
     * listelenir — kullanıcı açısından bütçe yine aşılıyor.
     */
    breaches: BudgetLimitBreach[];
}

export interface AddTransactionInput {
    title: string;
    amount: number;
    currencyId: string;
    description?: string;
    /** Transfer dışında zorunlu. */
    categoryId?: string;
    date: Date;
    type: TransactionType;
    toAccountId?: string;
    /**
     * Kur dönüşümlü transferde hedef hesaba yatacak tutar (hedef hesabın para
     * biriminde). Kaynak ve hedef aynı para birimindeyse verilmese de olur —
     * `amount` kullanılır. Farklı para birimindeyse zorunludur.
     */
    toAmount?: number;
    accountId: string;
    notes?: string;
}

/**
 * Harcamanın bütçeye neden işlenemediği.
 *
 * Sunum katmanı yalnız bütçe adını gösteriyordu; kullanıcı "neden yansımadı"
 * sorusunu cevaplayamıyordu. Sebep burada taşınır ki mesaj ona göre kurulsun.
 *
 * - `out-of-period`: işlem tarihi bütçenin güncel döneminin dışında (geriye
 *   dönük kapanmış dönem ya da ileriye dönük sonraki dönem).
 * - `before-manual-reset`: tarih, bütçenin son manuel sıfırlamasından önce
 *   (`trackingStartDate` sınırı).
 * - `inactive`: bütçe duraklatılmış/tamamlanmış.
 * - `currency-mismatch`: işlem para birimi bütçeninkiyle aynı değil.
 * - `unknown`: yukarıdakilerden hiçbiri — mesaj genel metne düşer.
 */
export type SkippedBudgetReason =
    | 'out-of-period'
    | 'before-manual-reset'
    | 'inactive'
    | 'currency-mismatch'
    | 'unknown';

/** Domain kuralı gereği harcaması işlenemeyen bütçe. */
export interface SkippedBudget {
    budgetId: string;
    budgetName: string;
    reason: SkippedBudgetReason;
}

export interface AddTransactionOutput {
    transaction: TransactionDTO;
    budgetNotifications: BudgetNotification[];
    /** Boş değilse: işlem kaydedildi ama bu bütçelere yansıtılamadı. */
    skippedBudgets: SkippedBudget[];
}

export interface UpdateTransactionInput {
    id: string;
    accountId?: string;
    /** Yalnızca transfer'lerde anlamlı: hedef hesabı değiştirir. */
    toAccountId?: string;
    title?: string;
    amount?: number;
    /**
     * Kur dönüşümlü transferde hedef bacak tutarı. Aynı-para transferde `amount`
     * değişince hedef otomatik senkronlanır; ayrıca göndermeye gerek yok.
     */
    toAmount?: number;
    description?: string;
    categoryId?: string;
    date?: Date;
    notes?: string
}

export interface UpdateTransactionOutput {
    transaction: TransactionDTO;
    /**
     * Güncellenmiş tutar/kategori/tarih yeni bir uyarı veya limit aşımı
     * doğurduysa üretilir — `AddTransactionOutput` ile aynı sözleşme. Eskiden
     * hiç üretilmiyordu: 100 TL'lik bir gideri 5.000 TL yapmak bütçeyi
     * patlatsa bile kullanıcı uyarılmıyordu.
     */
    budgetNotifications: BudgetNotification[];
    /** Boş değilse: işlem güncellendi ama bu bütçelere yansıtılamadı. */
    skippedBudgets: SkippedBudget[];
}

export interface DeleteTransactionInput {
    id: string;
}

export interface DeleteTransactionOutput {
    success: boolean;
    /** Boş değilse: işlem silindi ama bu bütçelerden düşülemedi. */
    skippedBudgets: SkippedBudget[];
}

/**
 * İşlem listeleme kriteri.
 *
 * Tek tanım: eskiden aynı isimli ikinci bir arayüz `list-transaction.use-case.ts`
 * içinde de duruyordu; bu DTO'daki filtreler ise hiç uygulanmıyordu.
 */
export interface ListTransactionsInput {
    /** Hazır dönem kısayolu. `thisMonth` verilirse startDate/endDate yok sayılır. */
    period?: 'all' | 'thisMonth';
    type?: TransactionType;
    categoryId?: string;
    accountId?: string;
    startDate?: Date;
    endDate?: Date;
    /** Sayfa boyutu. Sayfalama için `offset` ile birlikte kullanılır. */
    limit?: number;
    offset?: number;
}

export interface ListTransactionsOutput {
    items: TransactionDTO[];
    total: number;
    limit: number;
    offset: number;
    hasNext: boolean;
}
