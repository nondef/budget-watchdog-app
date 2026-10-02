import { nextTick, reactive } from 'vue'
import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TransactionsPage from '@/views/TransactionsPage.vue'
import { useTransactionsStore } from '@/stores/transactions'
import type { TransactionDTO } from '@/application'

const lifecycle = vi.hoisted(() => ({ enter: undefined as (() => Promise<void>) | undefined }))
vi.mock('@ionic/vue', async (importOriginal) => ({
    ...await importOriginal<typeof import('@ionic/vue')>(),
    onIonViewWillEnter: (callback: () => Promise<void>) => { lifecycle.enter = callback },
}))
vi.mock('@/stores/transactions', () => {
    const store = reactive({ transactions: [] as TransactionDTO[], hasNext: false,
        loadTransactions: vi.fn(), loadNextPage: vi.fn() })
    return { useTransactionsStore: () => store }
})
vi.mock('@/stores/categories', () => ({
    useCategoriesStore: () => ({ loadCategories: vi.fn(), categoryById: () => undefined }),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('vue-i18n', async (importOriginal) => ({
    ...await importOriginal<typeof import('vue-i18n')>(),
    useI18n: () => ({ t: (key: string) => key }),
}))
vi.mock('@/composables/money/useMoney', () => ({
    useMoney: () => ({ convertToBase: (amount: number) => amount,
        formatMoney: String, hidden: false }),
}))

const transaction = {
    id: 'tx-1', title: 'Market', type: 'expense', date: new Date('2026-09-01'),
    amount: { amount: 100, currencyId: 'TRY' }, accountId: 'account-1',
} as TransactionDTO
const mountPage = () => shallowMount(TransactionsPage, {
    global: { renderStubDefaultSlot: true, mocks: { $t: (key: string) => key } },
})

describe('TransactionsPage loading state', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        useTransactionsStore().transactions = []
    })

    it('does not flash the empty state before or during the first query', async () => {
        let finish!: () => void
        vi.mocked(useTransactionsStore().loadTransactions).mockImplementation(() =>
            new Promise<void>(resolve => { finish = resolve }))
        const wrapper = mountPage()
        expect(wrapper.find('[role="status"]').exists()).toBe(true)
        expect(wrapper.findComponent({ name: 'TransactionEmptyState' }).exists()).toBe(false)

        const pending = lifecycle.enter!()
        await nextTick()
        expect(wrapper.findComponent({ name: 'TransactionEmptyState' }).exists()).toBe(false)
        useTransactionsStore().transactions = [transaction]
        finish()
        await pending
        await nextTick()
        expect(wrapper.find('[role="status"]').exists()).toBe(false)
        expect(wrapper.findComponent({ name: 'TransactionEmptyState' }).exists()).toBe(false)
        expect(wrapper.findComponent({ name: 'TransactionDateGroup' }).exists()).toBe(true)
        wrapper.unmount()
    })

    it('shows the empty state after a successful query returns no transactions', async () => {
        vi.mocked(useTransactionsStore().loadTransactions).mockResolvedValue(undefined)
        const wrapper = mountPage()
        await lifecycle.enter!()
        await nextTick()
        expect(wrapper.find('[role="status"]').exists()).toBe(false)
        expect(wrapper.findComponent({ name: 'TransactionEmptyState' }).exists()).toBe(true)
        wrapper.unmount()
    })

    it('keeps cached transactions visible while refreshing on re-entry', async () => {
        useTransactionsStore().transactions = [transaction]
        let finish!: () => void
        vi.mocked(useTransactionsStore().loadTransactions).mockImplementation(() =>
            new Promise<void>(resolve => { finish = resolve }))
        const wrapper = mountPage()
        const pending = lifecycle.enter!()
        await nextTick()
        expect(wrapper.find('[role="status"]').exists()).toBe(false)
        expect(wrapper.findComponent({ name: 'TransactionDateGroup' }).exists()).toBe(true)
        finish()
        await pending
        wrapper.unmount()
    })
})
