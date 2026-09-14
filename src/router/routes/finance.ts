import { RouteRecordRaw } from 'vue-router';

export const financeRoutes: Array<RouteRecordRaw> = [
    {
        path: '/transaction/new',
        component: () => import('@/views/NewTransactionPage.vue'),
    },
    {
        path: '/transaction/:id/edit',
        component: () => import('@/views/EditTransactionPage.vue'),
    },
    {
        path: '/transaction/:id/show',
        component: () => import('@/views/TransactionDetailPage.vue'),
    },
    {
        path: '/accounts/new',
        component: () => import('@/views/NewAccountPage.vue'),
    },
    {
        path: '/accounts/:id/show',
        component: () => import('@/views/AccountDetailPage.vue'),
    },
    {
        path: '/accounts/:id/edit',
        component: () => import('@/views/EditAccountPage.vue'),
    },
    {
        path: '/savings/new',
        component: () => import('@/views/NewSavingGoalPage.vue'),
    },
    {
        path: '/savings/:id/edit',
        component: () => import('@/views/EditSavingGoalPage.vue'),
    },
    {
        path: '/savings/:id/show',
        component: () => import('@/views/ShowSavingGoalPage.vue'),
    },
    {
        path: '/budget/new',
        component: () => import('@/views/NewBudgetPage.vue'),
    },
    {
        path: '/budget/:id/edit',
        component: () => import('@/views/EditBudgetPage.vue'),
    },
    {
        path: '/budget/:id/show',
        component: () => import('@/views/ShowBudgetPage.vue'),
    }
];