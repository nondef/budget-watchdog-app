<script setup lang="ts">
import { IonIcon } from '@ionic/vue'

defineProps<{
  icon: string
  label: string
  alignStart?: boolean
}>()
</script>

<template>
  <div class="flex px-4 py-3" :class="alignStart ? 'items-start' : 'items-center'">
    <ion-icon
        :icon="icon"
        class="size-5 text-content-faint shrink-0"
        :class="alignStart ? 'mt-0.5' : ''"
    />
    <div class="ml-3 flex-1 min-w-0">
      <p class="text-xs text-content-muted mb-0.5">{{ label }}</p>
      <div class="text-sm text-content font-medium">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>

</style>