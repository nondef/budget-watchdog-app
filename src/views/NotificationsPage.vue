<script setup lang="ts">
import {
  IonPage, IonContent, IonIcon, IonDatetime, IonDatetimeButton, IonModal,
  IonToolbar, IonHeader, IonBackButton, IonTitle, IonButtons, IonLabel, IonToggle, IonItem, IonList, IonNote
} from '@ionic/vue';
import {
  notificationsOutline,
  timeOutline,
  chevronBackOutline,
  walletOutline,
  pieChartOutline,
  trophyOutline, informationCircleOutline, shieldCheckmarkOutline,
} from 'ionicons/icons';
import { computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useNotificationsStore } from '@/stores/notifications';
import { useNotifier } from '@/composables/features/useNotifier';
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { ALERT_ROLE, useAlert } from "@/composables/ui/useAlert";

const { t } = useI18n();
const alert = useAlert()

const notificationStore = useNotificationsStore()
const { prefs } = storeToRefs(notificationStore);
const notifier = useNotifier();

const pushDisabled = computed(() => !prefs.value.pushEnabled);

const haptic = () => Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});

const showPermissionDeniedAlert = async () => {
  // Bilgilendirme; onay/iptal seçeneği yok — confirm iki butonlu açılıyordu.
  const handle = await alert.showAlert({
    header: t('notifications.permissionRequired'),
    message: t('notifications.permissionDeniedMsg'),
    buttons: [{ text: t('notifications.ok'), role: ALERT_ROLE.confirm }],
  });

  await handle.onDidDismiss();
};

watch(() => prefs.value.pushEnabled, async (enabled, wasEnabled) => {
  if (!notificationStore.loaded) {
    return
  }

  if (enabled === wasEnabled) {
    return
  }

  haptic()

  if (enabled) {
    const granted = await notifier.requestPermission()

    if (!granted) {
      prefs.value.pushEnabled = false
      await showPermissionDeniedAlert()
      return
    }

    await notifier.resyncSchedules()
    return
  }

  await notifier.cancelAll()
})

// Cüzdan hatırlatıcısının kendisi veya saati değişince schedule yeniden kurulur.
watch(
    () => [prefs.value.walletReminder.enabled, prefs.value.walletReminder.time],
    async () => {
      if (!notificationStore.loaded) return;
      if (prefs.value.pushEnabled) await notifier.scheduleWalletReminder();
    },
);

// Yedek hatırlatıcısı açılıp kapanınca da schedule yeniden kurulur; aksi halde
// kullanıcı kapatsa bile kurulu olan haftalık bildirim çıkmaya devam ederdi.
watch(
    () => prefs.value.backupReminder,
    async () => {
      if (!notificationStore.loaded) return;
      if (prefs.value.pushEnabled) await notifier.scheduleBackupReminder();
    },
);

// Aynı gerekçe erteleme bitiş bildirimi için: anahtar kapatıldığında kurulu olan
// tek seferlik kayıt iptal edilmezse, kullanıcı kapatmış olmasına rağmen
// ertelemenin bittiği gün bildirim düşerdi.
watch(
    () => prefs.value.backupSnoozeEndReminder,
    async () => {
      if (!notificationStore.loaded) return;
      if (prefs.value.pushEnabled) await notifier.scheduleBackupSnoozeEndReminder();
    },
);

const reminderIso = computed(() => `2000-01-01T${prefs.value.walletReminder.time}:00`);

const onReminderTimeChange = (event: CustomEvent) => {
  const match = (event.detail.value as string)?.match(/T(\d{2}:\d{2})/);
  if (match) prefs.value.walletReminder.time = match[1];
};


