<script setup lang="ts">
import { IonPage, IonContent, IonRouterOutlet } from '@ionic/vue';
</script>

<template>
  <ion-page>
    <ion-content>
      <ion-router-outlet></ion-router-outlet>
    </ion-content>
  </ion-page>
</template>

<style scoped>
/* Header/toolbar opak sayfa zemini kullansın — şeffaf bırakılırsa içerik
   yukarı kaydırılınca toolbar arkasından yazılar görünüyordu. Dark mode'u
   global variables.css'teki kural ezer. */
:deep(ion-toolbar) {
  --background: var(--c-page);
}

:deep(ion-header) {
  background: var(--c-page);
}
</style>
