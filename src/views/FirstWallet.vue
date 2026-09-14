<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  IonButton, IonButtons, IonBackButton,
  IonContent, IonIcon, IonInput, IonPage, useIonRouter, IonToolbar, IonFooter, IonHeader
} from '@ionic/vue'
import { chevronBackOutline, checkmarkCircle, chevronForwardOutline } from 'ionicons/icons'
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useForm } from "vee-validate";
import { useAppStore } from "@/stores/app";
import { useErrorHandler } from "@/composables/ui/useErrorHandler";
import { guardSubmit } from "@/composables/ui/guard-submit";
import { getIconByNameOrFallback } from "@/shared/utils/ui/icons";
import { appConfig } from "@/shared/config/app-config";
import OnboardingSteps from "@/components/OnboardingSteps.vue";
import CurrencyInput from "@/components/CurrencyInput.vue";
import { createAccountOnboardingSchema } from "@/forms";

const appStore = useAppStore()
const ionRouter = useIonRouter()
const router = useRouter()
const { t } = useI18n()
const { handle: handleError } = useErrorHandler()
const baseCurrency = computed(() => appStore.baseCurrency)

const { handleSubmit, defineField, errors, isSubmitting } = useForm({
  validationSchema: createAccountOnboardingSchema(),
  initialValues: {
    cardName: '',
    // `undefined` başlangıç değeri alanı `number` bekleyen CurrencyInput ile
    // uyumsuzdu (NewAccountPage'de zaten 0 kullanılıyor).
    balance: 0,
  }
})

const formattedBalance = computed(() => {
  const format = new Intl.NumberFormat('tr-TR', {
    currency: appStore.baseCurrency?.code,
    style: 'currency',
    currencyDisplay: 'symbol'
  })
  if (isNaN(balance.value)) return format.format(0)
  return format.format(balance.value)
})

const [cardName] = defineField('cardName')
const [balance] = defineField('balance')
const selectedIcon = ref<string>('walletOutline')
const selectedColor = ref<string>('bg-indigo-600')
const selectedGradient = ref<string>('from-indigo-500 to-indigo-700')
const isSaving = ref(false)
const showSuccess = ref(false)
const submitError = ref<string | null>(null)

const colorPalette = [
  { class: 'bg-indigo-600', gradient: 'from-indigo-500 to-indigo-700' },
  { class: 'bg-violet-600', gradient: 'from-violet-500 to-violet-700' },
  { class: 'bg-fuchsia-600', gradient: 'from-fuchsia-500 to-fuchsia-700' },
  { class: 'bg-pink-600',    gradient: 'from-pink-500 to-pink-700' },
  { class: 'bg-rose-600',    gradient: 'from-rose-500 to-rose-700' },
  { class: 'bg-orange-600',  gradient: 'from-orange-500 to-orange-700' },
  { class: 'bg-amber-600',   gradient: 'from-amber-500 to-amber-700' },
  { class: 'bg-emerald-600', gradient: 'from-emerald-500 to-emerald-700' },
  { class: 'bg-teal-600',    gradient: 'from-teal-500 to-teal-700' },
  { class: 'bg-cyan-600',    gradient: 'from-cyan-500 to-cyan-700' },
  { class: 'bg-sky-600',     gradient: 'from-sky-500 to-sky-700' },
  { class: 'bg-slate-700',   gradient: 'from-slate-700 to-slate-900' },
]

const iconOptions = [
  'walletOutline', 'cashOutline', 'cardOutline', 'briefcaseOutline',
  'homeOutline', 'carOutline', 'storefrontOutline', 'giftOutline',
  'barChartOutline', 'trendingUpOutline', 'logoBitcoin', 'diamondOutline',
]

const getIconByName = (iconName: string) => getIconByNameOrFallback(iconName)

const selectColor = (c: { class: string, gradient: string }) => {
  selectedColor.value = c.class
  selectedGradient.value = c.gradient
}

