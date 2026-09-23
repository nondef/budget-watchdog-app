<script setup lang="ts">
import { ref, nextTick, watch, computed, useId } from 'vue'
import { IonInput } from '@ionic/vue'
import { useI18n } from 'vue-i18n'
import { minorUnitForCurrencyCode } from '@/domain/entities/currency'
import {
  caretAfterFormat,
  decimalInputSeparators,
  formatDecimalInput,
  numberToDecimalInput,
  parseDecimalInput,
  roundToDecimalDigits,
  sanitizeDecimalInput,
  sanitizeDecimalInputEdit,
  type DecimalInputOptions,
} from '@/shared/utils/number'

defineOptions({ inheritAttrs: false })

const { t, locale } = useI18n()

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
  /** ISO 4217 minor unit; currency metadata should be the primary source. */
  minorUnit?: number
  /** Explicit override for non-currency decimal inputs. */
  maxDecimalDigits?: number
  disabled?: boolean
  /** Para birimi metni dış yerleşimde gösteriliyorsa dahili prefix/suffix'i gizler. */
  hideCurrency?: boolean
  /**
   * 'solid' — MD3 filled text field görünümü (form alanı varsayılanı)
   * 'plain' — kart içine gömülü, borderless büyük tutar görünümü
   */
  variant?: 'solid' | 'plain'
}

const props = withDefaults(defineProps<Props>(), {
  errorText: '',
  helperText: '',
  min: 0,
  max: 999999999999.99,
  disabled: false,
  hideCurrency: false,
  variant: 'solid'
})

const isPlain = computed(() => props.variant === 'plain')
const displayLabel = computed(() => props.label?.trim() || t('common.amount'))
const suffixText = computed(() => props.symbol || props.currencyCode)
const decimalDigits = computed(() => Math.max(
    0,
    Math.min(3, props.maxDecimalDigits ?? props.minorUnit ?? minorUnitForCurrencyCode(props.currencyCode)),
))
const displayPlaceholder = computed(() => props.placeholder ?? new Intl.NumberFormat(locale.value, {
  minimumFractionDigits: decimalDigits.value,
  maximumFractionDigits: decimalDigits.value,
}).format(0))
const maxIntegerDigits = computed(() => Math.max(
    1,
    Math.max(Math.abs(Math.trunc(props.min)), Math.abs(Math.trunc(props.max))).toString().length,
))
const inputOptions = computed<DecimalInputOptions>(() => ({
  locale: locale.value,
  maxDecimalDigits: decimalDigits.value,
  maxIntegerDigits: maxIntegerDigits.value,
  allowNegative: props.min < 0,
}))

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const ionInputRef = ref<InstanceType<typeof IonInput> | null>(null)
const displayValue = ref('')
const inputId = useId()
const accessibleErrorId = `${inputId}-error`
const accessibleHelperId = `${inputId}-helper`

const hasError = computed(() => !!props.errorText)
const plainDescriptionId = computed(() => {
  if (!isPlain.value) return undefined
  if (hasError.value) return accessibleErrorId
  return props.helperText ? accessibleHelperId : undefined
})

// Biçimlendirme/ayrıştırma mantığı @/shared/utils/number/decimal-input içinde;
// burada yalnızca bileşenin prop'u bağlanıyor.
const formatNumber = (value: string): string => formatDecimalInput(value, inputOptions.value)

let nativeInput: HTMLInputElement | null = null

/**
 * Kullanıcının (veya üst bileşenin) verdiği son değer. Para birimi değişince
 * yuvarlama buradan yapılır; böylece USD → JPY → USD geçişinde kuruşlar kaybolmaz.
 */
let sourceValue = props.modelValue
/** Bileşenin kendi emit ettiği son değer; dış değişikliği ayırt etmek için. */
let lastEmitted: number | undefined

const emitValue = (value: number) => {
  lastEmitted = value
  emit('update:modelValue', value)
}

/** Keep the logical digit position while live grouping adds/removes separators. */
const restoreCaret = (rawValue: string, rawCaret: number | null, formatted: string) => {
  if (!nativeInput || rawCaret === null) return
  const nextCaret = caretAfterFormat(rawValue, rawCaret, formatted, inputOptions.value)
  nativeInput.setSelectionRange(nextCaret, nextCaret)
}