onMounted(async () => {
  await notificationStore.initiliaze()

  // Kullanıcı sistem ayarlarından izni kapatmış olabilir: ana anahtar açık
  // görünüp hiçbir bildirim gelmemesindense anahtarı gerçeğe hizalıyoruz.
  const granted = await notifier.checkPermission();
  if (!granted && prefs.value.pushEnabled) {
    prefs.value.pushEnabled = false;
  }
});
</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar class="toolbar-plain">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/settings" :icon="chevronBackOutline"/>
        </ion-buttons>

        <ion-title class="text-xl font-semibold">
          {{ $t('notifications.title') }}
        </ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" class="notif-content" :scroll-y="true">
      <div class="px-4 pb-10">

        <!-- Ana anahtar -->
        <div class="notif-card mt-5">
          <ion-list :inset="false" lines="none">
            <ion-item class="plain-item" :button="false">
              <div slot="start" class="notif-tint bg-indigo-50">
                <ion-icon :icon="notificationsOutline" class="size-[18px] text-indigo-600" />
              </div>
              <ion-label>
                <h3 class="notif-title">{{ $t('notifications.enable') }}</h3>
                <p class="notif-sub">{{ $t('notifications.enableDesc') }}</p>
              </ion-label>
              <ion-toggle
                  slot="end"
                  class="plain-toggle"
                  v-model="prefs.pushEnabled"
                  :aria-label="$t('notifications.enable')"
              />
            </ion-item>
          </ion-list>
        </div>

        <div :class="{ 'notif-disabled': pushDisabled }">

          <!-- Hatırlatıcılar -->
          <h2 class="notif-section">{{ $t('notifications.reminders') }}</h2>

          <div class="notif-card">
            <ion-list :inset="false" lines="full">
              <ion-item class="plain-item" :button="false">
                <div slot="start" class="notif-tint bg-sky-50">
                  <ion-icon :icon="walletOutline" class="size-[18px] text-sky-600" />
                </div>
                <ion-label>
                  <h3 class="notif-title">{{ $t('notifications.walletReminder') }}</h3>
                  <p class="notif-sub">{{ $t('notifications.walletReminderDesc') }}</p>
                </ion-label>
                <ion-toggle
                    slot="end"
                    class="plain-toggle"
                    v-model="prefs.walletReminder.enabled"
                    :aria-label="$t('notifications.walletReminder')"
                    @ion-change="haptic"
                />
              </ion-item>

              <ion-item v-if="prefs.walletReminder.enabled" class="plain-item" lines="none" :button="false">
                <div slot="start" class="notif-tint bg-surface-sunken">
                  <ion-icon :icon="timeOutline" class="size-[18px] text-content-secondary" />
                </div>
                <ion-label>
                  <h3 class="notif-title">{{ $t('notifications.reminderTime') }}</h3>
                  <p class="notif-sub">{{ $t('notifications.reminderTimeDesc') }}</p>
                </ion-label>
                <ion-datetime-button slot="end" datetime="wallet-reminder-time" />
              </ion-item>
            </ion-list>
          </div>

          <!-- Uyarılar -->
          <h2 class="notif-section">{{ $t('notifications.alerts') }}</h2>

          <div class="notif-card">
            <ion-list :inset="false" lines="full">
              <ion-item class="plain-item" :button="false">
                <div slot="start" class="notif-tint bg-amber-50">
                  <ion-icon :icon="pieChartOutline" class="size-[18px] text-amber-600" />
                </div>
                <ion-label>
                  <h3 class="notif-title">{{ $t('notifications.budget') }}</h3>
                  <p class="notif-sub">{{ $t('notifications.budgetDesc') }}</p>
                </ion-label>
                <ion-toggle
                    slot="end"
                    class="plain-toggle"
                    v-model="prefs.budgetAlerts"
                    :aria-label="$t('notifications.budget')"
                    @ion-change="haptic"
                />
              </ion-item>

              <ion-item class="plain-item" lines="none" :button="false">
                <div slot="start" class="notif-tint bg-violet-50">
                  <ion-icon :icon="trophyOutline" class="size-[18px] text-violet-600" />
                </div>
                <ion-label>
                  <h3 class="notif-title">{{ $t('notifications.goal') }}</h3>
                  <p class="notif-sub">{{ $t('notifications.goalDesc') }}</p>
                </ion-label>
                <ion-toggle
                    slot="end"
                    class="plain-toggle"
                    v-model="prefs.goalAlerts"
                    :aria-label="$t('notifications.goal')"
                    @ion-change="haptic"
                />
              </ion-item>

              <!-- Diğerlerinden farklı olarak bu bir kolaylık değil veri kaybı
                   önlemi: cihaz yedeği kapalı, telefon kaybı = kalıcı kayıp. -->
              <ion-item class="plain-item" lines="none" :button="false">
                <div slot="start" class="notif-tint bg-sky-50">
                  <ion-icon :icon="shieldCheckmarkOutline" class="size-[18px] text-sky-600" />
                </div>
                <ion-label>
                  <h3 class="notif-title">{{ $t('notifications.backupReminder') }}</h3>
                  <p class="notif-sub">{{ $t('notifications.backupReminderDesc') }}</p>
                </ion-label>
                <ion-toggle
                    slot="end"
                    class="plain-toggle"
                    v-model="prefs.backupReminder"
                    :aria-label="$t('notifications.backupReminder')"
                    @ion-change="haptic"
                />
              </ion-item>

              <!-- Yukarıdakinden ayrı anahtar: haftalık dırdırı kapatan
                   kullanıcı, kendi ertelediği hatırlatmanın geri geldiğini yine
                   de duymak isteyebilir — ve tersi. -->
              <ion-item class="plain-item" lines="none" :button="false">
                <div slot="start" class="notif-tint bg-sky-50">
                  <ion-icon :icon="timeOutline" class="size-[18px] text-sky-600" />
                </div>
                <ion-label>
                  <h3 class="notif-title">{{ $t('notifications.backupSnoozeEnd') }}</h3>
                  <p class="notif-sub">{{ $t('notifications.backupSnoozeEndDesc') }}</p>
                </ion-label>
                <ion-toggle
                    slot="end"
                    class="plain-toggle"
                    v-model="prefs.backupSnoozeEndReminder"
                    :aria-label="$t('notifications.backupSnoozeEnd')"
                    @ion-change="haptic"
                />
              </ion-item>
            </ion-list>
          </div>
        </div>

        <!-- Bilgi notu -->
        <div class="notif-note">
          <ion-icon :icon="informationCircleOutline" class="size-[16px] shrink-0 mt-0.5" />
          <ion-note class="notif-note__text">{{ $t('notifications.footnote') }}</ion-note>
        </div>
      </div>

      <!-- Saat seçici: keep-contents-mounted, datetime-button ile eşleşsin diye -->
      <ion-modal :keep-contents-mounted="true">
        <ion-datetime
            id="wallet-reminder-time"
            presentation="time"
            :value="reminderIso"
            @ion-change="onReminderTimeChange"
        />
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.notif-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}

