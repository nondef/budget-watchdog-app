import { defineComponent, h, nextTick, onMounted, ref, watch } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const IonInputMock = defineComponent({
    name: 'IonInput',
    props: { value: { type: String, default: '' } },
    emits: ['ionInput', 'ionFocus', 'ionBlur'],
    setup(props, { emit, slots }) {
        const inputRef = ref<HTMLInputElement | null>(null)

        watch(() => props.value, (value) => {
            if (inputRef.value && inputRef.value.value !== value) inputRef.value.value = value
        })
        onMounted(() => {
            if (!inputRef.value) return
            inputRef.value.value = props.value
            Object.assign(inputRef.value, { getInputElement: () => Promise.resolve(inputRef.value) })
        })

        return () => h('input', {
            ref: inputRef,
            onFocus: () => emit('ionFocus'),
            onBlur: () => emit('ionBlur'),
        }, slots.default?.())
    },
})

vi.mock('@ionic/vue', () => ({ IonInput: IonInputMock }))
vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key, locale: ref('tr-TR') }),
}))

const CurrencyInput = (await import('@/components/CurrencyInput.vue')).default

const mountInput = (props: Record<string, unknown>) => mount(CurrencyInput, {
    attachTo: document.body,
    props: {
        'onUpdate:modelValue': (value: number) => wrapper.setProps({ modelValue: value }),
        ...props,
    },
})
let wrapper: ReturnType<typeof mountInput>

const inputEl = () => wrapper.find('input').element as HTMLInputElement

/** Tarayıcının değeri yazıp olayı yollamasını taklit eder. */
const emitInput = async (rawValue: string, caret: number, inputType: string, data: string | null = null) => {
    const element = inputEl()
    element.value = rawValue
    element.setSelectionRange(caret, caret)
    wrapper.findComponent(IonInputMock).vm.$emit('ionInput', {
        target: element,
        detail: { event: { inputType, data } },
    })
    await nextTick()
    await nextTick()
}

beforeEach(async () => {
    wrapper = mountInput({ modelValue: 1234, currencyCode: 'TRY', minorUnit: 2 })
    await inputEl().dispatchEvent(new FocusEvent('focus'))
    await nextTick()
})

describe('CurrencyInput editing', () => {
    it('treats grouping marks of the existing value as grouping while pasting', async () => {
        expect(inputEl().value).toBe('1.234')

        const element = inputEl()
        element.setSelectionRange(5, 5)
        element.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertFromPaste', bubbles: true }))
        await emitInput('1.2340', 6, 'insertFromPaste')

        expect(wrapper.props('modelValue')).toBe(12340)
        expect(inputEl().value).toBe('12.340')
    })

    it('reads the pasted part with either separator convention', async () => {
        const element = inputEl()
        element.setSelectionRange(0, 5)
        element.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertFromPaste', bubbles: true }))
        await emitInput('1,234.56', 8, 'insertFromPaste')

        expect(wrapper.props('modelValue')).toBe(1234.56)
        expect(inputEl().value).toBe('1.234,56')
    })

    it('moves the caret past a grouping mark on forward delete', async () => {
        await emitInput('1234', 1, 'deleteContentForward')

        expect(inputEl().value).toBe('1.234')
        expect(inputEl().selectionStart).toBe(2)
    })

    it('rounds an external value to the currency precision', async () => {
        await wrapper.setProps({ currencyCode: 'JPY', minorUnit: 0 })
        await wrapper.setProps({ modelValue: 432.17 })
        await nextTick()

        expect(wrapper.props('modelValue')).toBe(432)
        expect(inputEl().value).toBe('432')
    })
})
