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
  tone: 'accounts' | 'language' | 'theme' | 'feedback' | 'about' | 'categories' | 'appearance' | 'success' | 'warning' | 'info' | 'danger'
  key: string
  href: string
}

const financialManagementMenus: MenuItem[] = [
  {
    icon: walletOutline,
    tone: 'accounts',
    key: 'accounts',
    href: '/settings/accounts'
  },
  {
    icon: appsOutline,
    tone: 'categories',
    key: 'categories',
    href: '/settings/categories'
  },
  {
    icon: cashOutline,
    tone: 'success',
    key: 'budgetGoals',
    href: '/settings/budget-goals'
  },
  {
    icon: walletOutline,
    tone: 'warning',
    key: 'savingsGoals',
    href: '/settings/savings'
  },
  {
    icon: cashOutline,
    tone: 'info',
    key: 'currencies',
    href: '/settings/currency'
  },
  {
    icon: analyticsOutline,
    tone: 'danger',
    key: 'market',
    href: '/settings/financial-indicators'
  },
]

const applicationMenus: MenuItem[] = [
  {
    icon: moonOutline,
    tone: 'theme',
    key: 'theme',
    href: '/settings/theme'
  },
  {
    icon: languageOutline,
    tone: 'language',
    key: 'language',
    href: '/settings/language'
  },
  {
    icon: shareOutline,
    tone: 'info',
    key: 'backup',
    href: '/settings/backup'
  },
  {
    icon: eyeOffOutline,
    tone: 'appearance',
    key: 'appearance',
    href: '/settings/appearance'
  },
  {
    icon: notificationsOutline,
    tone: 'warning',
    key: 'notifications',
    href: '/settings/notifications'
  },
]

