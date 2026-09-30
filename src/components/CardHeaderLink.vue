<script setup lang="ts">
import { IonIcon } from '@ionic/vue';
import { chevronForwardOutline } from 'ionicons/icons';

/**
 * Ana sayfa kartlarının başlığındaki "Tümü ›" kısayolu. Kartın özetlediği
 * içeriğin tam sayfasına götürür; her kartta aynı görünsün diye tek yerde.
 */
defineProps<{
  to: string
  label: string
}>()
</script>

<template>
  <router-link
      :to="to"
      class="card-header-link inline-flex h-7 shrink-0 items-center gap-0.5 rounded-full pl-2.5 pr-1.5 text-[12px] font-medium text-content-muted transition active:bg-surface-strong"
  >
    {{ label }}
    <ion-icon :icon="chevronForwardOutline" class="size-3.5" />
  </router-link>
</template>
