<script setup lang="ts">
import { IonPage, IonContent, IonIcon, IonButton, IonFooter, IonToolbar } from '@ionic/vue';
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  notificationsOutline,
  checkmarkCircle,
  chevronForwardOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import { useNotifier } from '@/composables/features/useNotifier';
import { markOnboardingPermissionsDone } from '@/shared/utils/platform';
import { useNotificationsStore } from '@/stores/notifications';
import { logger } from '@/infrastructure/logging';
import { useI18n } from "vue-i18n";

const router = useRouter();
const notifier = useNotifier();
const notificationStore = useNotificationsStore();
const { t } = useI18n()

/** Bir sonraki onboarding adımı. */
const NEXT_ROUTE = '/base-currency-selection';

interface PermItem {
  key: string;
  icon: string;
  tint: string;
  /** İzni iste — granted ise true döner. */
  request: () => Promise<boolean>;
  /** Mevcut durumu kontrol et. */
  check: () => Promise<boolean>;
  /** İzin verildiğinde ilgili özelliği aç. */
  onGranted?: () => Promise<void>;
}

// İleride kamera/biyometrik gibi izinler aynı listeye eklenebilir.
const items: PermItem[] = [
  {
    key: 'notifications',
    icon: notificationsOutline,
    tint: 'from-amber-500 to-orange-600',
    request: () => notifier.requestPermission(),
    check: () => notifier.checkPermission(),
    onGranted: async () => {
      // İzin verildiyse master switch de açılsın — aksi halde kullanıcı izni
      // verir ama Ayarlar'a girip ayrıca açması gerekir.
      notificationStore.prefs.pushEnabled = true;
      await notifier.resyncSchedules();
    },
  },
];

const granted = reactive<Record<string, boolean>>({});
const busy = ref(false);

onMounted(async () => {
  // Önce kayıtlı tercihler yüklenmeli; aksi halde initiliaze() sonradan
  // prefs'i komple değiştirip check() sonucunu ezer.
  await notificationStore.initiliaze();

  for (const item of items) {
    try {
      granted[item.key] = await item.check();
    } catch {
      granted[item.key] = false;
    }
  }
});

const proceed = () => {
  markOnboardingPermissionsDone();
  router.replace(NEXT_ROUTE);
};

const allowAndContinue = async () => {
  if (busy.value) return;
  busy.value = true;
  try {
    for (const item of items) {
      try {
        if (!granted[item.key]) {
          granted[item.key] = await item.request();
        }
        if (granted[item.key]) await item.onGranted?.();
      } catch (err) {
        logger.warn('İzin isteği başarısız', { context: 'permissions', error: err, data: { key: item.key } });
        granted[item.key] = false;
      }
    }
  } finally {
    busy.value = false;
    proceed();
  }
};

const skip = () => proceed();
</script>

<template>
  <ion-page>
    <ion-content class="perm-content" :scroll-y="true">
      <div class="flex flex-col min-h-full px-6 pt-[max(env(safe-area-inset-top),5rem)]">

        <!-- Hero -->
        <div class="flex flex-col items-center text-center mt-6 mb-8">
          <div class="relative mb-6">
            <div class="absolute -inset-6 rounded-full blur-3xl bg-indigo-500/20" />
            <div class="relative size-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-2xl">
              <ion-icon :icon="shieldCheckmarkOutline" class="size-10 text-white" />
            </div>
          </div>
          <h1 class="text-[24px] font-extrabold text-content leading-tight tracking-tight">
            {{ t('permissions.title') }}
          </h1>
          <p class="mt-3 text-[14px] text-content-muted leading-relaxed max-w-xs">
            {{ t('permissions.description') }}
          </p>
        </div>

        <!-- İzin listesi -->
        <div class="space-y-3">
          <div
            v-for="item in items"
            :key="item.key"
            class="flex items-start gap-3 bg-surface rounded-2xl p-4 border border-line"
          >
            <div
              class="size-11 rounded-2xl bg-gradient-to-br flex items-center justify-center shrink-0"
              :class="item.tint"
            >
              <ion-icon :icon="item.icon" class="size-5 text-white" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <h2 class="text-[15px] font-semibold text-content">{{ t('permissions.notifications.title') }}</h2>
                <ion-icon
                  v-if="granted[item.key]"
                  :icon="checkmarkCircle"
                  class="size-4 text-emerald-500"
                />
              </div>
              <p class="text-[12px] text-content-muted mt-0.5 leading-relaxed">
                {{ t('permissions.notifications.description') }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </ion-content>

    <ion-footer class="ion-no-border">
      <ion-toolbar>
        <ion-button
            expand="block"
            class="app-button"
            :disabled="busy"
            @click="allowAndContinue"
        >
          {{ busy ? $t('permissions.requesting') : $t('permissions.allowAndContinue') }}
          <ion-icon slot="end" :icon="chevronForwardOutline" class="size-4" />
        </ion-button>

        <button
            type="button"
            :disabled="busy"
            class="w-full h-12 mt-2 text-[14px] font-medium text-content-muted active:text-slate-900 disabled:opacity-60"
            @click="skip"
        >
          {{ t('permissions.notNow') }}
        </button>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<style scoped>
.perm-content {
  --background: var(--c-page);
}
</style>