const completeOnboarding = handleSubmit(async (values) => {
  if (!appStore.hasBaseCurrency) {
    return router.replace('/base-currency-selection')
  }

  isSaving.value = true
  submitError.value = null

  try {
    await appStore.completeOnboarding({
        name: values.cardName,
        type: 'bank',
        balance: values.balance,
        icon: {
          name: selectedIcon.value,
          color: selectedColor.value
        },
        notes: ''
    })

    // Kısa başarı animasyonu, ardından ana ekrana geç.
    // Onboarding tamamlandığı için router guard /tabs/home'u sorunsuz geçirir.
    showSuccess.value = true
    await new Promise(resolve => setTimeout(resolve, 700))

    ionRouter.navigate('/tabs/home', 'root', 'replace')
  } catch (err) {
    handleError(err, {
      context: 'FirstWallet',
      fallback: t('firstWallet.createFailed'),
    })
    isSaving.value = false
    showSuccess.value = false
  }
})

// Çift dokunuşta iki cüzdan oluşmasın (bkz. guardSubmit).
const onSaveClick = guardSubmit(isSubmitting, async () => {
  // Validation hatalarını görünür yap
  submitError.value = null
  await completeOnboarding()
  // Eğer form validation başarısız olduysa errors dolu olur
  if (Object.keys(errors.value).length > 0 && !isSaving.value) {
    submitError.value = errors.value.cardName || errors.value.balance || t('firstWallet.checkFields')
  }
})

</script>

