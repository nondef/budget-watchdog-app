<script setup lang="ts">
/**
 * Yedek hatırlatıcısı — Ana Sayfa akışında duran kapatılabilir kart.
 *
 * Neden kart, neden global şerit değil: bu uyarı önceden `ion-app` kökünde
 * `position: fixed; bottom: 0` bir şeritti. Tab bar ile aynı noktaya sabitlenip
 * gezinme butonlarının üstüne biniyor, safe-area payını tab bar'la birlikte iki
 * kez sayıyor ve klavye açıkken (`html.keyboard-open` kuralı yalnızca
 * `ion-footer`'ı gizliyor) klavyenin üstünde asılı kalıyordu. Ayrıca kilit
 * ekranı, onboarding ve form sayfaları dahil HER ekranda görünüyordu.
 *
 * Akışın içinde duran bir kart hiçbir şeyin üstünü örtmez, kaydırınca gider ve
 * yalnızca kullanıcının parasına baktığı ekranda çıkar. Çarpı, kartla birlikte
 * sekme ve Ayarlar listesi rozetlerini de erteler (ortak koşul: `shouldWarn`).
 */
import { computed } from 'vue'
import { IonIcon } from '@ionic/vue'
import { cloudUploadOutline, closeOutline } from 'ionicons/icons'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAccountsStore } from '@/stores/accounts'
import { useBackupReminder } from '@/composables/features/useBackupReminder'
import { useNotifier } from '@/composables/features/useNotifier'

const { t } = useI18n()
const router = useRouter()
const accountsStore = useAccountsStore()

const { daysSince, hasEverExported, dismiss, shouldWarn } = useBackupReminder()
const notifier = useNotifier()

/**
 * Kapatma + ertelemenin bittiği ana bildirim kur.
 *
 * Zamanlama `useBackupReminder`ın içinde DEĞİL burada: composable'ın bildirim
 * katmanına bağımlı olmaması, onu Capacitor mock'u olmadan test edilebilir
 * tutuyor. `resyncSchedules` her öne gelişte aynı işi tekrar yaptığı için bu
 * çağrı düşse bile durum bir sonraki açılışta toparlanır — buradaki amaç
 * kullanıcı çarpıya bastığı anda kaydın kurulmuş olması.
 */
const handleDismiss = async () => {
  await dismiss()
  await notifier.scheduleBackupSnoozeEndReminder()
}

// Verisi olmayan yeni kurulumda "yedek al" demek anlamsız gürültü olurdu.
const visible = computed(() => shouldWarn(accountsStore.activeAccounts.length > 0))

const message = computed(() =>
    hasEverExported.value
        ? t('backup.reminder.stale', { days: daysSince.value ?? 0 })
        : t('backup.reminder.never')
)

const goToBackup = () => router.push('/settings/backup')
</script>

<template>
  <section
      v-if="visible"
      class="bg-surface rounded-2xl px-4 py-3.5 flex items-start gap-3"
  >
    <div
        class="size-9 shrink-0 rounded-full flex items-center justify-center bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
    >
      <ion-icon :icon="cloudUploadOutline" class="size-[18px]" />
    </div>

    <div class="min-w-0 flex-1">
      <p class="text-[13px] leading-snug text-content">{{ message }}</p>
      <button
          class="mt-2 px-3 py-1.5 rounded-lg bg-surface-strong text-[12px] font-semibold text-content active:opacity-70 transition"
          @click="goToBackup"
      >
        {{ $t('backup.reminder.action') }}
      </button>
    </div>

    <button
        class="size-7 shrink-0 -mr-1 rounded-full flex items-center justify-center text-content-tertiary active:bg-surface-strong transition"
        :aria-label="$t('common.close')"
        @click="() => void handleDismiss()"
    >
      <ion-icon :icon="closeOutline" class="size-[16px]" />
    </button>
  </section>
</template>
