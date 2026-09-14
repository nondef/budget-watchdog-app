import { SavingGoalStatus } from '@/domain/entities/saving-goal';
import { IMoney, IIcon, SavingGoalContributionType } from "@/domain";

export interface SavingGoalDTO {
    id: string;
    name: string;
    targetAmount: IMoney;
    savedAmount: IMoney;
    targetDate?: Date | null;
    status: SavingGoalStatus;
    icon: IIcon;
    description?: string;
    /** Hedefin fon hesabı; eski (sanal) hedeflerde yok. */
    accountId?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

// ========== Contributions (hareket defteri) ==========

export interface SavingGoalContributionDTO {
    id: string;
    goalId: string;
    accountId?: string;
    type: SavingGoalContributionType;
    /** Her zaman pozitif; yön `type` ile belirlenir. */
    amount: IMoney;
    /** Hareketten sonra hedefte kalan tutar. */
    balanceAfter: IMoney;
    note?: string;
    occurredAt: Date;
}

export interface ListSavingGoalContributionsInput {
    goalId: string;
}

export interface ListSavingGoalContributionsOutput {
    contributions: SavingGoalContributionDTO[];
}

// ========== Create Saving Goal ==========

export interface CreateSavingGoalInput {
    name: string;
    targetAmount: number;
    currencyId: string;
    targetDate?: Date;
    icon: string;
    iconColor: string;
    description?: string;
    initialAmount?: number;
    /** Fon hesabı. Başlangıç tutarı ve sonraki katkılar bu hesaptan düşülür. */
    accountId: string;
}

export interface CreateSavingGoalOutput {
    savingGoal: SavingGoalDTO;
}

// ========== Add Saving ==========

export interface AddSavingInput {
    goalId: string;
    amount: number;
    currencyId: string;
    /** Hareket defterine yazılacak opsiyonel not. */
    note?: string;
}

export interface AddSavingOutput {
    savingGoal: SavingGoalDTO;
    isCompleted: boolean;
}

// ========== Withdraw Saving ==========

export interface WithdrawSavingInput {
    goalId: string;
    amount: number;
    currencyId: string;
    /** Hareket defterine yazılacak opsiyonel not. */
    note?: string;
}

export interface WithdrawSavingOutput {
    savingGoal: SavingGoalDTO;
}

// ========== Update Saving Goal ==========

export interface UpdateSavingGoalInput {
    id: string;
    name?: string;
    targetAmount?: number;
    targetDate?: Date | null;
    description?: string;
    icon?: string;
    iconColor?: string;
}

export interface UpdateSavingGoalOutput {
    savingGoal: SavingGoalDTO;
}

// ========== List Saving Goals ==========

export interface ListSavingGoalsInput {
    status?: SavingGoalStatus;
}

export interface ListSavingGoalsOutput {
    savingGoals: SavingGoalDTO[];
}
