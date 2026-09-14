<script setup lang="ts">
import CurrencyInput from '@/components/CurrencyInput.vue'

/**
 * Büyük, ortalanmış tutar kartı: üstte ortalı etiket, kart içinde ortalı tutar,
 * sağda para birimi kodu. Hata varsa kart kenarlığı rose olur, mesaj altta.
 * (İşlem ekranındaki tutar girişiyle aynı görünüm.)
 *
 *   <amount-card label="Bütçe Tutarı" v-model="amount" :currency-code="code" :error="errors.amount" />
 */
defineProps<{
  label: string
  currencyCode: string
  error?: string
}>()

const model = defineModel<number>({ required: true })
</script>

<template>
  <section>
    <p class="text-center text-[13px] font-medium uppercase tracking-wider text-content-muted mb-2">
      {{ label }}
    </p>

    <div
        class="amount-card relative flex items-center justify-center rounded-2xl border border-line bg-surface px-3"
        :class="{ 'amount-card--error': error }"
    >
      <CurrencyInput
          v-model="model"
          variant="plain"
          :currency-code="currencyCode"
          placeholder="0,00"
          class="amt-input w-full"
      />

      <!-- Para birimi (sağda sabit) -->
      <span class="absolute top-1/2 right-3 -translate-y-1/2 pl-3 border-l border-line text-[15px] font-bold text-content">
        {{ currencyCode }}
      </span>
    </div>

    <p v-if="error" class="field-error text-[11px] text-rose-600 mt-2 text-center">{{ error }}</p>
  </section>
</template>

<style scoped>
.amount-card--error {
  border-color: #e11d48; /* rose-600 */
}

/* Kart içinde ortalanmış büyük tutar; CurrencyInput'un kendi kod/sembol eki
   gizlenir (kur sağda ayrı gösteriliyor). */
.amt-input :deep(ion-input),
.amt-input :deep(input) {
  --background: transparent;
  --color: inherit;
  --padding-start: 0;
  --padding-end: 0;
  font-size: 30px;
  font-weight: 800;
  text-align: center;
}

.amt-input :deep(.currency-suffix) {
  display: none;
}
</style>
