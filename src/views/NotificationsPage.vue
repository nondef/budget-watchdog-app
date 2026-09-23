<script setup lang="ts">
import {
  IonPage,
  IonContent,
  IonIcon,
  IonButton,
  IonLabel,
  IonToggle,
  IonItem,
  IonList,
  IonNote
} from '@ionic/vue';
import {
  notificationsOutline,
  timeOutline,
  walletOutline,
  pieChartOutline,
  trophyOutline,
  informationCircleOutline,
  shieldCheckmarkOutline,
  alarmOutline
} from 'ionicons/icons';
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useNotificationsStore } from '@/stores/notifications';
import { useNotifier } from '@/composables/features/useNotifier';
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { ALERT_ROLE, useAlert } from "@/composables/ui/useAlert";
import TimePickerModal from '@/components/TimePickerModal.vue';
import SubPageHeader from '@/components/SubPageHeader.vue';

const { t } = useI18n();
const alert = useAlert()

const notificationStore = useNotificationsStore()
const { prefs } = storeToRefs(notificationStore);
const notifier = useNotifier();
const { exactAlarmGranted } = notifier;

const pushDisabled = computed(() => !prefs.value.pushEnabled);
const reminderTimeOpen = ref(false);

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
  <ion-page class="design-page">
    <sub-page-header :title="$t('notifications.title')"/>

    <ion-content :fullscreen="true" class="notif-content" :scroll-y="true">
      <main class="mx-auto w-full max-w-xl px-4 pb-12 pt-5">

        <!-- Ana anahtar -->
        <div class="notif-card notif-card--master">
          <ion-list :inset="false" lines="none">
            <ion-item class="plain-item" :button="false">
              <div slot="start" class="notif-tint notif-tint--primary">
                <ion-icon :icon="notificationsOutline" class="size-[18px]" />
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
                <div slot="start" class="notif-tint notif-tint--info">
                  <ion-icon :icon="walletOutline" class="size-[18px]" />
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
                <div slot="start" class="notif-tint notif-tint--neutral">
                  <ion-icon :icon="timeOutline" class="size-[18px] text-content-secondary" />
                </div>
                <ion-label>
                  <h3 class="notif-title">{{ $t('notifications.reminderTime') }}</h3>
                  <p class="notif-sub">{{ $t('notifications.reminderTimeDesc') }}</p>
                </ion-label>
                <ion-button
                    slot="end"
                    fill="clear"
                    class="reminder-time-trigger"
                    :aria-label="$t('notifications.reminderTime')"
                    @click="reminderTimeOpen = true"
                >
                  {{ prefs.walletReminder.time }}
                </ion-button>
              </ion-item>
            </ion-list>
          </div>

          <!--
            Kesin alarm izni uyarısı. Android 14'ten (targetSdk 34+) beri
            SCHEDULE_EXACT_ALARM varsayılan olarak VERİLMİYOR; izin yokken
            plugin setAndAllowWhileIdle kullanıyor ve OS hatırlatıcıyı kendi
            uyanma penceresine yuvarlıyor — 17:15 için kurulan bildirim 17:40'ta
            düşebiliyor. Satır yalnızca hatırlatıcı açıkken ve izin gerçekten
            reddedilmişken görünür (null = Android değil ya da okunamadı).
          -->
          <div v-if="prefs.walletReminder.enabled && exactAlarmGranted === false" class="notif-card">
            <ion-list :inset="false" lines="full">
              <ion-item
                  class="plain-item"
                  lines="none"
                  :button="true"
                  :detail="true"
                  @click="notifier.openExactAlarmSettings()"
              >
                <div slot="start" class="notif-tint notif-tint--warning">
                  <ion-icon :icon="alarmOutline" class="size-[18px]" />
                </div>
                <ion-label class="ion-text-wrap">
                  <h3 class="notif-title">{{ $t('notifications.exactAlarmTitle') }}</h3>
                  <p class="notif-sub">{{ $t('notifications.exactAlarmDesc') }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </div>

          <h2 class="notif-section">{{ $t('notifications.alerts') }}</h2>

          <div class="notif-card">
            <ion-list :inset="false" lines="full">
              <ion-item class="plain-item" :button="false">
                <div slot="start" class="notif-tint notif-tint--warning">
                  <ion-icon :icon="pieChartOutline" class="size-[18px]" />
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

              <ion-item class="plain-item" lines="full" :button="false">
                <div slot="start" class="notif-tint notif-tint--violet">
                  <ion-icon :icon="trophyOutline" class="size-[18px]" />
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
              <ion-item class="plain-item" lines="full" :button="false">
                <div slot="start" class="notif-tint notif-tint--info">
                  <ion-icon :icon="shieldCheckmarkOutline" class="size-[18px]" />
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
                <div slot="start" class="notif-tint notif-tint--info">
                  <ion-icon :icon="timeOutline" class="size-[18px]" />
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
      </main>

    </ion-content>

    <TimePickerModal
        v-model="prefs.walletReminder.time"
        v-model:open="reminderTimeOpen"
        :title="$t('notifications.reminderTime')"
    />
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
  border: 1px solid var(--c-line);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 5px 18px color-mix(in srgb, var(--c-content) 5%, transparent);
}