/* Kart: ion-list'i saran yüzey — köşeler kartta, satırlar şeffaf.
   Renkler tokenlardan geldiği için light/dark otomatik uyumlu. */
.notif-card {
  background: var(--c-surface);
  border-radius: 1rem;
  overflow: hidden;
}

.notif-card ion-list {
  background: transparent;
  padding: 0;
  margin: 0;
}

.notif-card ion-item.plain-item {
  --background: transparent;
  --background-activated: var(--c-surface-sunken);
  --background-focused: var(--c-surface-sunken);
  --background-hover: transparent;
  --border-color: var(--c-line);
  --padding-start: 14px;
  --inner-padding-end: 14px;
  --min-height: 66px;
}

/* İkon tint kutusu — pastel sınıflar variables.css'te yarı şeffaf
   hue tint'e bağlı olduğu için dark modda da doğru görünür. */
.notif-tint {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-inline-end: 12px;
  flex-shrink: 0;
}

.notif-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--c-content);
}

.notif-sub {
  font-size: 12px;
  color: var(--c-content-muted);
  margin-top: 2px;
  white-space: normal;
}

.notif-section {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--c-content-tertiary);
  margin: 24px 4px 8px;
}

/* Ana anahtar kapalıyken alt bölümler pasif görünür ve tıklanamaz. */
.notif-disabled {
  opacity: 0.45;
  pointer-events: none;
}

.notif-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 20px;
  padding: 12px 14px;
  border-radius: 1rem;
  background: var(--c-surface);
  color: var(--c-content-muted);
}

.notif-note__text {
  font-size: 12px;
  line-height: 1.45;
  color: var(--c-content-tertiary);
}

/* Saat butonu kart diliyle aynı yüzeyde dursun */
ion-datetime-button::part(native) {
  background: var(--c-surface-sunken);
  color: var(--c-content);
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
}
</style>
