<script setup lang="ts">
/**
 * Eksik/bayat kur uyarısı — tutarların gösterildiği ekranın kendi akışında.
 *
 * Global şeridin yerini alıyor: o şerit `position: fixed; bottom: 0` ile tab
 * bar'ın üstüne biniyor ve kurlarla hiç ilgisi olmayan ekranlarda da duruyordu.
 * Burada uyarı, etkilediği sayıların yanında ve yenileme eylemi kendi üzerinde.
 *
 * Ana Sayfa bunu KULLANMAZ: orada uyarı bakiyenin hemen altında, tutardaki `~`
 * işaretini açıklayan ince bir satır olarak duruyor (bkz. HomePage). Aynı işi
 * yapan iki farklı görsel ağırlık kasıtlı — burada uyarının bağlanacağı tek bir
 * sayı yok, o yüzden kendi kartı var.
 */
import { IonIcon } from '@ionic/vue'
import { refreshOutline, warningOutline } from 'ionicons/icons'
import { useRateRefresh } from '@/composables/features/useRateRefresh'

const { hasMissingRates, refreshing, refresh } = useRateRefresh()
</script>

<template>
  <section
      v-if="hasMissingRates"
      class="bg-surface rounded-2xl px-4 py-3 flex items-center gap-3"
  >
    <ion-icon
        :icon="warningOutline"
        class="size-[18px] shrink-0 text-amber-600 dark:text-amber-400"
    />

    <p class="min-w-0 flex-1 text-[13px] leading-snug text-content">
      {{ $t('exchangeRates.updateFailed') }}
    </p>

    <button
        class="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-strong text-[12px] font-semibold text-content active:opacity-70 transition disabled:opacity-60"
        :disabled="refreshing"
        @click="() => void refresh()"
    >
      <ion-icon
          :icon="refreshOutline"
          class="size-[13px]"
          :class="{ 'animate-spin': refreshing }"
      />
      {{ refreshing ? $t('common.loading') : $t('common.retry') }}
    </button>
  </section>
</template>
