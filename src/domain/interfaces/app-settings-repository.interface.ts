import { AppSettings } from '../entities/app-settings';

/**
 * App Settings Repository Interface
 * Domain katmanında tanımlanır, Infrastructure'da implement edilir.
 *
 * Settings singleton'dır: yoksa null döner. Yaratılması onboarding
 * use case'inin sorumluluğundadır.
 */
export interface IAppSettingsRepository {
    get(): Promise<AppSettings | null>;
    save(settings: AppSettings): Promise<void>;
}

