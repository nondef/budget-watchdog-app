<script setup lang="ts">
import {
  IonBackButton,
  IonButtons,
  IonCard,
  IonItem,
  IonLabel,
  IonList,
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
  <ion-page class="design-page">
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
      <div class="mx-auto mt-5 w-full max-w-xl px-4 pb-10 space-y-5">
        <ion-card class="about-hero px-5 py-6">
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

          <ion-card class="about-list-card">
            <ion-list lines="full">
            <ion-item class="about-item" :button="false">
              <div slot="start" class="about-item__icon">
                <ion-icon :icon="informationCircleOutline" class="size-[18px] text-content-secondary" />
              </div>
              <ion-label>
                <p class="text-[14px] font-medium text-content">
                  {{ $t('about.versionLabel') }}
                </p>
                <p class="mt-0.5 text-[11px] text-content-muted">
                  {{ appInfo.version }}
                </p>
              </ion-label>
            </ion-item>

            <ion-item
              class="about-item"
              button
              :detail="false"
              @click="$router.push('/settings/privacy')"
            >
              <div slot="start" class="about-item__icon">
                <ion-icon :icon="lockClosedOutline" class="size-[18px] text-content-secondary" />
              </div>
              <ion-label class="text-[14px] font-medium text-content">
                {{ $t('about.privacyPolicy') }}
              </ion-label>
              <ion-icon slot="end" :icon="chevronForwardOutline" class="size-4 shrink-0 text-content-muted" />
            </ion-item>
            </ion-list>
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
  border: 1px solid var(--c-line);
  box-shadow: 0 10px 26px color-mix(in srgb, var(--c-content) 10%, transparent);
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

.about-hero,
.about-list-card {
  margin: 0;
  border: 1px solid var(--c-line);
  border-radius: 1.25rem;
  background: var(--c-surface);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.about-hero {
  background: linear-gradient(145deg, var(--c-surface), var(--c-surface-sunken));
}

.about-list-card {
  overflow: hidden;
}

.about-list-card ion-list {
  padding: 0;
  background: transparent;
}

.about-item {
  --background: transparent;
  --background-activated: var(--c-surface-sunken);
  --border-color: var(--c-line);
  --padding-start: 14px;
  --inner-padding-end: 14px;
  --min-height: 64px;
}

.about-item__icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--c-line);
  border-radius: 12px;
  background: var(--c-surface-sunken);
}
</style>
