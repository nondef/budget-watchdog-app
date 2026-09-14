<script setup lang="ts">
/**
 * PIN giriş yüzeyi — kilit ekranı ve PIN kurulumu tarafından paylaşılır.
 *
 * Neden `ion-input-otp` yok: giriş, ekrandaki kendi tuş takımımızdan geliyor.
 * OTP bileşeni salt-okunur bir gösterge olarak kullanılıyordu (`pointer-events:
 * none` + gizli odak) ve sistem klavyesini açmasın diye sürekli bastırılıyordu.
 * Yaptığı tek iş "kaç hane girildi"yi göstermekti; onu noktalar daha dürüst ve
 * erişilebilir biçimde yapıyor.
 *
 * Renkler tema token'larından gelir (`--c-*`), bu yüzden light/dark için ayrı
 * sınıf gerekmez.
 */
import { computed, watch } from 'vue';
import { IonButton, IonIcon } from '@ionic/vue';
import { backspaceOutline, fingerPrintOutline, lockClosedOutline } from 'ionicons/icons';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const props = withDefaults(
    defineProps<{
      modelValue: string;
      title: string;
      subtitle?: string;
      error?: string;
      length?: number;
      disabled?: boolean;
      shake?: boolean;
      /** Biyometrik tuşu göster (yalnızca kilit ekranı). */
      biometric?: boolean;
    }>(),
    { length: 4, subtitle: '', error: '', disabled: false, shake: false, biometric: false }
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  complete: [value: string];
  biometric: [];
}>();

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const dots = computed(() => Array.from({ length: props.length }, (_, i) => i < props.modelValue.length));

const tap = () => { void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); };

const press = (digit: string) => {
  if (props.disabled || props.modelValue.length >= props.length) return;
  tap();
  emit('update:modelValue', props.modelValue + digit);
};

const backspace = () => {
  if (props.disabled || !props.modelValue.length) return;
  tap();
  emit('update:modelValue', props.modelValue.slice(0, -1));
};

// Tamamlanmayı burada yayınlıyoruz: iki sayfa da aynı uzunluk izleme
// mantığını ayrı ayrı kurmak zorunda kalmasın.
watch(
    () => props.modelValue,
    (value) => {
      if (value.length === props.length && !props.disabled) emit('complete', value);
    }
);
</script>

<template>
  <div class="pin">
    <div class="pin__head">
      <div class="pin__badge">
        <ion-icon :icon="lockClosedOutline" aria-hidden="true" />
      </div>

      <h1 class="pin__title">{{ title }}</h1>
      <p v-if="subtitle" class="pin__subtitle">{{ subtitle }}</p>

      <!-- role=alert: hatalı PIN ekran okuyucuya da bildirilsin -->
      <p v-if="error" class="pin__error" role="alert">{{ error }}</p>
    </div>

    <div
        class="pin__dots"
        :class="{ 'pin__dots--shake': shake }"
        role="status"
        :aria-label="`${modelValue.length} / ${length}`"
    >
      <span
          v-for="(filled, i) in dots"
          :key="i"
          class="pin__dot"
          :class="{ 'pin__dot--filled': filled }"
      />
    </div>

    <div class="pin__keypad">
      <ion-button
          v-for="key in keys"
          :key="key"
          class="pin__key"
          fill="clear"
          shape="round"
          :disabled="disabled"
          :aria-label="key"
          @click="press(key)"
      >
        {{ key }}
      </ion-button>

      <!-- Sol alt: biyometrik ya da boşluk (ızgara hizası korunsun) -->
      <ion-button
          v-if="biometric"
          class="pin__key pin__key--action"
          fill="clear"
          shape="round"
          :disabled="disabled"
          :aria-label="$t('security.lockScreen.useBiometric')"
          @click="emit('biometric')"
      >
        <ion-icon slot="icon-only" :icon="fingerPrintOutline" />
      </ion-button>
      <span v-else class="pin__key-spacer" aria-hidden="true" />

      <ion-button
          class="pin__key"
          fill="clear"
          shape="round"
          :disabled="disabled"
          aria-label="0"
          @click="press('0')"
      >
        0
      </ion-button>

      <ion-button
          class="pin__key pin__key--action"
          fill="clear"
          shape="round"
          :disabled="disabled || !modelValue.length"
          :aria-label="$t('security.lockScreen.delete')"
          @click="backspace"
      >
        <ion-icon slot="icon-only" :icon="backspaceOutline" />
      </ion-button>
    </div>
  </div>
</template>

