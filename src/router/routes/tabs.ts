import { RouteRecordRaw } from "vue-router";
import TabsPage from "@/views/TabsPage.vue";

export const tabsRoutes: RouteRecordRaw[] = [
    {
        path: '/tabs/',
        component: TabsPage,
        children: [
            { path: '', redirect: 'home' },
            { path: 'home', component: () => import('@/views/HomePage.vue') },
            { path: 'overview', component: () => import('@/views/OverviewPage.vue') },
            { path: 'transactions', component: () => import('@/views/TransactionsPage.vue') },
            { path: 'accounts', component: () => import('@/views/AccountsPage.vue') },
            { path: 'settings', component: () => import('@/views/SettingsListPage.vue'), }
        ]
    }
]