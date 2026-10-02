import { nextTick, reactive } from 'vue'
import { shallowMount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NewTransactionPage from '@/views/NewTransactionPage.vue'
import NewBudgetPage from '@/views/NewBudgetPage.vue'

vi.mock('@/stores/accounts', () => ({
    useAccountsStore: () => reactive({ accounts: [{
        id: 'account-1', name: 'Cash',
        balance: { amount: 0, currencyId: 'TRY' },
        icon: { name: 'walletOutline', color: 'bg-indigo-500' },
    }], loadAccounts: vi.fn() }),
}))
vi.mock('@/stores/transactions', () => ({
    useTransactionsStore: () => ({ addTransaction: vi.fn() }),
}))
vi.mock('@/stores/categories', () => ({
    useCategoriesStore: () => ({
        incomeCategories: [], expenseCategories: [],
        categoryById: () => undefined, loadCategories: vi.fn(),
    }),
}))
vi.mock('@/stores/currencies', () => ({
    useCurrenciesStore: () => ({ currencyById: () => undefined, loadCurrencies: vi.fn() }),
}))
vi.mock('@/stores/exchange-rates', () => ({
    useExchangeRateStore: () => ({ convertBetween: () => null }),
}))
vi.mock('@/stores/budgets', () => ({
    useBudgetStore: () => ({ addBudget: vi.fn() }),
}))
vi.mock('@/stores/app', () => ({
    useAppStore: () => ({ baseCurrency: undefined }),
}))
vi.mock('@/composables/ui/useToast', () => ({
    useToast: () => ({ error: vi.fn() }),
}))
vi.mock('@/composables', () => ({
    useAlert: () => ({ confirm: vi.fn() }),
}))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/plugins/yup-locale', () => ({ vMsg: (key: string) => () => key }))
vi.mock('@/composables/navigation/useAppNavigation', () => ({
    useAppNavigation: () => ({ goBackOrFallback: vi.fn() }),
}))
vi.mock('@/composables/money/useMoney', () => ({
    useMoney: () => ({ formatMoney: (value: number) => String(value) }),
}))
vi.mock('@/composables/ui/useErrorHandler', () => ({
    useErrorHandler: () => ({ handle: vi.fn() }),
}))
vi.mock('@/composables/ui/useAlert', () => ({
    useAlert: () => ({ info: vi.fn(), confirm: vi.fn() }),
}))
vi.mock('@/composables/features/useCategoryName', () => ({
    translateCategoryName: (name: string) => name,
    useCategoryName: () => ({ categoryName: (name: string) => name }),
}))

const mountPage = () => shallowMount(NewTransactionPage, {
    global: {
        renderStubDefaultSlot: true,
        mocks: { $t: (key: string) => key },
    },
})

describe('NewBudgetPage picker validation', () => {
    const mountBudgetPage = () => shallowMount(NewBudgetPage, {
        global: {
            renderStubDefaultSlot: true,
            mocks: { $t: (key: string) => key },
        },
    })

    it('keeps untouched account and category errors hidden on entry and unrelated edits', async () => {
        vi.useFakeTimers()
        const wrapper = mountBudgetPage()
        await settleValidation()
        const accountPicker = wrapper.findComponent({ name: 'PickerField' })
        expect(accountPicker.props('error')).toBeUndefined()
        expect(wrapper.find('.category-field-invalid').exists()).toBe(false)

        wrapper.findComponent({ name: 'CurrencyInput' }).vm.$emit('update:modelValue', 100)
        await settleValidation()
        expect(accountPicker.props('error')).toBeUndefined()
        expect(wrapper.find('.category-field-invalid').exists()).toBe(false)
        wrapper.unmount()
    })

    it('requires account and category on save and clears each error after selection', async () => {
        vi.useFakeTimers()
        const wrapper = mountBudgetPage()
        await settleValidation()
        const saveButton = wrapper.findAllComponents({ name: 'IonButton' })
            .find(button => button.text() === 'budgets.save')!
        saveButton.vm.$emit('click')
        await settleValidation()
        const accountPicker = wrapper.findComponent({ name: 'PickerField' })
        expect(accountPicker.props('error')).toBeTruthy()
        expect(wrapper.find('.category-field-invalid').exists()).toBe(true)

        wrapper.findComponent({ name: 'IonItem' }).vm.$emit('click')
        wrapper.findComponent({ name: 'CategoryPickerModal' }).vm.$emit('select', ['category-1'])
        await settleValidation()
        expect(accountPicker.props('error')).toBeUndefined()
        expect(wrapper.find('.category-field-invalid').exists()).toBe(false)
        wrapper.unmount()
    })
})

const settleValidation = async () => {
    await nextTick()
    await vi.advanceTimersByTimeAsync(50)
    await nextTick()
}

afterEach(() => { vi.useRealTimers() })

describe('NewTransactionPage category validation', () => {
    it('keeps the untouched category error hidden on page entry and unrelated edits', async () => {
        vi.useFakeTimers()
        const wrapper = mountPage()
        await settleValidation()
        const picker = wrapper.findComponent({ name: 'PickerField' })
        expect(picker.props('error')).toBeUndefined()

        wrapper.findComponent({ name: 'CurrencyInput' }).vm.$emit('update:modelValue', 100)
        await settleValidation()
        expect(picker.props('error')).toBeUndefined()
        wrapper.unmount()
    })

    it('requires a category on save and clears the error after selection', async () => {
        vi.useFakeTimers()
        const wrapper = mountPage()
        await settleValidation()
        wrapper.findAllComponents({ name: 'IonButton' }).at(-1)!.vm.$emit('click')
        await settleValidation()
        const picker = wrapper.findComponent({ name: 'PickerField' })
        expect(picker.props('error')).toBeTruthy()

        wrapper.findComponent({ name: 'CategoryPickerModal' }).vm.$emit('select', 'category-1')
        await settleValidation()
        expect(picker.props('error')).toBeUndefined()
        wrapper.unmount()
    })
})
