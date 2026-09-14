<script setup lang="ts">
import { IonModal, IonIcon } from '@ionic/vue'
import { closeOutline } from 'ionicons/icons'

defineProps<{
  isOpen: boolean
  title: string
}>()
const emit = defineEmits<{ (e: 'dismiss'): void }>()
</script>

<template>
  <ion-modal :is-open="isOpen" @did-dismiss="emit('dismiss')">
    <div class="modal-sheet">
      <!-- MD3 bottom sheet drag handle -->
      <div class="sheet-handle" aria-hidden="true"/>

      <header class="flex items-center justify-between mb-4">
        <h2 class="text-[16px] font-bold text-content">{{ title }}</h2>
        <button
            class="size-8 rounded-full flex items-center justify-center text-content-muted active:bg-surface-strong"
            @click="emit('dismiss')"
        >
          <ion-icon :icon="closeOutline" class="size-5"/>
        </button>
      </header>

      <slot/>
    </div>
  </ion-modal>
</template>

<style>
/* MD3 bottom sheet — diğer modallarla aynı yüzey dili: tek tema yüzeyi
   (surface-container-high). Modal kutusu ile sheet aynı tonda olduğu için
   yuvarlatılmış üst köşelerin arkasında ton farkı (dikiş) oluşmaz.
   Slot içeriği parent bileşene ait olduğundan bu blok scoped DEĞİL. */
ion-modal .modal-sheet {
  background: var(--md-surface-container-high);
  padding: 12px 16px calc(env(safe-area-inset-bottom) + 24px);
  border-radius: 28px 28px 0 0;
  max-height: 80vh;
  overflow-y: auto;
}

ion-modal .modal-sheet .sheet-handle {
  width: 32px;
  height: 4px;
  border-radius: 9999px;
  background: var(--md-outline-variant);
  margin: 0 auto 14px;
}

/* Sheet içindeki seçenek satırları — picker modallarındaki kart dili:
   normalde şeffaf, dokununca sunken, seçiliyken 2px primary halka.
   Eski `bg-indigo-50` soğuk grisi sıcak krem light paletiyle uyuşmuyordu
   ve dark varyantı olmayan kullanımlarda dark modda bembeyaz kalıyordu. */
ion-modal .modal-sheet .sheet-option {
  background: transparent;
  box-shadow: none;
  transition: background 0.18s ease, box-shadow 0.18s ease;
}
ion-modal .modal-sheet .sheet-option:active {
  background: var(--md-surface-container-highest);
}
ion-modal .modal-sheet .sheet-option.is-selected {
  background: var(--md-surface-container-lowest);
  box-shadow: inset 0 0 0 2px var(--c-primary);
}
</style>