const accountSupportMenus: MenuItem[] = [
  {
    icon: shieldHalfOutline,
    tone: 'success',
    key: 'security',
    href: '/settings/security'
  },
  {
    icon: lockClosedOutline,
    tone: 'danger',
    key: 'privacy',
    href: '/settings/privacy'
  },
  {
    icon: chatbubblesOutline,
    tone: 'feedback',
    key: 'feedback',
    href: '/settings/feedback'
  },
  {
    icon: informationCircleOutline,
    tone: 'about',
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
      <ion-toolbar class="toolbar-plain">
        <ion-title class="text-xl font-semibold">
          {{ $t('nav.settings') }}
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="settings-content" :scroll-y="true">
      <main class="mx-auto w-full max-w-xl space-y-6 px-4 pb-12 pt-5">
        <ion-item-group v-for="section in sections" :key="section.title" class="settings-group">
          <ion-item-divider class="settings-section">
            <ion-label>
              {{ $t(`settings.sections.${section.title}`) }}</ion-label>
          </ion-item-divider>

          <ion-list class="settings-list settings-card">
            <ion-item
                v-for="(item, index) in section.items"
                :lines="index === section.items.length - 1 ? 'none' : 'full'"
                :key="item.href"
                :router-link="item.href"
                button
                detail
                class="settings-item"
            >
              <div slot="start" class="settings-icon" :class="`settings-icon--${item.tone}`">
                <ion-icon :icon="item.icon"/>
              </div>
              <ion-label class="settings-item-label ion-text-wrap">
                <h3>{{ $t(`settings.items.${item.key}.label`) }}</h3>
                <p>{{ $t(`settings.items.${item.key}.description`) }}</p>
              </ion-label>

              <!-- Sekme çubuğundaki noktanın satır karşılığı: kullanıcı listeye
                   girdiğinde hangi satırın beklediğini görsün. -->
              <transition name="icon-swap">
                <span
                    v-if="item.key === 'backup' && backupBadgeVisible"
                    slot="end"
                    class="settings-badge"
                    :aria-label="$t('backup.reminder.action')"
                />
              </transition>
            </ion-item>
          </ion-list>
        </ion-item-group>

        <!-- Versiyon -->
        <p class="pt-1 text-center text-[11px] font-medium text-content-faint">
          {{ appConfig.name }} · v{{ appConfig.version }}
        </p>
      </main>
    </ion-content>
  </ion-page>
</template>

<style scoped>
/* Sekme çubuğundaki rozetle aynı dil: sayısız amber nokta — "bakılacak bir şey
   var" der, sayı iddia etmez. */
.settings-badge {
  width: 8px;
  height: 8px;
  margin-inline-end: 10px;
  border-radius: 999px;
  background: rgb(245 158 11); /* amber-500 */
  box-shadow: 0 0 0 4px color-mix(in srgb, rgb(245 158 11) 18%, transparent);
  flex-shrink: 0;
}

.settings-item-label > h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  color: var(--c-content);
}

.settings-item-label > p {
  margin: 3px 0 0;
  font-size: 11px;
  font-weight: 400;
  line-height: 16px;
  color: var(--c-content-muted);
}

/* ion-list'i tasarımdaki düz kart kabı gibi göstermek için
   Ionic'in varsayılan zemin/padding değerlerini sıfırla. */
.settings-list {
  background: var(--c-surface);
  padding: 0;
}

.settings-card {
  overflow: hidden;
  border: 1px solid var(--c-line);
  border-radius: 18px;
  box-shadow: 0 5px 18px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.settings-section {
  min-height: 0;
  margin: 0 0 9px;
  padding: 0 4px;
  --background: transparent;
  --color: var(--c-content-muted);
  --inner-padding-end: 0;
}

.settings-section ion-label {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

/* Her grupta ikon, metin ve ok aynı dikey merkezde hizalanır. */
.settings-item {
  --background: transparent;
  --background-activated: var(--c-surface-sunken);
  --background-focused: var(--c-surface-sunken);
  --background-hover: transparent;
  --color: inherit;
  --padding-top: 2px;
  --padding-bottom: 2px;
  --padding-start: 14px;
  --padding-end: 10px;
  --inner-padding-start: 0;
  --inner-padding-end: 8px;
  --min-height: 68px;
  --border-color: var(--c-line);
  --detail-icon-color: var(--c-content-muted);
  --detail-icon-opacity: 0.8;
}

.settings-item::part(native) {
  align-items: center;
}

.settings-item .settings-item-label {
  flex: 1;
  min-width: 0;
  margin: 12px 0;
  align-self: center;
}

.settings-item .settings-badge {
  align-self: center;
  margin-block: 0;
}

.settings-icon {
  display: flex;
  width: 40px;
  height: 40px;
  margin-block: 0;
  margin-inline-start: 0;
  margin-inline-end: 12px;
  flex-shrink: 0;
  align-self: center;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 13px;
}

.settings-icon ion-icon {
  display: block;
  width: 18px;
  height: 18px;
  font-size: 18px;
}

.settings-icon--accounts,
.settings-icon--language,
.settings-icon--theme,
.settings-icon--feedback,
.settings-icon--categories,
.settings-icon--appearance,
.settings-icon--about {
  background: color-mix(in srgb, var(--settings-icon-accent) 12%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, var(--settings-icon-accent) 24%, var(--c-line));
  color: var(--settings-icon-accent);
}

.settings-icon--accounts {
  --settings-icon-accent: #8a651d;
}

.settings-icon--language {
  --settings-icon-accent: #0f766e;
}

.settings-icon--theme {
  --settings-icon-accent: #4338ca;
}

.settings-icon--feedback {
  --settings-icon-accent: #be185d;
}

.settings-icon--about {
  --settings-icon-accent: #1d4ed8;
}

:global(.ion-palette-dark .settings-icon--accounts) {
  --settings-icon-accent: #e3bc65;
}

:global(.ion-palette-dark .settings-icon--language) {
  --settings-icon-accent: #5eead4;
}

:global(.ion-palette-dark .settings-icon--theme) {
  --settings-icon-accent: #a5b4fc;
}

:global(.ion-palette-dark .settings-icon--feedback) {
  --settings-icon-accent: #f9a8d4;
}

:global(.ion-palette-dark .settings-icon--about) {
  --settings-icon-accent: #93c5fd;
}

.settings-icon--categories {
  --settings-icon-accent: #7c3aed;
}

.settings-icon--appearance {
  --settings-icon-accent: #c2410c;
}

:global(.ion-palette-dark .settings-icon--categories) {
  --settings-icon-accent: #c4b5fd;
}

:global(.ion-palette-dark .settings-icon--appearance) {
  --settings-icon-accent: #fdba74;
}

.settings-icon--success {
  background: color-mix(in srgb, #16a34a 11%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, #16a34a 24%, var(--c-line));
  color: #15803d;
}

.settings-icon--warning {
  background: color-mix(in srgb, #f59e0b 13%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, #f59e0b 26%, var(--c-line));
  color: #b45309;
}

.settings-icon--info {
  background: color-mix(in srgb, #0284c7 11%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, #0284c7 24%, var(--c-line));
  color: #0369a1;
}

.settings-icon--danger {
  background: color-mix(in srgb, var(--c-error) 10%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, var(--c-error) 22%, var(--c-line));
  color: var(--c-error);
}

:global(html.ion-palette-dark .settings-icon--success) {
  color: #86efac;
}

:global(html.ion-palette-dark .settings-icon--warning) {
  color: #fcd34d;
}

:global(html.ion-palette-dark .settings-icon--info) {
  color: #7dd3fc;
}
</style>
