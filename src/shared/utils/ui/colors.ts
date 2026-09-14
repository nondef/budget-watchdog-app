const TAILWIND_HEX: Record<string, string> = {
    // Red colors
    'bg-red-50': '#fef2f2',
    'bg-red-100': '#fee2e2',
    'bg-red-200': '#fecaca',
    'bg-red-300': '#fca5a5',
    'bg-red-400': '#f87171',
    'bg-red-500': '#ef4444',
    'bg-red-600': '#dc2626',
    'bg-red-700': '#b91c1c',
    'bg-red-800': '#991b1b',
    'bg-red-900': '#7f1d1d',

    // Blue colors
    'bg-blue-50': '#eff6ff',
    'bg-blue-100': '#dbeafe',
    'bg-blue-200': '#bfdbfe',
    'bg-blue-300': '#93c5fd',
    'bg-blue-400': '#60a5fa',
    'bg-blue-500': '#3b82f6',
    'bg-blue-600': '#2563eb',
    'bg-blue-700': '#1d4ed8',
    'bg-blue-800': '#1e40af',
    'bg-blue-900': '#1e3a8a',

    // Green colors
    'bg-green-50': '#f0fdf4',
    'bg-green-100': '#dcfce7',
    'bg-green-200': '#bbf7d0',
    'bg-green-300': '#86efac',
    'bg-green-400': '#4ade80',
    'bg-green-500': '#22c55e',
    'bg-green-600': '#16a34a',
    'bg-green-700': '#15803d',
    'bg-green-800': '#166534',
    'bg-green-900': '#14532d',

    // Yellow colors
    'bg-yellow-50': '#fefce8',
    'bg-yellow-100': '#fef3c7',
    'bg-yellow-200': '#fde68a',
    'bg-yellow-300': '#fcd34d',
    'bg-yellow-400': '#fbbf24',
    'bg-yellow-500': '#f59e0b',
    'bg-yellow-600': '#d97706',
    'bg-yellow-700': '#b45309',
    'bg-yellow-800': '#92400e',
    'bg-yellow-900': '#78350f',

    // Purple colors
    'bg-purple-50': '#faf5ff',
    'bg-purple-100': '#f3e8ff',
    'bg-purple-200': '#e9d5ff',
    'bg-purple-300': '#d8b4fe',
    'bg-purple-400': '#c084fc',
    'bg-purple-500': '#a855f7',
    'bg-purple-600': '#9333ea',
    'bg-purple-700': '#7c3aed',
    'bg-purple-800': '#6b21a8',
    'bg-purple-900': '#581c87',

    // Pink colors
    'bg-pink-50': '#fdf2f8',
    'bg-pink-100': '#fce7f3',
    'bg-pink-200': '#fbcfe8',
    'bg-pink-300': '#f9a8d4',
    'bg-pink-400': '#f472b6',
    'bg-pink-500': '#ec4899',
    'bg-pink-600': '#db2777',
    'bg-pink-700': '#be185d',
    'bg-pink-800': '#9d174d',
    'bg-pink-900': '#831843',

    // Orange colors
    'bg-orange-50': '#fff7ed',
    'bg-orange-100': '#ffedd5',
    'bg-orange-200': '#fed7aa',
    'bg-orange-300': '#fdba74',
    'bg-orange-400': '#fb923c',
    'bg-orange-500': '#f97316',
    'bg-orange-600': '#ea580c',
    'bg-orange-700': '#c2410c',
    'bg-orange-800': '#9a3412',
    'bg-orange-900': '#7c2d12',

    // Indigo colors — MARKA PRİMARY = MD3 nötr gri tonal paleti (tailwind.config ile eşle)
    'bg-indigo-50': '#f1f1f1',
    'bg-indigo-100': '#e2e2e2',
    'bg-indigo-200': '#c6c6c6',
    'bg-indigo-300': '#ababab',
    'bg-indigo-400': '#919191',
    'bg-indigo-500': '#777777',
    'bg-indigo-600': '#5e5e5e',
    'bg-indigo-700': '#474747',
    'bg-indigo-800': '#303030',
    'bg-indigo-900': '#1b1b1b',

    // Teal colors
    'bg-teal-50': '#f0fdfa',
    'bg-teal-100': '#ccfbf1',
    'bg-teal-200': '#99f6e4',
    'bg-teal-300': '#5eead4',
    'bg-teal-400': '#2dd4bf',
    'bg-teal-500': '#14b8a6',
    'bg-teal-600': '#0d9488',
    'bg-teal-700': '#0f766e',
    'bg-teal-800': '#115e59',
    'bg-teal-900': '#134e4a',

    // Gray colors
    'bg-gray-50': '#f9fafb',
    'bg-gray-100': '#f3f4f6',
    'bg-gray-200': '#e5e7eb',
    'bg-gray-300': '#d1d5db',
    'bg-gray-400': '#9ca3af',
    'bg-gray-500': '#6b7280',
    'bg-gray-600': '#4b5563',
    'bg-gray-700': '#374151',
    'bg-gray-800': '#1f2937',
    'bg-gray-900': '#111827',

    'bg-rose-50': '#fff1f2',
    'bg-rose-100': '#ffe4e6',
    'bg-rose-200': '#fecdd3',
    'bg-rose-300': '#fda4af',
    'bg-rose-400': '#fb7185',
    'bg-rose-500': '#f43f5e',
    'bg-rose-600': '#e11d48',
    'bg-rose-700': '#be123c',
    'bg-rose-800': '#9f1239',
    'bg-rose-900': '#881337',
}

export function tailwindToHex(cls: string, fallback = '#9ca3af'): string {
    const normalized = cls.replace(/-(\d{3})$/, '-500')
    return TAILWIND_HEX[normalized] ?? fallback
}

const ACCOUNT_GRADIENT_MAP: Record<string, string> = {
    'bg-red-500':     'from-red-500 to-red-700',
    'bg-rose-500':    'from-rose-500 to-rose-700',
    'bg-pink-500':    'from-pink-500 to-pink-700',
    'bg-fuchsia-500': 'from-fuchsia-500 to-fuchsia-700',
    'bg-purple-500':  'from-purple-500 to-purple-700',
    'bg-violet-500':  'from-violet-500 to-violet-700',
    'bg-indigo-500':  'from-indigo-500 to-indigo-700',
    'bg-blue-500':    'from-blue-500 to-blue-700',
    'bg-sky-500':     'from-sky-500 to-sky-700',
    'bg-cyan-500':    'from-cyan-500 to-cyan-700',
    'bg-teal-500':    'from-teal-500 to-teal-700',
    'bg-emerald-500': 'from-emerald-500 to-emerald-700',
    'bg-green-500':   'from-green-500 to-green-700',
    'bg-lime-500':    'from-lime-500 to-lime-700',
    'bg-yellow-500':  'from-yellow-500 to-yellow-700',
    'bg-amber-500':   'from-amber-500 to-amber-700',
    'bg-orange-500':  'from-orange-500 to-orange-700',
    'bg-slate-500':   'from-slate-700 to-slate-900',
    'bg-gray-500':    'from-gray-700 to-gray-900',
};

const DEFAULT_GRADIENT = 'from-slate-700 to-slate-900';

/** Hesap rengini (bg-X-500) Tailwind gradient sınıfına dönüştürür. */
export const accountGradient = (colorClass: string): string => {
    const base = colorClass.replace(/-(\d{3})$/, '-500');
    return ACCOUNT_GRADIENT_MAP[base] || DEFAULT_GRADIENT;
};