export type TransactionType = 'income' | 'expense' | 'transfer'

export const TRANSACTION_TYPES = [
    { id: 'income', label: 'Gelir', activeClass: 'bg-emerald-600 text-white', sign: '+' },
    { id: 'expense', label: 'Gider', activeClass: 'bg-rose-600 text-white', sign: '−' },
    { id: 'transfer', label: 'Transfer', activeClass: 'bg-indigo-600 text-white', sign: '' },
] as const