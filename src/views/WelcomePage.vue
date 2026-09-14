<script setup lang="ts">
import { IonPage, IonContent, IonFooter, IonToolbar, IonButton, IonIcon, useIonRouter } from '@ionic/vue';
import { arrowForwardOutline } from 'ionicons/icons';
import { useI18n } from "vue-i18n";

const ionRouter = useIonRouter();

const { t } = useI18n()

// push → ileri geçiş animasyonu oynar (Ionic 'replace'te animasyon atlar);
// welcome stack'te kalır, splash'tan geri tuşuyla buraya dönülebilir.
const proceed = () => ionRouter.push('/splash');
</script>

<template>
  <ion-page class="welcome-page">
    <ion-content :scroll-y="false">
      <div class="welcome-stage">
        <!-- Animasyonlu logo -->
        <div class="logo-wrap anim-logo">
          <div class="logo-glow" />
          <div class="logo-tile" aria-hidden="true">
            <img
              src="/brand/logo-light.png"
              alt=""
              class="logo-image logo-image--light"
            />
            <img
              src="/brand/logo-dark.png"
              alt=""
              class="logo-image logo-image--dark"
            />
          </div>
        </div>

        <!-- Uygulama adı -->
        <h1 class="app-name anim-name">{{ 'Budget Watchdog' }}</h1>

        <!-- Hoş geldin -->
        <p class="welcome-title anim-welcome">{{ t('welcomePage.title') }}</p>
        <p class="welcome-sub anim-sub">{{ t('welcomePage.subtitle') }}</p>
      </div>
    </ion-content>

    <!-- Başla butonu -->
    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <ion-button expand="block" class="app-button anim-cta" @click="proceed">
          {{ t('welcomePage.start') }}
          <ion-icon slot="end" :icon="arrowForwardOutline" class="size-4" />
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<style scoped>
.welcome-page,
.welcome-content {
  --background: var(--c-page);
}

.welcome-stage {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 2rem;
  text-align: center;
  user-select: none;
}

/* ── Logo ── */
.logo-wrap {
  position: relative;
  margin-bottom: 2rem;
}

.logo-glow {
  position: absolute;
  inset: -2.5rem;
  border-radius: 9999px;
  /* blur filtresi yerine radial-gradient: mobil WebView'de artefaktsız render */
  background: radial-gradient(circle, color-mix(in srgb, var(--c-content) 14%, transparent) 0%, transparent 70%);
  opacity: 0;
}

.logo-tile {
  position: relative;
  width: 7rem;
  height: 7rem;
  border-radius: 1.75rem;
  overflow: hidden;
  background: var(--c-surface-sunken);
  box-shadow: 0 18px 38px -22px var(--c-content-muted);
}

.logo-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.logo-image--dark {
  display: none;
}

html.ion-palette-dark .logo-image--light {
  display: none;
}

html.ion-palette-dark .logo-image--dark {
  display: block;
}

/* ── Metinler ── */
.app-name {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--c-content);
  margin: 0;
}

.welcome-title {
  margin: 1.25rem 0 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--c-content);
}

.welcome-sub {
  margin: 0.375rem 0 0;
  font-size: 14px;
  color: var(--c-content-muted);
}

/* ── Footer / CTA ── */
ion-footer ion-toolbar {
  --background: transparent;
  --border-width: 0;
  --border-color: transparent;
  --padding-top: 0;
}

/* ── Animasyonlar (kademeli giriş) ── */
.anim-logo {
  animation: logo-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
}

.anim-logo .logo-glow {
  animation: fade-in 0.8s ease 0.45s forwards;
}

.app-name.anim-name {
  animation: rise-in 0.6s cubic-bezier(0.32, 0.72, 0, 1) 0.55s both;
}

.welcome-title.anim-welcome {
  animation: rise-in 0.6s cubic-bezier(0.32, 0.72, 0, 1) 0.8s both;
}

.welcome-sub.anim-sub {
  animation: rise-in 0.6s cubic-bezier(0.32, 0.72, 0, 1) 1s both;
}

.anim-cta {
  animation: rise-in 0.6s cubic-bezier(0.32, 0.72, 0, 1) 1.25s both;
}

@keyframes logo-in {
  from { opacity: 0; transform: scale(0.6) translateY(12px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

@keyframes rise-in {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes fade-in {
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .anim-logo,
  .anim-logo .logo-glow,
  .app-name.anim-name,
  .welcome-title.anim-welcome,
  .welcome-sub.anim-sub,
  .anim-cta {
    animation: none;
  }
  .logo-glow { opacity: 1; }
}
</style>
