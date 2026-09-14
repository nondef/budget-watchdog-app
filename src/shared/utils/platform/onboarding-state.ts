/**
 * Onboarding izin ekranıyla ilgili kalıcı durum.
 * Kullanıcı izin ekranını bir kez gördüyse (verdi ya da "şimdi değil" dediyse)
 * tekrar gösterilmez — istenirse Ayarlar > Bildirimler'den yönetilir.
 */
const ONBOARDING_KEY = 'bw_onboarding_permissions_done';

export function isOnboardingPermissionsDone(): boolean {
    try {
        return localStorage.getItem(ONBOARDING_KEY) === '1';
    } catch {
        return false;
    }
}

export function markOnboardingPermissionsDone(): void {
    try {
        localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
        /* yoksay */
    }
}
