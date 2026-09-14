import { RouteRecordRaw } from "vue-router";

export const onboardingRoutes: RouteRecordRaw[] = [
    {
        path: '/',
        // Onboarding tamamlanmadıysa ilk sayfa her zaman welcome. Tamamlandıysa
        // guard /welcome'ı /tabs/home'a yönlendirir (welcome render olmaz).
        redirect: '/welcome'
    },
    {
        path: '/welcome',
        component: () => import('@/views/WelcomePage.vue')
    },
    {
        path: '/splash',
        component: () => import('@/views/SplashPage.vue')
    },
    {
        path: '/permissions',
        component: () => import('@/views/PermissionsPage.vue'),
        name: 'baseCurrencySelection'
    },
    {
        path: '/base-currency-selection',
        component: () => import('@/views/BaseCurrencySelectionPage.vue')
    },
    {
        path: '/first-wallet',
        component: () => import('@/views/FirstWallet.vue')
    },
    {
        path: '/lock',
        component: () => import('@/views/LockScreenPage.vue')
    }
]