import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CurrencyInput from '@/components/CurrencyInput.vue'

vi.mock('@ionic/vue', () => ({
    IonInput: defineComponent({
        name: 'IonInput',
        props: { value: { type: String, default: '' } },
        setup: (props, { slots }) => () => h('div', { 'data-value': props.value }, slots.default?.()),
    }),
}))

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key, locale: ref('tr-TR') }),
}))

const mountInput = (props: Record<string, unknown>) => mount(CurrencyInput, {
    props: {
        'onUpdate:modelValue': (value: number) => wrapper.setProps({ modelValue: value }),
        ...props,
    },
})
let wrapper: ReturnType<typeof mountInput>

const displayed = () => wrapper.find('[data-value]').attributes('data-value')

describe('CurrencyInput currency precision changes', () => {
    it('restores fraction digits when switching back to a higher precision currency', async () => {
        wrapper = mountInput({ modelValue: 12.34, currencyCode: 'USD', minorUnit: 2 })

        await wrapper.setProps({ currencyCode: 'JPY', minorUnit: 0 })
        expect(wrapper.props('modelValue')).toBe(12)
        expect(displayed()).toBe('12')

        await wrapper.setProps({ currencyCode: 'USD', minorUnit: 2 })
        expect(wrapper.props('modelValue')).toBe(12.34)
        expect(displayed()).toBe('12,34')
    })

    it('uses a new external value as the source for later rounding', async () => {
        wrapper = mountInput({ modelValue: 12.34, currencyCode: 'USD', minorUnit: 2 })

        await wrapper.setProps({ modelValue: 50.5 })
        await wrapper.setProps({ currencyCode: 'JPY', minorUnit: 0 })
        await wrapper.setProps({ currencyCode: 'USD', minorUnit: 2 })
        expect(wrapper.props('modelValue')).toBe(50.5)
    })

    it('keeps the sign of a negative value it cannot edit', async () => {
        wrapper = mountInput({ modelValue: -500, currencyCode: 'TRY', minorUnit: 2, disabled: true })

        await wrapper.setProps({ currencyCode: 'USD', minorUnit: 3 })
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
        expect(wrapper.props('modelValue')).toBe(-500)
    })
})
