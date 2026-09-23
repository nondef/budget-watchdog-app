<script setup lang="ts">
import { IonBackButton, IonButtons, IonHeader, IonTitle, IonToolbar } from '@ionic/vue'
import { chevronBackOutline } from 'ionicons/icons'

/**
 * Alt sayfaların (ayar ekranları + form sayfaları) ortak üst barı.
 *
 * On dört sayfa aynı 12 satırı kopyalıyordu; geri butonunun ikonu veya
 * başlığın tipografisi değişince on dört yerde birden düzeltmek gerekiyordu. Sağdaki aksiyon butonları sayfaya özgü olduğu için `end`
 * slot'undan geliyor — slot boşsa `ion-buttons` hiç basılmaz, böylece
 * aksiyonsuz sayfalarda başlık ortalaması bozulmaz.
 */
defineProps<{
    /** Başlık metni — çağıran `$t(...)` ile çözülmüş halini verir. */
    title: string
    /** Geri yığını boşsa (derin link / yeniden açılış) dönülecek rota. */
    defaultHref?: string
}>()
</script>

<template>
    <ion-header class="ion-no-border">
        <ion-toolbar class="toolbar-plain">
            <ion-buttons slot="start">
                <ion-back-button :default-href="defaultHref ?? '/tabs/settings'" :icon="chevronBackOutline"/>
            </ion-buttons>

            <ion-title class="text-xl font-semibold">
                {{ title }}
            </ion-title>

            <ion-buttons v-if="$slots.end" slot="end">
                <slot name="end"/>
            </ion-buttons>
        </ion-toolbar>
    </ion-header>
</template>