/** Yapıştırma öncesi seçim; yapıştırılan parçayı mevcut değerden ayırmak için. */
let externalInsert: { start: number, end: number, before: string } | null = null

const handleBeforeInput = (event: InputEvent) => {
  if (event.inputType !== 'insertFromPaste' && event.inputType !== 'insertFromDrop') return

  const input = event.target as HTMLInputElement
  externalInsert = {
    start: input.selectionStart ?? input.value.length,
    end: input.selectionEnd ?? input.value.length,
    before: input.value,
  }
}

/**
 * Yapıştırılan parça her iki ayraç geleneğini de kabul eder; alanda zaten
 * duran değerin gruplama işaretleri ise bize ait olduğu için ondalık ayraç
 * sanılmadan temizlenir.
 */
const mergeExternalInsert = (rawValue: string): string => {
  if (!externalInsert) return sanitizeDecimalInput(rawValue, inputOptions.value)

  const { start, end, before } = externalInsert
  const { group } = decimalInputSeparators(locale.value)
  const stripGroups = (part: string) => part.split(group).join('')
  const inserted = rawValue.slice(start, rawValue.length - (before.length - end))

  return sanitizeDecimalInput(
      stripGroups(before.slice(0, start))
      + sanitizeDecimalInput(inserted, inputOptions.value)
      + stripGroups(before.slice(end)),
      inputOptions.value,
  )
}

const handleInput = async (event: CustomEvent) => {
  const input = event.target as HTMLIonInputElement
  const rawValue = (input.value as string) ?? ''
  const rawCaret = nativeInput?.selectionStart ?? null
  const nativeEvent = event.detail?.event as InputEvent | undefined
  const isExternalInsert = nativeEvent?.inputType === 'insertFromPaste'
      || nativeEvent?.inputType === 'insertFromDrop'
  const previousDisplay = displayValue.value

  // Invalid characters are filtered here because Android IMEs do not always
  // emit reliable keydown events. For ordinary edits, grouping marks were
  // inserted by us and must not be reinterpreted as decimal marks. Pasted and
  // dropped values still accept either common separator convention.
  const value = isExternalInsert
      ? mergeExternalInsert(rawValue)
      : sanitizeDecimalInputEdit(rawValue, inputOptions.value, nativeEvent?.data, rawCaret)
  externalInsert = null

  // Formatla
  const formatted = formatNumber(value)
  displayValue.value = formatted
  input.value = formatted

  // Sayısal değeri emit et
  sourceValue = parseDecimalInput(formatted, inputOptions.value)
  emitValue(sourceValue)

  await nextTick()

  // İleri silmede yalnızca gruplama işareti silindiyse biçimleme onu geri
  // getirir; imleç yerinde kalmasın diye işaretin sağına geçirilir.
  if (nativeEvent?.inputType === 'deleteContentForward'
      && formatted === previousDisplay
      && rawCaret !== null) {
    nativeInput?.setSelectionRange(rawCaret + 1, rawCaret + 1)
    return
  }

  restoreCaret(rawValue, rawCaret, formatted)
}

const handleFocus = async () => {
  const ionEl = ionInputRef.value?.$el as HTMLIonInputElement | undefined
  if (!ionEl) return
  nativeInput = await ionEl.getInputElement()
}

