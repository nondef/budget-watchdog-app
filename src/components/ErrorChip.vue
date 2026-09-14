<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { alertCircleOutline } from 'ionicons/icons'

defineProps<{ message?: string }>()
</script>

<template>
  <span
      v-if="message"
      class="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300 text-[11px] font-medium px-2 py-0.5 rounded-full"
  >
    <ion-icon :icon="alertCircleOutline" class="size-[13px]"/>
    {{ message }}
  </span>
</template>
