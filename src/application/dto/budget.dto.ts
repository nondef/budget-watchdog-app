import { BudgetType, BudgetStatus, DailySpent } from '@/domain/entities/budget';
import { IMoney, IIcon } from "@/domain";
import { AccountDTO } from "@/application/dto/account.dto";
import { CategoryDTO } from "@/application/dto/category.dto";
import { CurrencyDTO } from "@/application/dto/currency.dto";
import { BudgetNotification, TransactionDTO } from "@/application/dto/transaction.dto";

export interface BudgetDTO {
    id: string;
    accountId: string;
    categoryIds: string[];
    dailySpent: DailySpent[];
    name: string;
    amount: IMoney;
    spentAmount: IMoney;
    type: BudgetType;
    status: BudgetStatus;
    startDate: Date;
    endDate?: Date;
    warningPercentage: number;
    enableNotifications: boolean;
    /**
     * Bütçenin o anki uyarı/aşım durumu; eşik mantığı tek yerde (entity)
     * yaşasın diye DTO'da taşınır. Presentation katmanı `spentAmount/amount`
     * bölmesini yeniden yazmak yerine bunları kullanır.
     */
    isWarning: boolean;
    isExceeded: boolean;
    icon: IIcon;
    note?: string;
    periodStart: Date;
    trackingStartDate?: Date;
    nextResetDate?: Date;
    lastResetDate?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

// ========== Create Budget ==========

export interface CreateBudgetInput {
    accountId: string;
    categoryIds: string[];
    currencyId: string;
    name: string;
    amount: number;
    type: BudgetType;
    startDate: Date;
    endDate?: Date;
    warningPercentage?: number;
    enableNotifications?: boolean;
    icon: IIcon,
    note?: string;
}

export interface CreateBudgetOutput {
    budget: BudgetDTO;
}

// ========== Update Budget ==========

export interface UpdateBudgetInput {
    id: string;
    name?: string;
    amount?: number;
    warningPercentage?: number;
    enableNotifications?: boolean;
    note?: string;
    categoryIds?: string[];
    /** Eksik alanlar mevcut ikondan tamamlanır. */
    icon?: Partial<IIcon>;
    /** Bütçenin bağlı olduğu hesap; para birimi bütçeyle aynı olmalı. */
    accountId?: string;
    /**
     * Dönem alanları. `type` veya `startDate` verildiğinde dönem yeniden
     * kurulur ve bir sonraki sıfırlama tarihi buna göre hesaplanır.
     */
    type?: BudgetType;
    startDate?: Date;
    endDate?: Date;
}

export interface UpdateBudgetOutput {
    budget: BudgetDTO;
    /**
     * Düzenleme sonucu bütçe uyarı eşiğine ulaştıysa/aştıysa üretilir — işlem
     * akışlarıyla aynı sözleşme. Tutarı düşürmek bütçeyi anında aşıma sokabilir;
     * eskiden bu durumda kullanıcı hiç uyarılmıyordu. Gerekmiyorsa `null`.
     */
    budgetNotification: BudgetNotification | null;
}

// ========== Add Spending ==========

// `AddSpendingUseCase` kaldırıldı: bütçenin `spentAmount`'ını karşılık gelen bir
// `Transaction` yaratmadan artırıyordu. Bu harcamayı hiçbir silme/güncelleme
// akışı geri alamadığı için bütçe ile işlem geçmişi arasında kalıcı sapma
// üretiyordu. Harcama tek yoldan işlenir: `AddTransactionUseCase`.

// ========== Reset Budgets ==========

// ResetBudgetsUseCase parametre almaz: hangi bütçelerin sıfırlanacağını
// `findNeedingReset()` belirler. `force` hiç uygulanmamıştı.

export interface ResetBudgetsOutput {
    resetCount: number;
    resetBudgets: BudgetDTO[];
}

// ========== List Budgets ==========

export interface ListBudgetsInput {
    status?: BudgetStatus;
    type?: BudgetType;
    categoryId?: string;
}

export interface ListBudgetsOutput {
    budgets: BudgetDTO[];
}

// ========== Budget Stats ==========

// Bu toplu istatistik tipi hiç kullanılmıyordu; içerdiği her değer zaten
// budget store'unda ayrı birer computed olarak türetiliyor (activeBudgets,
// warningBudgets, exceededBudgets, totalBudgetAmount, totalSpentAmount,
// getBudgetProgress). Yüklenmiş listeden hesaplanabilen şey için ayrı bir
// use-case/DTO çifti taşımanın karşılığı yok.

export interface BudgetDetailOutput {
    budget: BudgetDTO
    account: AccountDTO | null
    categories: CategoryDTO[]
    currency: CurrencyDTO | null,
    transactions: (TransactionDTO & { category: CategoryDTO | null })[]
}

export type EnrichedBudgetDTO = BudgetDTO & {
    account: AccountDTO | null
    categories: CategoryDTO[]
    currency: CurrencyDTO | null
}
