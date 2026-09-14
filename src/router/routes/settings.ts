import { NavigationGuardWithThis, RouteRecordRaw } from "vue-router";
import SettingsPage from "@/views/SettingsPage.vue";

type RouteGuard = NavigationGuardWithThis<undefined>

const child = (path: string, component: () => Promise<unknown>, guard?: RouteGuard): RouteRecordRaw => ({
    path,
    component,
    ...(guard ? { beforeEnter: guard }: {})
})

export const settingsRoutes: RouteRecordRaw[] = [
    {
        path: '/settings',
        component: SettingsPage,
        children: [
            { path: '', redirect: '/tabs/settings' },

            child('', () => import('@/views/SettingsListPage.vue')),
            child('accounts', () => import('@/views/AccountsPage.vue')),
            child('theme', () => import('@/views/ThemePage.vue')),
            child('language', () => import('@/views/LanguagePage.vue')),
            child('currency', () => import('@/views/CurrencyPage.vue')),
            child('budget-goals', () => import('@/views/BudgetGoalsPage.vue')),
            child('backup', () => import('@/views/BackupPage.vue')),
            child('appearance', () => import('@/views/AppearancePage.vue')),
            child('categories', () => import('@/views/CategoriesPage.vue')),
            child('notifications', () => import('@/views/NotificationsPage.vue')),
            child('security', () => import('@/views/SecurityPage.vue')),
            child('security/pin', () => import('@/views/PinSetupPage.vue')),
            child('privacy', () => import('@/views/PrivacyPage.vue')),
            child('feedback', () => import('@/views/FeedbackPage.vue')),
            child('about', () => import('@/views/AboutPage.vue')),
            child('help', () => import('@/views/HelpPage.vue')),
            child('financial-indicators', () => import('@/views/FinancialIndicatorsPage.vue')),
            child('savings', () => import('@/views/SavingGoalsPage.vue'))
        ]
    }
]