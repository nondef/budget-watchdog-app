<script setup lang="ts">
import {
  IonBackButton,
  IonButtons,
  IonCard,
  IonContent,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import {
  chevronBackOutline,
  chevronForwardOutline,
  informationCircleOutline,
  lockClosedOutline,
} from 'ionicons/icons';
import { appConfig } from '@/shared/config/app-config';

const appInfo = {
  name: appConfig.name,
  version: appConfig.version,
  copyright: `© ${new Date().getFullYear()} ${appConfig.name}`,
};
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" :icon="chevronBackOutline" />
        </ion-buttons>

        <ion-title class="text-xl font-semibold">
          {{ $t('about.title') }}
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="about-content" :scroll-y="true">
      <div class="mt-5 px-4 pb-10 space-y-5">
        <ion-card class="card-filled rounded-2xl px-5 py-6">
          <div class="flex flex-col items-center text-center">
            <div class="brand-mark" aria-hidden="true">
              <img
                src="/brand/logo-light.png"
                alt=""
                class="brand-logo brand-logo--light"
              />
              <img
                src="/brand/logo-dark.png"
                alt=""
                class="brand-logo brand-logo--dark"
              />
            </div>

            <h1 class="mt-4 text-[22px] font-bold tracking-tight text-content">
              {{ appInfo.name }}
            </h1>
            <p class="mt-1 text-[12px] font-medium text-content-muted">
              {{ $t('about.version') }} {{ appInfo.version }}
            </p>
            <p class="mt-4 max-w-sm text-[13px] leading-relaxed text-content-tertiary">
              {{ $t('about.description') }}
            </p>
          </div>
        </ion-card>

        <section>
          <p class="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
            {{ $t('about.appInfo') }}
          </p>

          <ion-card class="card-filled rounded-2xl px-2">
            <div class="flex items-center gap-3 px-2 py-3">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-sunken">
                <ion-icon :icon="informationCircleOutline" class="size-[18px] text-content-secondary" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[14px] font-medium text-content">
                  {{ $t('about.versionLabel') }}
                </p>
                <p class="mt-0.5 text-[11px] text-content-muted">
                  {{ appInfo.version }}
                </p>
              </div>
            </div>

            <button
              type="button"
              class="flex w-full items-center gap-3 border-t border-line px-2 py-3 text-left transition active:bg-surface-sunken"
              @click="$router.push('/settings/privacy')"
            >
              <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-sunken">
                <ion-icon :icon="lockClosedOutline" class="size-[18px] text-content-secondary" />
              </div>
              <p class="min-w-0 flex-1 text-[14px] font-medium text-content">
                {{ $t('about.privacyPolicy') }}
              </p>
              <ion-icon :icon="chevronForwardOutline" class="size-4 shrink-0 text-content-muted" />
            </button>
          </ion-card>
        </section>

        <div class="px-4 text-center text-[11px] leading-relaxed text-content-muted">
          <p>{{ appInfo.copyright }}</p>
          <p>{{ $t('about.allRightsReserved') }}</p>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.about-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}

.brand-mark {
  width: 112px;
  height: 112px;
  border-radius: 28px;
  overflow: hidden;
  background: var(--c-surface-sunken);
}

.brand-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.brand-logo--dark {
  display: none;
}

html.ion-palette-dark .brand-logo--light {
  display: none;
}

html.ion-palette-dark .brand-logo--dark {
  display: block;
}
</style>
