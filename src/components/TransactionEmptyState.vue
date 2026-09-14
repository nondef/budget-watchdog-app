<script setup lang="ts">

import { cashOutline } from "ionicons/icons";
import { IonIcon } from "@ionic/vue";
</script>

<template>
  <div
       class="flex flex-col items-center justify-center py-12">
    <IonIcon :icon="cashOutline" class="text-gray-300 text-6xl mb-4"/>
    <p class="text-content-muted text-center">
      {{ $t('transactions.emptyTitle') }}
      <br>
      {{ $t('transactions.emptyDesc') }}
    </p>
  </div>
</template>

<style scoped>

</style>