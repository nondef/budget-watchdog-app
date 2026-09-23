<script setup lang="ts">
import { IonItem, IonIcon } from '@ionic/vue'
import { chevronForwardOutline } from 'ionicons/icons'

/**
 * MD3 FILLED text field görünümünde tıklanır seçici alan (menu/picker).
 * Görsel dil ion-input[fill="solid"] ile birebir aynıdır: zemin
 * surface-container-highest, üst köşeler 4dp, altta active indicator,
 * küçük üst etiket + değer. Stiller global (src/theme/ionic/picker-field.css, .md3-picker).
 *
 *   <picker-field :label="..." :error="errors.x" :empty="!selected" @click="open = true">
 *     <template #start> ...ikon kutusu... </template>
 *     {{ selected?.name || 'Seç' }}
 *   </picker-field>
 */
withDefaults(defineProps<{
  label: string
  /** Hata mesajı — indicator error rengine döner, mesaj altta gösterilir */
  error?: string
  /** Değer henüz seçilmemiş (placeholder görünümü) */
  empty?: boolean
  /** Tıklanamaz/kilitli alan (chevron gizlenir, ripple kapanır) */
  readonly?: boolean
}>(), {
  empty: false,
  readonly: false,
})

const emit = defineEmits<{ (e: 'click'): void }>()
</script>

<template>
  <div>
    <ion-item
        :button="!readonly"
        :detail="false"
        lines="none"
        class="md3-picker"
        :class="{ 'md3-picker--error': error }"
        @click="!readonly && emit('click')"
    >
      <slot name="start" />

      <div class="min-w-0 flex-1 py-3">
        <span class="md3-picker__label">{{ label }}</span>
        <span
            class="md3-picker__value truncate"
            :class="{ 'md3-picker__value--placeholder': empty }"
        >
          <slot />
        </span>
      </div>

      <slot name="end">
        <ion-icon
            v-if="!readonly"
            slot="end"
            :icon="chevronForwardOutline"
            class="size-4 shrink-0"
            style="color: var(--md-on-surface-variant)"
        />
      </slot>
    </ion-item>

    <p class="md3-supporting md3-supporting--error font-medium" v-if="error">{{ error }}</p>
  </div>
</template>
