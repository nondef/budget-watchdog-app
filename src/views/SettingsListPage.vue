<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  IonList,
  IonItem,
  IonTitle,
  IonHeader,
  IonToolbar,
  IonLabel,
    IonItemDivider,
    IonItemGroup
} from '@ionic/vue';
import {
  appsOutline,
  eyeOffOutline,
  shieldHalfOutline,
  notificationsOutline,
  shareOutline,
  moonOutline,
  cashOutline,
  informationCircleOutline,
  walletOutline,
  analyticsOutline,
  languageOutline,
  lockClosedOutline,
  chatbubblesOutline,
} from 'ionicons/icons';
import { appConfig } from '@/shared/config/app-config';
import { computed } from "vue";
import { useAccountsStore } from '@/stores/accounts';
import { useBackupReminder } from '@/composables/features/useBackupReminder';

/**
 * Yedek rozetinin ikinci durağı.
 *
 * Sekme çubuğundaki nokta (bkz. TabsPage) yalnızca "Ayarlar'da bakılacak bir şey
 * var" der; kullanıcı listeye girdiğinde iz kaybolursa hangi satır olduğunu
 * bulamaz. Aynı koşulu burada da göstermek zinciri tamamlıyor: nokta → satır →
 * Yedekleme ekranı.
 *
 * Koşul, Ana Sayfa kartı ve sekme noktasıyla AYNI (`shouldWarn`): çarpıya basmak
 * üçünü birden erteler, erteleme dolunca üçü birden geri gelir.
 */
const accountsStore = useAccountsStore();
const { shouldWarn: shouldWarnBackup } = useBackupReminder();

const backupBadgeVisible = computed(
    () => shouldWarnBackup(accountsStore.activeAccounts.length > 0)
);

interface MenuItem {
  icon: string
  tint: string
  key: string
  href: string
}

const financialManagementMenus: MenuItem[] = [
  {
    icon: walletOutline,
    tint: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400',
    key: 'accounts',
    href: '/settings/accounts'
  },
  {
    icon: appsOutline,
    tint: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
    key: 'categories',
    href: '/settings/categories'
  },
  {
    icon: cashOutline,
    tint: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    key: 'budgetGoals',
    href: '/settings/budget-goals'
  },
  {
    icon: walletOutline,
    tint: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    key: 'savingsGoals',
    href: '/settings/savings'
  },
  {
    icon: cashOutline,
    tint: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
    key: 'currencies',
    href: '/settings/currency'
  },
  {
    icon: analyticsOutline,
    tint: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
    key: 'market',
    href: '/settings/financial-indicators'
  },
]

const applicationMenus: MenuItem[] = [
  {
    icon: moonOutline,
    tint: 'bg-surface-sunken text-content-secondary dark:bg-red-gray-500/10 dark:text-neutral-400',
    key: 'theme',
    href: '/settings/theme'
  },
  {
    icon: languageOutline,
    tint: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400',
    key: 'language',
    href: '/settings/language'
  },
  {
    icon: shareOutline,
    tint: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400',
    key: 'backup',
    href: '/settings/backup'
  },
  {
    icon: eyeOffOutline,
    tint: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
    key: 'appearance',
    href: '/settings/appearance'
  },
  {
    icon: notificationsOutline,
    tint: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    key: 'notifications',
    href: '/settings/notifications'
  },
]

const accountSupportMenus: MenuItem[] = [
  {
    icon: shieldHalfOutline,
    tint: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    key: 'security',
    href: '/settings/security'
  },
  {
    icon: lockClosedOutline,
    tint: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
    key: 'privacy',
    href: '/settings/privacy'
  },
  {
    icon: chatbubblesOutline,
    tint: 'bg-surface-sunken text-content-secondary dark:bg-indigo-500/10 dark:text-gray-400',
    key: 'feedback',
    href: '/settings/feedback'
  },
  {
    icon: informationCircleOutline,
    tint: 'bg-surface-sunken text-content-secondary dark:bg-indigo-500/10 dark:text-gray-400',
    key: 'about',
    href: '/settings/about'
  },
]

const sections = computed(() => [
  { title: 'financial', items: financialManagementMenus },
  { title: 'app', items: applicationMenus },
  { title: 'support', items: accountSupportMenus },
])

</script>

<template>
  <ion-page>
    <!-- Üst bar -->
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain pb-3">
        <ion-title class="text-xl font-semibold">
          {{ $t('nav.settings') }}
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="settings-content" :scroll-y="true">
      <div class="mt-4 px-4 pb-10 space-y-5">
        <ion-item-group v-for="section in sections" :key="section.title">
          <ion-item-divider>
            <ion-label class="text-[11px] font-semibold uppercase tracking-wider text-content">
              {{ $t(`settings.sections.${section.title}`) }}</ion-label>
          </ion-item-divider>

          <ion-list class="settings-list bg-surface rounded-2xl">
            <ion-item
                v-for="(item, index) in section.items"
                :lines="index === section.items.length - 1 ? 'none' : 'full'"
                :key="item.href"
                :router-link="item.href"
                button
                class="settings-item"
            >
              <ion-icon slot="start" :class="item.tint" class="p-2.5 size-6 me-4 rounded-xl" :icon="item.icon"/>
              <ion-label>
                <h3>{{ $t(`settings.items.${item.key}.label`) }}</h3>
                <p>{{ $t(`settings.items.${item.key}.description`) }}</p>
              </ion-label>

              <!-- Sekme çubuğundaki noktanın satır karşılığı: kullanıcı listeye
                   girdiğinde hangi satırın beklediğini görsün. -->
              <span
                  v-if="item.key === 'backup' && backupBadgeVisible"
                  slot="end"
                  class="settings-badge"
                  :aria-label="$t('backup.reminder.action')"
              />
            </ion-item>
          </ion-list>
        </ion-item-group>

        <!-- Versiyon -->
        <p class="text-center text-[11px] text-slate-400 pt-2">
          {{ appConfig.name }} · v{{ appConfig.version }}
        </p>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
/* Sekme çubuğundaki rozetle aynı dil: sayısız amber nokta — "bakılacak bir şey
   var" der, sayı iddia etmez. */
.settings-badge {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgb(245 158 11); /* amber-500 */
  flex-shrink: 0;
}

ion-label > h3 {
  font-size: 15px;
  font-weight: 500;
  color: var(--c-content);
}

ion-label > p {
  font-size: 13px;
  font-weight: 400;
 color: var(--c-content-secondary);
}

/*ion-item-divider {
  --padding-start: 5px;
}*/

/*.settings-content {
  --background: var(--c-page);
}*/

/*ion-page {
  overflow: hidden;
}*/

/* ion-list'i tasarımdaki düz kart kabı gibi göstermek için
   Ionic'in varsayılan zemin/padding değerlerini sıfırla. */
.settings-list {
  background: var(--c-surface);
  padding: 0;
}

/* ion-item'i orijinal router-link satırıyla birebir aynı yap:
   tüm padding/min-height/zemin değerlerini iç div'e bırak. */
.settings-item {
  --background: transparent;
  --color: inherit;
  --padding-top: 2px;
  --padding-bottom: 2px;
  --padding-start: 20px;
  --padding-end: 13px;
  --inner-padding-start: 0;
  --inner-padding-end: 0;
  --min-height: 0;
  --border-color: var(--c-line);
}
</style>