const handleBlur = () => {
  if (!displayValue.value || displayValue.value === '-') return

  const value = parseDecimalInput(displayValue.value, inputOptions.value)
  const constrained = Math.min(props.max, Math.max(props.min, value))
  if (constrained !== value) {
    displayValue.value = numberToDecimalInput(constrained, inputOptions.value)
    sourceValue = constrained
    emitValue(constrained)
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  const key = event.key
  const input = event.target as HTMLInputElement
  const value = input.value

  // Mobil sanal klavyeler 'Unidentified'/'Process' gönderir; süzme handleInput'ta
  if (key === 'Unidentified' || key === 'Process' || event.isComposing) return

  // Preserve native editing/navigation and clipboard shortcuts.
  const allowedKeys = [
    'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End',
  ]

  // Rakam kontrolü
  if (/^\d$/.test(key)) return

  // İzin verilen tuş kontrolü
  if (allowedKeys.includes(key)) return

  // Ctrl/Cmd + A/C/V/X için izin ver
  if (event.ctrlKey || event.metaKey) return

  if (key === '-' && props.min < 0 && nativeInput?.selectionStart === 0 && !value.includes('-')) return

  // Virgül/nokta - ondalık ayraç (nokta handleInput'ta virgüle çevrilir),
  // zaten virgül varsa ikincisine izin verme
  if (key === ',' || key === '.') {
    const { decimal } = decimalInputSeparators(locale.value)
    // Seçili kısım yazılan karakterle değişeceği için kontrol dışında kalır.
    const start = input.selectionStart ?? value.length
    const end = input.selectionEnd ?? value.length
    if ((value.slice(0, start) + value.slice(end)).includes(decimal)) {
      event.preventDefault()
    }
    return
  }

  // Diğer her şeyi engelle
  event.preventDefault()
}

// Props değiştiğinde display'i güncelle
watch(() => props.modelValue, (newVal) => {
  // Dışarıdan gelen değer para biriminin hassasiyetine yuvarlanır; aksi halde
  // JPY alanında ekranda 432 görünürken model 432,17 olarak kaydedilir.
  const value = newVal === lastEmitted
      ? newVal
      : roundToDecimalDigits(newVal, decimalDigits.value)
  if (newVal !== lastEmitted) sourceValue = newVal

  const newDisplay = numberToDecimalInput(value, inputOptions.value)
  if (parseDecimalInput(displayValue.value, inputOptions.value) !== value) {
    displayValue.value = newDisplay
  }
  if (value !== newVal) emitValue(value)
}, { immediate: true })

// Hassasiyet değişince kaynak değerden yeniden yuvarla. Görüntü üzerinden
// round-trip yapılmaz: allowNegative=false iken negatif değerin işareti düşerdi.
watch(inputOptions, () => {
  const normalizedValue = roundToDecimalDigits(sourceValue, decimalDigits.value)
  displayValue.value = numberToDecimalInput(normalizedValue, inputOptions.value)
  if (normalizedValue !== props.modelValue) emitValue(normalizedValue)
})
</script>

<template>
  <ion-input
      v-bind="$attrs"
      ref="ionInputRef"
      :value="displayValue"
      :label="isPlain ? undefined : displayLabel"
      :aria-label="isPlain ? displayLabel : undefined"
      :aria-describedby="plainDescriptionId"
      :aria-invalid="hasError ? 'true' : undefined"
      :label-placement="isPlain ? undefined : 'floating'"
      :fill="isPlain ? undefined : 'solid'"
      :placeholder="displayPlaceholder"
      type="text"
      inputmode="decimal"
      enterkeyhint="done"
      autocomplete="off"
      :min="min"
      :max="max"
      :step="decimalDigits === 0 ? '1' : `0.${'0'.repeat(decimalDigits - 1)}1`"
      :helper-text="isPlain ? undefined : helperText"
      :error-text="isPlain ? undefined : errorText"
      :disabled="disabled"
      :class="{ 'ion-invalid ion-touched': hasError, 'currency-input--plain': isPlain }"
      @keydown="handleKeydown"
      @beforeinput="handleBeforeInput"
      @ion-input="handleInput"
      @ion-focus="handleFocus"
      @ion-blur="handleBlur"
  >
    <!-- plain: sembol sayının solunda (önek), outline: sağda. -->
    <div
        v-if="!hideCurrency"
        :slot="isPlain ? 'start' : 'end'"
        :class="['currency-suffix', { 'currency-suffix--plain': isPlain }]"
    >
      <span :style="hasError ? 'color: var(--md-error)' : ''">{{ suffixText }}</span>
    </div>
  </ion-input>
  <span v-if="isPlain && hasError" :id="accessibleErrorId" class="sr-only" role="alert">
    {{ errorText }}
  </span>
  <span v-else-if="isPlain && helperText" :id="accessibleHelperId" class="sr-only">
    {{ helperText }}
  </span>
</template>

<style scoped>
:deep(input) {
  -webkit-tap-highlight-color: transparent;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
