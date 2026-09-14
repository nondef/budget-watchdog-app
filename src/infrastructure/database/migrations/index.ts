import { Migration } from "./base-migration";
import { CreateCurrenciesTable } from "./001_create_currencies_table";
import { CreateCategoriesTable } from "./002_create_categories_table";
import { CreateAppSettingsTable } from "./003_create_app_settings_table";
import { CreateExchangeRatesTable } from "./004_create_exchange_rates_table";
import { CreateAccountsTable } from "./005_create_accounts_table";
import { CreateTransactionsTable } from "./006_create_transactions_table";
import { CreateBudgetsTable } from "./007_create_budgets_table";
import { CreateBudgetDailySpentTable } from "./008_create_budget_daily_spent_table";
import { CreateSavingGoalsTable } from "./009_create_saving_goals_table";
import { CreateBudgetCategoriesTable } from "@/infrastructure/database/migrations/010_create_budget_categories_table";
import {
    AddExchangeRateBuySellColumns
} from "@/infrastructure/database/migrations/011_add_exchange_rate_buy_sell_columns";
import {
    AddAppearanceColumnsToAppSettings
} from "@/infrastructure/database/migrations/012_add_appearance_columns_to_app_settings";
import { RecreateSavingGoalsTable } from "@/infrastructure/database/migrations/013_recreate_saving_goals_table";
import {
    RenameDefaultCategoriesToI18nKeys
} from "@/infrastructure/database/migrations/014_rename_default_categories_to_i18n_keys";
import { AddNotesToTransactions } from "@/infrastructure/database/migrations/015_add_notes_to_transactions";
import {
    AddMetadataColumnsToCategories
} from "@/infrastructure/database/migrations/016_add_metadata_columns_to_categories";
import { AddBudgetPeriodStart } from './017_add_budget_period_start';
import {
    CreateTransactionBudgetEffectsTable
} from './018_create_transaction_budget_effects_table';
import {
    EnforceCategoryNameUniqueness
} from './019_enforce_category_name_uniqueness';
import { AddCurrencyMinorUnits } from './020_add_currency_minor_units';
import { AddMoneyIntegrityTriggers } from './021_add_money_integrity_triggers';
import {
    AddTransferDestinationAmount
} from './022_add_transfer_destination_amount';
import { AddAccountToSavingGoals } from './023_add_account_to_saving_goals';
import {
    AddBudgetTrackingStartDate
} from './024_add_budget_tracking_start_date';
import {
    EnforceSavingGoalAccount
} from './025_enforce_saving_goal_account';
import { NormalizeTimestampFormat } from './026_normalize_timestamp_format';
import { BackfillCategoryMetadata } from './027_backfill_category_metadata';
import {
    AllowCreditAccountNegativeBalance
} from './028_allow_credit_account_negative_balance';
import {
    CreateSavingGoalContributionsTable
} from './029_create_saving_goal_contributions_table';

export const migrations: Migration[] = [
    new CreateCurrenciesTable(),
    new CreateCategoriesTable(),
    new CreateAppSettingsTable(),
    new CreateExchangeRatesTable(),
    new CreateAccountsTable(),
    new CreateTransactionsTable(),
    new CreateBudgetsTable(),
    new CreateBudgetDailySpentTable(),
    new CreateSavingGoalsTable(),
    new CreateBudgetCategoriesTable(),
    new AddExchangeRateBuySellColumns(),
    new AddAppearanceColumnsToAppSettings(),
    new RecreateSavingGoalsTable(),
    new RenameDefaultCategoriesToI18nKeys(),
    new AddNotesToTransactions(),
    new AddMetadataColumnsToCategories(),
    new AddBudgetPeriodStart(),
    new CreateTransactionBudgetEffectsTable(),
    new EnforceCategoryNameUniqueness(),
    new AddCurrencyMinorUnits(),
    new AddMoneyIntegrityTriggers(),
    new AddTransferDestinationAmount(),
    new AddAccountToSavingGoals(),
    new AddBudgetTrackingStartDate(),
    new EnforceSavingGoalAccount(),
    new NormalizeTimestampFormat(),
    new BackfillCategoryMetadata(),
    new AllowCreditAccountNegativeBalance(),
    new CreateSavingGoalContributionsTable(),
];

export { type Migration, BaseMigration, type ColumnDefinition, type IndexDefinition } from "./base-migration";
