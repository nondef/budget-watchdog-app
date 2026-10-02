<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { alertCircleOutline } from 'ionicons/icons'
import SwapText from '@/components/SwapText.vue'

defineProps<{ message?: string }>()
</script>

<template>
  <!-- Doğrulama hatası yumuşakça belirir/kaybolur (çipin kendisi v-if'liyse);
       mesaj değişince metin yerinde kayar. -->
  <transition name="icon-swap">
    <span
        v-if="message"
        class="error-chip inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
    >
      <ion-icon :icon="alertCircleOutline" class="size-[13px]"/>
      <swap-text :text="message" />
    </span>
  </transition>
</template>

<style scoped>
.error-chip {
  color: var(--c-error);
  background: color-mix(in srgb, var(--c-error) 12%, var(--c-surface));
}
</style>