<style scoped>
.pin {
  /* Optik merkez: geometrik ortada duran blok göze "aşağıda" görünür. Alt
     padding üstten 2×--pin-lift fazla olunca ortalanmış içerik tam --pin-lift
     kadar yukarı kayar — transform'un aksine düzeni bozmaz ve taşma hesabına
     dahil olur. vh tabanlı clamp kısa ekranda kaymayı kendiliğinden küçültür. */
  --pin-lift: clamp(12px, 4vh, 40px);

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 24px 16px calc(24px + var(--pin-lift) * 2);
}

.pin__head {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding-inline: 24px;
}

.pin__badge {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 22px;
  background: var(--c-surface-sunken);
  color: var(--c-content-tertiary);
  font-size: 24px;
}

.pin__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--c-content);
}

.pin__subtitle {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.4;
  color: var(--c-content-muted);
}

.pin__error {
  margin: 10px 0 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--c-error);
}

/* ── Nokta göstergesi ───────────────────────────────────────────── */
.pin__dots {
  display: flex;
  gap: 20px;
  margin: 60px 0 48px;
}

.pin__dot {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 2px solid var(--c-line-strong);
  background: transparent;
  transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;
}

.pin__dot--filled {
  background: var(--c-content);
  border-color: var(--c-content);
  transform: scale(1.1);
}

.pin__dots--shake {
  animation: pin-shake 0.4s;
}

@keyframes pin-shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-8px); }
  40%, 80% { transform: translateX(8px); }
}

/* Hareket duyarlılığı olan kullanıcılar için sarsıntıyı kapat */
@media (prefers-reduced-motion: reduce) {
  .pin__dots--shake { animation: none; }
  .pin__dot { transition: none; }
}

/* ── Tuş takımı ─────────────────────────────────────────────────── */
.pin__keypad {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(3, 72px);
  gap: 12px;
  justify-content: center;
}

.pin__key {
  --background: var(--c-surface-sunken);
  --background-activated: var(--c-surface-strong);
  --background-hover: var(--c-surface-strong);
  --color: var(--c-content);
  --border-radius: 999px;
  --padding-start: 0;
  --padding-end: 0;
  --box-shadow: none;
  width: 72px;
  height: 72px;
  margin: 0;
  font-size: 24px;
  font-weight: 500;
  letter-spacing: 0;
}

/* Biyometrik ve sil tuşları zeminsiz — rakamlardan ayrışsın */
.pin__key--action {
  --background: transparent;
  --background-hover: var(--c-surface-sunken);
  --color: var(--c-content-tertiary);
  font-size: 22px;
}

.pin__key-spacer {
  width: 72px;
  height: 72px;
}

/* Kısa ekranlar (küçük telefon + PinSetup'ta toolbar da yer yiyor):
   ortalanmış blok taşmasın diye ölçüler kademeli küçülür. İçerik
   scroll-y=false ile sabit, o yüzden taşma doğrudan kesilme demek. */
@media (max-height: 780px) {
  .pin { padding: 20px 16px calc(20px + var(--pin-lift) * 2); }

  .pin__badge {
    width: 52px;
    height: 52px;
    margin-bottom: 18px;
    font-size: 22px;
  }

  .pin__dots { margin: 44px 0 36px; }

  .pin__keypad {
    grid-template-columns: repeat(3, 68px);
    gap: 12px;
  }

  .pin__key,
  .pin__key-spacer {
    width: 68px;
    height: 68px;
  }

  .pin__key { font-size: 23px; }
}

@media (max-height: 690px) {
  .pin { padding: 16px 16px calc(16px + var(--pin-lift) * 2); }

  .pin__badge {
    width: 44px;
    height: 44px;
    margin-bottom: 12px;
    font-size: 19px;
  }

  .pin__dots { margin: 30px 0 26px; }

  .pin__keypad {
    grid-template-columns: repeat(3, 60px);
    gap: 10px;
  }

  .pin__key,
  .pin__key-spacer {
    width: 60px;
    height: 60px;
  }

  .pin__key { font-size: 21px; }
}

/* Rozet ancak burada feda edilir — altında sığdıracak yer kalmıyor. */
@media (max-height: 580px) {
  .pin__badge { display: none; }

  .pin__dots { margin: 22px 0 20px; }

  .pin__keypad {
    grid-template-columns: repeat(3, 54px);
    gap: 8px;
  }

  .pin__key,
  .pin__key-spacer {
    width: 54px;
    height: 54px;
  }

  .pin__key { font-size: 20px; }
}
</style>
