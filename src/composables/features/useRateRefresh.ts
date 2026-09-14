import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { useAccountsStore } from '@/stores/accounts'
import { useExchangeRateStore } from '@/stores/exchange-rates'
// Barrel (`@/composables`) yerine doğrudan yol: barrel bu dosyayı da ihraç
// ediyor olsaydı döngüsel import oluşurdu.
import { useToast } from '@/composables/ui/useToast'

/**
 * Eksik/bayat kur uyarısının ortak beyni.
 *
 * Uyarı eskiden `ion-app` kökünde global bir şeritti; tab bar'ın üstünü örtüyor
 * ve kullanıcının kurlarla hiç ilgilenmediği ekranlarda (kilit ekranı, form
 * sayfaları, onboarding) da duruyordu. Şimdi parayı gösteren her ekran uyarıyı
 * kendi akışında gösteriyor — mantık üç yerde kopyalanmasın diye burada.
 *
 * Kapsam kasıtlı olarak yalnızca **aktif hesapların** birimleri: katalogdaki
 * ~150 birim taransaydı uyarı, kullanıcıyı hiç ilgilendirmeyen kodlarla dolardı.
 * Onboarding sırasında (hesap yok) hiç görünmez.
 */
export function useRateRefresh() {
    const { t } = useI18n()
    const toast = useToast()
    const appStore = useAppStore()
    const accountsStore = useAccountsStore()
    const exchangeRateStore = useExchangeRateStore()

    /** Kuru eksik ya da bayat olan birimlerin kodları. */
    const missingCodes = computed(() =>
        exchangeRateStore.missingRatesFor(
            accountsStore.activeAccounts.map(account => account.balance.currencyId)
        )
    )

    const hasMissingRates = computed(() => missingCodes.value.length > 0)

    const refreshing = ref(false)

    /**
     * Kurları yeniden çeker. `refreshRates` hata fırlatmaz, `false` döner:
     * başarısızlık kalıcı bir şerit bırakmak yerine tek seferlik toast ile
     * bildirilir — uyarı zaten yerinde durmaya devam ediyor.
     */
    const refresh = async (): Promise<void> => {
        if (refreshing.value) return
        refreshing.value = true
        try {
            const ok = await appStore.refreshRates()
            if (!ok) toast.warning(t('exchangeRates.updateFailed'))
        } finally {
            refreshing.value = false
        }
    }

    return { missingCodes, hasMissingRates, refreshing, refresh }
}
