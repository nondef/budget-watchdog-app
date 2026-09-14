<script setup lang="ts">
import { ref, nextTick, onBeforeUnmount, watch, computed } from 'vue'
import { IonInput } from '@ionic/vue'
import { useI18n } from 'vue-i18n'
import {
  formatDecimalInput,
  numberToDecimalInput,
  parseDecimalInput,
  sanitizeDecimalInput
} from '@/shared/utils/number'

const { t } = useI18n()

interface Props {
  modelValue: number
  currencyCode: string
  /** Değerin yanında gösterilecek sembol (ör. ₺). Boşsa currencyCode kullanılır. */
  symbol?: string
  label?: string
  placeholder?: string
  errorText?: string
  helperText?: string
  min?: number
  max?: number
  maxDecimalDigits?: number
  disabled?: boolean
  /**
   * 'solid' — MD3 filled text field görünümü (form alanı varsayılanı)
   * 'plain' — kart içine gömülü, borderless büyük tutar görünümü
   */
  variant?: 'solid' | 'plain'
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  placeholder: '0',
  errorText: '',
  helperText: '',
  min: 0,
  max: 999999999999,
  maxDecimalDigits: 2,
  disabled: false,
  variant: 'solid'
})

const isPlain = computed(() => props.variant === 'plain')
const displayLabel = computed(() => props.label ?? t('common.amount'))
const suffixText = computed(() => props.symbol || props.currencyCode)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const ionInputRef = ref<InstanceType<typeof IonInput> | null>(null)
const displayValue = ref('')

const hasError = computed(() => !!props.errorText)

// Biçimlendirme/ayrıştırma mantığı @/shared/utils/number/decimal-input içinde;
// burada yalnızca bileşenin prop'u bağlanıyor.
const formatNumber = (value: string): string =>
    formatDecimalInput(value, { maxDecimalDigits: props.maxDecimalDigits })

// Caret gizli (hesap makinesi tarzı): imleç görünmez ve hep sona sabitlenir,
// yazılan her karakter sona eklenir. nativeInput focus'ta alınır.
let nativeInput: HTMLInputElement | null = null

const pinCaretToEnd = () => {
  if (!nativeInput) return
  const len = nativeInput.value.length
  if (nativeInput.selectionStart !== len || nativeInput.selectionEnd !== len) {
    nativeInput.setSelectionRange(len, len)
  }
}

const handleInput = async (event: CustomEvent) => {
  const input = event.target as HTMLIonInputElement

  // Geçersiz karakter temizliği + mobil ondalık klavye düzeltmesi
  const value = sanitizeDecimalInput((input.value as string) ?? '')

  // Formatla
  const formatted = formatNumber(value)
  displayValue.value = formatted
  input.value = formatted

  // Sayısal değeri emit et
  emit('update:modelValue', parseDecimalInput(formatted))

  // Imleci sona sabitle (görünmez caret, hep sona ekleme)
  await nextTick()
  pinCaretToEnd()
}

// Caret hep sonda kalır. Mobilde caret tutamacını sürüklemek click/select
// tetiklemez; selectionchange her durumda yakalar.
const onSelectionChange = () => {
  if (document.activeElement === nativeInput) pinCaretToEnd()
}

const handleFocus = async () => {
  const ionEl = ionInputRef.value?.$el as HTMLIonInputElement | undefined
  if (!ionEl) return
  nativeInput = await ionEl.getInputElement()
  pinCaretToEnd()
  document.addEventListener('selectionchange', onSelectionChange)
}

const handleBlur = () => {
  document.removeEventListener('selectionchange', onSelectionChange)
}

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', onSelectionChange)
})

const handleKeydown = (event: KeyboardEvent) => {
  const key = event.key
  const input = event.target as HTMLInputElement
  const value = input.value

  // Mobil sanal klavyeler 'Unidentified'/'Process' gönderir; süzme handleInput'ta
  if (key === 'Unidentified' || key === 'Process' || event.isComposing) return

  // İzin verilen tuşlar (ok/Home/End yok: görünmez caret hareket ettirilemez)
  const allowedKeys = ['Backspace', 'Delete', 'Tab']

  // Rakam kontrolü
  if (/^\d$/.test(key)) return

  // İzin verilen tuş kontrolü
  if (allowedKeys.includes(key)) return

  // Ctrl/Cmd + A/C/V/X için izin ver
  if (event.ctrlKey || event.metaKey) return

  // Virgül/nokta - ondalık ayraç (nokta handleInput'ta virgüle çevrilir),
  // zaten virgül varsa ikincisine izin verme
  if (key === ',' || key === '.') {
    if (value.includes(',')) {
      event.preventDefault()
    }
    return
  }

  // Diğer her şeyi engelle
  event.preventDefault()
}

// Props değiştiğinde display'i güncelle
watch(() => props.modelValue, (newVal) => {
  const newDisplay = numberToDecimalInput(newVal)
  if (parseDecimalInput(displayValue.value) !== newVal) {
    displayValue.value = newDisplay
  }
}, { immediate: true })
</script>

<template>
  <ion-input
      ref="ionInputRef"
      :value="displayValue"
      :label="isPlain ? undefined : displayLabel"
      :label-placement="isPlain ? undefined : 'floating'"
      :fill="isPlain ? undefined : 'solid'"
      :placeholder="placeholder"
      inputmode="decimal"
      :helper-text="isPlain ? undefined : helperText"
      :error-text="isPlain ? undefined : errorText"
      :disabled="disabled"
      :class="[{ 'ion-invalid ion-touched': hasError, 'currency-input--plain': isPlain }, $attrs?.class]"
      @keydown="handleKeydown"
      @ion-input="handleInput"
      @ion-focus="handleFocus"
      @ion-blur="handleBlur"
  >
    <!-- plain: sembol sayının solunda (önek), outline: sağda. -->
    <div :slot="isPlain ? 'start' : 'end'" :class="['currency-suffix', { 'currency-suffix--plain': isPlain }]">
      <span :style="hasError ? 'color: var(--md-error)' : ''">{{ suffixText }}</span>
    </div>
  </ion-input>
</template>

<style scoped>
/* Caret görünmez: hesap makinesi tarzı giriş, imleç yok (yazılan hep sona eklenir) */
:deep(input) {
  caret-color: transparent;
  -webkit-tap-highlight-color: transparent;
}

/* Mobilde uzun basınca çıkan seçim vurgusu da gizli (caret zaten sona sabit) */
:deep(input)::selection {
  background: transparent;
}

.currency-input--plain {
  --background: transparent;
  --color: var(--c-content);
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  --border-radius: 0;
  --highlight-color-focused: transparent;
  --highlight-color-valid: transparent;
  --highlight-color-invalid: transparent;
  font-weight: 700;
  min-height: 55px;
}

/* plain varyantta sembol (önek), tutarla aynı büyüklükte ve hafif soluk. */
.currency-suffix--plain {
  font-size: 22px;
  font-weight: 700;
  margin-inline-end: 6px;
  color: var(--c-content-muted);
}
</style>