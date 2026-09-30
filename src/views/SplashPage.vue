<script setup lang="ts">
import { ref, computed } from 'vue';
// ion-header/toolbar/buttons/footer şablonda kullanılıyor ama import edilmemişti;
// konsol her açılışta "Failed to resolve component" uyarısı basıyordu.
import {
  IonPage,
  IonContent,
  IonIcon,
  IonButton,
  IonButtons,
  IonHeader,
  IonToolbar,
  IonFooter,
  useIonRouter
} from '@ionic/vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Swiper, SwiperSlide } from 'swiper/vue';
import type { Swiper as SwiperType } from 'swiper';
import 'swiper/css';
import SwapText from '@/components/SwapText.vue';
import {
  walletOutline,
  pieChartOutline,
  flagOutline,
  sparklesOutline,
  shieldCheckmarkOutline,
  chevronForwardOutline,
  chevronBackOutline,
} from 'ionicons/icons'

import { isOnboardingPermissionsDone } from '@/shared/utils/platform';

const router = useRouter();
const ionRouter = useIonRouter();
const { tm } = useI18n();
const activeIndex = ref(0);
const swiperInstance = ref<SwiperType | null>(null);

/** İzin ekranı henüz gösterilmediyse oraya, gösterildiyse para birimine geç. */
const afterSplashRoute = () =>
  isOnboardingPermissionsDone() ? '/base-currency-selection' : '/permissions';

const slideVisuals = [
  { icon: walletOutline, tint: 'from-indigo-500 to-violet-600', glow: 'rgba(99, 102, 241, 0.20)' },
  { icon: pieChartOutline, tint: 'from-emerald-500 to-teal-600', glow: 'rgba(16, 185, 129, 0.20)' },
  { icon: flagOutline, tint: 'from-amber-500 to-orange-600', glow: 'rgba(245, 158, 11, 0.20)' },
  { icon: sparklesOutline, tint: 'from-fuchsia-500 to-pink-600', glow: 'rgba(217, 70, 239, 0.20)' },
  { icon: shieldCheckmarkOutline, tint: 'from-slate-700 to-slate-900', glow: 'rgba(100, 116, 139, 0.20)' },
]

const slides = computed(() => {
  const texts = tm('splash.slides') as { title: string; description: string }[]
  return slideVisuals.map((v, i) => ({ ...v, ...texts[i] }))
})

const onSwiper = (swiper: SwiperType) => {
  swiperInstance.value = swiper;
};

const onSlideChange = (swiper: SwiperType) => {
  activeIndex.value = swiper.activeIndex;
};

const swipeTo = (index: number) => {
  swiperInstance.value?.slideTo(index);
};

const next = () => {
  if (activeIndex.value < slides.value.length - 1) {
    swiperInstance.value?.slideNext();
  } else {
    router.push(afterSplashRoute());
  }
};

const skip = () => router.push(afterSplashRoute());

const isLast = () => activeIndex.value === slides.value.length - 1;

// Geri tuşu her zaman welcome'a döner — slayt'la ilgisi yok. Stack'te welcome
// varsa pop (animasyonlu); yoksa (sayfa yenilendiğinde stack sıfırlanır)
// welcome'a geri yönünde git. Böylece refresh sonrası da çalışır ve görünür.
const back = () => {
  if (ionRouter.canGoBack()) {
    ionRouter.back();
  } else {
    ionRouter.navigate('/welcome', 'back', 'replace');
  }
};
</script>

<template>
  <ion-page class="splash-page">
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button shape="round" @click="back" class="skip-button" :aria-label="$t('common.back')">
            <ion-icon slot="icon-only" :icon="chevronBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <transition name="fade">
            <ion-button shape="round" @click="skip" class="skip-button" v-if="!isLast()">
              {{ $t('splash.skip') }}
            </ion-button>
          </transition>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="splash-content" :scroll-y="false">
      <div class="flex flex-col h-full">
        <!-- Carousel -->
        <swiper
            class="flex-1 w-full"
            :slides-per-view="1"
            @swiper="onSwiper"
            @slide-change="onSlideChange"
        >
          <swiper-slide
              v-for="(slide, idx) in slides"
              :key="idx"
              class="flex flex-col items-center justify-center px-6 py-4"
          >
            <!-- Hero ikon -->
            <div class="relative mb-12 w-fit mx-auto">
              <div
                  class="absolute -inset-8 rounded-full"
                  :style="{ background: `radial-gradient(circle, ${slide.glow} 0%, transparent 70%)` }"
              />
              <div
                  class="relative size-28 rounded-3xl bg-gradient-to-br flex items-center justify-center shadow-2xl"
                  :class="slide.tint"
              >
                <ion-icon :icon="slide.icon" class="size-14 text-white" />
              </div>
            </div>

            <!-- Başlık + açıklama -->
            <div class="text-center max-w-sm">
              <h1 class="text-[28px] font-extrabold text-content leading-tight tracking-tight whitespace-pre-line">
                {{ slide.title }}
              </h1>
              <p class="mt-4 text-[14px] text-content-muted leading-relaxed">
                {{ slide.description }}
              </p>
            </div>
          </swiper-slide>
        </swiper>


      </div>
    </ion-content>

    <!-- Footer -->
    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <div class="flex items-center justify-center gap-1.5 mb-8">
          <button
              v-for="(_, idx) in slides"
              :key="idx"
              type="button"
              class="rounded-full transition-all duration-300"
              :class="activeIndex === idx
                    ? 'w-6 h-2 bg-indigo-600'
                    : 'size-2 bg-slate-300 active:bg-slate-400'"
              @click="swipeTo(idx)"
              :aria-label="$t('splash.pageAria', { num: idx + 1 })"
          />
        </div>

        <!-- CTA -->
        <ion-button
            expand="block"
            class="app-button"
            @click="next"
        >
          <swap-text :text="isLast() ? $t('splash.start') : $t('splash.continue')" />
          <ion-icon slot="end" :icon="chevronForwardOutline" class="size-4" />
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<style scoped>
/* Header/footer şeffaflığı ve hairline'ların kaldırılması global
   theme/patterns/splash.css'te; burada yalnızca sayfaya özgü kurallar var. */

/* Zemin yalnızca ana kapsayıcıda; içerik şeffaf kalıp onu gösterir. */
.splash-page {
  background: var(--ion-background-color, #ffffff);
}

.splash-content {
  --background: transparent;
}

/* MD header'ın box-shadow'u (splash.css yalnızca ::after'ı kapatıyor). */
.splash-page ion-header {
  box-shadow: none;
}

:deep(.swiper) {
  width: 100%;
  height: 100%;
}
</style>