<template>
  <ion-page>
    <ion-header class="ion-no-border">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :icon="chevronBackOutline" default-href="/base-currency-selection"/>
        </ion-buttons>

        <!-- Step indicator -->
        <onboarding-steps :current="2" :total="2" class="step-abs" />
      </ion-toolbar>
    </ion-header>

    <ion-content class="wallet-content" :scroll-y="true">
      <div class="px-5 pb-32">

        <!-- Başlık -->
        <div class="text-center mt-6">
          <h1 class="text-[24px] font-extrabold text-content leading-tight tracking-tight">
            {{ $t('firstWallet.title') }}
          </h1>
          <p class="mt-2 text-[12px] text-content-muted leading-relaxed max-w-xs mx-auto">
            {{ $t('firstWallet.subtitle') }}
          </p>
        </div>

        <!-- Kart önizleme -->
        <div class="mt-6 px-2">
          <div
              class="relative aspect-[16/10] w-full max-w-sm mx-auto rounded-3xl text-white overflow-hidden bg-gradient-to-br shadow-2xl"
              :class="selectedGradient"
          >
            <div
                class="absolute inset-0 opacity-30 mix-blend-overlay pointer-events-none"
                style="background-image: radial-gradient(800px 300px at 0% 100%, rgba(255,255,255,0.4), transparent 40%), radial-gradient(600px 200px at 100% 0%, rgba(0,0,0,0.3), transparent 40%)"
            />

            <div class="absolute inset-0 p-5 flex flex-col">
              <div class="flex items-center justify-between">
                <span class="text-[10px] uppercase tracking-widest opacity-80 font-semibold">
                  {{ appConfig.name }}
                </span>
                <div class="size-10 rounded-2xl bg-surface/20 backdrop-blur flex items-center justify-center">
                  <ion-icon :icon="getIconByName(selectedIcon)" class="size-5 text-white" />
                </div>
              </div>

              <div class="mt-auto">
                <p class="text-[11px] opacity-70 mb-1">{{ $t('firstWallet.walletCardLabel') }}</p>
                <p class="text-[18px] font-bold truncate">
                  {{ cardName || $t('firstWallet.walletName') }}
                </p>
                <p class="mt-1 text-[20px] font-extrabold tabular-nums tracking-tight truncate">
                  {{ formattedBalance }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Form -->
        <div class="mt-6 space-y-5">
          <!-- Cüzdan adı — MD3 filled text field -->
          <ion-input
              v-model="cardName"
              fill="solid"
              label-placement="floating"
              :label="$t('firstWallet.walletName')"
              :placeholder="$t('firstWallet.walletNamePlaceholder')"
              :error-text="errors.cardName"
              :class="{ 'ion-touched ion-invalid': errors.cardName }"
          />

          <!-- Bakiye — MD3 filled currency alanı -->
          <currency-input
              v-model="balance"
              :label="$t('accounts.initialBalance')"
              :currency-code="baseCurrency?.code as string"
              :symbol="baseCurrency?.symbol"
              :error-text="errors.balance"
          />

          <!-- Renk -->
          <section class="bg-surface rounded-2xl px-4 py-3">
            <p class="text-[11px] text-content-muted mb-3">{{ $t('firstWallet.color') }}</p>
            <div class="flex flex-wrap gap-2">
              <button
                  v-for="color in colorPalette"
                  :key="color.class"
                  type="button"
                  class="size-9 rounded-full transition active:scale-90"
                  :class="[color.class, selectedColor === color.class ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-700' : '']"
                  @click="selectColor(color)"
                  :aria-label="$t('firstWallet.pickColor')"
              />
            </div>
          </section>

          <!-- İkon -->
          <section class="bg-surface rounded-2xl px-4 py-3">
            <p class="text-[11px] text-content-muted mb-3">{{ $t('firstWallet.icon') }}</p>
            <div class="grid grid-cols-6 gap-2">
              <button
                  v-for="icon in iconOptions"
                  :key="icon"
                  type="button"
                  class="aspect-square rounded-xl flex items-center justify-center transition"
                  :class="selectedIcon === icon
                      ? 'bg-indigo-50 ring-1 ring-indigo-200 text-indigo-700 dark:bg-indigo-500/15 dark:ring-indigo-400/30 dark:text-indigo-300'
                      : 'bg-surface-sunken text-content-tertiary active:bg-surface-strong'"
                  @click="selectedIcon = icon"
              >
                <ion-icon :icon="getIconByName(icon)" class="size-5" />
              </button>
            </div>
          </section>

<!--          <p v-if="submitError" class="text-[12px] text-rose-600 text-center mt-2">
            {{ submitError }}
          </p>-->
        </div>
      </div>
    </ion-content>

    <!-- Yükleniyor / başarı overlay -->
    <transition name="overlay-fade">
      <div
          v-if="isSaving || showSuccess"
          class="loading-overlay"
      >
        <div class="bg-surface rounded-3xl px-8 py-7 flex flex-col items-center shadow-2xl">
          <!-- Başarı ikon -->
          <div v-if="showSuccess" class="size-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <ion-icon :icon="checkmarkCircle" class="size-10 text-emerald-600" />
          </div>
          <!-- Yükleniyor spinner -->
          <div v-else class="size-12 border-4 border-line-strong border-t-indigo-600 rounded-full animate-spin mb-4" />

          <p class="text-[14px] font-semibold text-content">
            {{ showSuccess ? $t('firstWallet.ready') : $t('firstWallet.creating') }}
          </p>
          <p class="text-[11px] text-content-muted mt-1">
            {{ showSuccess ? $t('firstWallet.redirecting') : $t('firstWallet.fewSeconds') }}
          </p>
        </div>
      </div>
    </transition>

    <ion-footer>
      <ion-toolbar>
        <ion-button
            expand="block"
            class="app-button"
            :disabled="isSubmitting || isSaving"
            @click="onSaveClick"
        >
          {{ isSaving ? $t('firstWallet.creatingShort') : $t('firstWallet.complete') }}
          <ion-icon slot="end" :icon="chevronForwardOutline" class="size-4" />
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<style scoped>
.wallet-content {
  --background: var(--c-page);
}

ion-page {
  overflow: hidden;
}

/* Adım göstergesini start'taki geri butonundan bağımsız, toolbar'da tam
   ortalar. pointer-events:none → altındaki geri butonu tıklanır kalır. */
/*ion-toolbar {
  position: relative;
}*/

.step-abs {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.save-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px 20px calc(env(safe-area-inset-bottom) + 12px);
  background: linear-gradient(180deg, rgba(244, 244, 245, 0) 0%, #f4f4f5 30%);
  z-index: 10;
}

.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 24px;
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 200ms ease;
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

/* Footer/toolbar arka planını sayfa rengiyle eşitle ve tam genişlik kapla.
   Yatay boşluk (px) toolbar'ın İÇİNE verilir; aksi halde toolbar arka planı
   kenarlara ulaşmaz ve sayfa kaydıkça altta içerik kenarlardan sızar. */
/*.wallet-footer {
  background: var(--c-page);
}

.wallet-footer ion-toolbar {
  --background: var(--c-page);
  --border-width: 0;
  --padding-start: 24px;
  --padding-end: 24px;
  --padding-top: 8px;
  --padding-bottom: calc(env(safe-area-inset-bottom) + 8px);
}*/
</style>