.notif-card--master {
  background: linear-gradient(145deg, var(--c-surface) 0%, var(--c-surface-sunken) 100%);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--c-content) 8%, transparent);
}

.notif-card + .notif-card {
  margin-top: 12px;
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

/* İkon tint kutusu — pastel sınıflar src/theme/overrides/tailwind-tints.css'te yarı şeffaf
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
  border: 1px solid transparent;
}

.notif-tint--primary {
  background: var(--c-primary);
  color: var(--c-on-primary);
}

.notif-tint--neutral {
  background: var(--c-surface-sunken);
  border-color: var(--c-line);
  color: var(--c-content-secondary);
}

.notif-tint--info {
  background: color-mix(in srgb, #0284c7 11%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, #0284c7 23%, var(--c-line));
  color: #0369a1;
}

.notif-tint--warning {
  background: color-mix(in srgb, #f59e0b 13%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, #f59e0b 25%, var(--c-line));
  color: #b45309;
}

.notif-tint--violet {
  background: color-mix(in srgb, #7c3aed 11%, var(--c-surface-sunken));
  border-color: color-mix(in srgb, #7c3aed 23%, var(--c-line));
  color: #7c3aed;
}

.notif-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--c-content);
}

.notif-sub {
  font-size: 11px;
  color: var(--c-content-muted);
  margin-top: 2px;
  white-space: normal;
}

.notif-section {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--c-content-muted);
  margin: 26px 4px 9px;
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
  border: 1px solid var(--c-line);
  color: var(--c-content-muted);
  box-shadow: 0 5px 18px color-mix(in srgb, var(--c-content) 4%, transparent);
}

.notif-note__text {
  font-size: 12px;
  line-height: 1.45;
  color: var(--c-content-tertiary);
}

/* ion-datetime-button yalnızca ion-datetime açabildiğinden, özel modalı
   tetikleyen ion-button aynı kompakt görünümü burada taşır. */
ion-button.reminder-time-trigger {
  min-height: 36px;
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  font-weight: 700;
  text-transform: none;
  --background: var(--c-surface-sunken);
  --background-hover: var(--c-surface-strong);
  --background-activated: var(--c-surface-strong);
  --color: var(--c-content);
  --border-radius: 10px;
  --box-shadow: none;
  --padding-start: 12px;
  --padding-end: 12px;
}

:global(.ion-palette-dark) .notif-tint--info {
  color: #7dd3fc;
}

:global(.ion-palette-dark) .notif-tint--warning {
  color: #fcd34d;
}

:global(.ion-palette-dark) .notif-tint--violet {
  color: #c4b5fd;
}
</style>
