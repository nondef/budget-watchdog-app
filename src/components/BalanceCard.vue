<script setup lang="ts">
import { IonCard, IonIcon } from '@ionic/vue';
import { arrowUpOutline, arrowDownOutline, eyeOutline, eyeOffOutline } from 'ionicons/icons'
import { ref } from 'vue'

interface Props {
  totalBalance: string
  income: string
  expense: string
}

withDefaults(defineProps<Props>(), {
  totalBalance: '',
  expense: '',
  income: ''
})

const hidden = ref(false)
const mask = '••••••'
</script>

<template>
  <ion-card class="card-inverse relative block overflow-hidden rounded-2xl p-4 shadow-lg">
    <!-- Dekoratif blur -->
    <div class="pointer-events-none absolute -top-16 -right-16 size-40 rounded-full bg-emerald-500/20 blur-3xl" />
    <div class="pointer-events-none absolute -bottom-20 -left-12 size-40 rounded-full bg-indigo-500/20 blur-3xl" />

    <!-- Üst -->
    <div class="relative flex items-center justify-between">
      <div class="flex items-center gap-1.5">
        <span class="size-1.5 rounded-full bg-emerald-400 dark:bg-emerald-600 animate-pulse" />
        <p class="text-[10px] font-medium uppercase tracking-wider text-inverse-on-surface opacity-60">
          Toplam Bakiye
        </p>
      </div>
      <button
          class="hide-toggle rounded-full p-1.5 transition"
          @click="hidden = !hidden"
      >
        <ion-icon :icon="hidden ? eyeOffOutline : eyeOutline" class="size-3.5" />
      </button>
    </div>

    <!-- Ana tutar -->
    <h1 class="relative mt-1.5 text-3xl font-bold text-inverse-on-surface tabular-nums tracking-tight">
      {{ hidden ? mask : totalBalance }}
    </h1>

    <!-- Ayraç -->
    <div class="relative my-3 h-px bg-inverse-on-surface opacity-10" />

    <!-- Gelir/Gider tek satır -->
    <div class="relative flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <div class="flex size-6 items-center justify-center rounded-full bg-emerald-500/20">
          <ion-icon :icon="arrowUpOutline" class="size-3 text-emerald-400 dark:text-emerald-700" />
        </div>
        <div class="leading-tight">
          <p class="text-[10px] text-inverse-on-surface opacity-60">Gelir</p>
          <p class="text-xs font-semibold text-emerald-400 dark:text-emerald-700 tabular-nums">
            {{ hidden ? mask : income }}
          </p>
        </div>
      </div>

      <div class="h-8 w-px bg-inverse-on-surface opacity-10" />

      <div class="flex items-center gap-2">
        <div class="flex size-6 items-center justify-center rounded-full bg-rose-500/20">
          <ion-icon :icon="arrowDownOutline" class="size-3 text-rose-400 dark:text-rose-700" />
        </div>
        <div class="leading-tight">
          <p class="text-[10px] text-inverse-on-surface opacity-60">Gider</p>
          <p class="text-xs font-semibold text-rose-400 dark:text-rose-700 tabular-nums">
            {{ hidden ? mask : expense }}
          </p>
        </div>
      </div>
    </div>
  </ion-card>
</template>

<style scoped>
/* Göz butonu — inverse zemin üzerinde soluk ikon, hover'da tam kontrast.
   Tailwind opacity modifier'ı var() renklerde çalışmadığından state
   katmanı color-mix ile verildi. */
.hide-toggle {
  color: var(--c-inverse-on-surface);
  opacity: 0.6;
}

.hide-toggle:hover,
.hide-toggle:active {
  opacity: 1;
  background: color-mix(in srgb, var(--c-inverse-on-surface) 12%, transparent);
}
</style>
