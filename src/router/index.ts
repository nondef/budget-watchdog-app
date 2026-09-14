import { createRouter, createWebHistory } from '@ionic/vue-router';
import { RouteRecordRaw } from 'vue-router';
import { onboardingRoutes } from "@/router/routes/onboarding";
import { tabsRoutes } from "@/router/routes/tabs";
import { settingsRoutes } from "@/router/routes/settings";
import { financeRoutes } from "@/router/routes/finance";
import { recoveryRoutes } from "@/router/routes/recovery";
import { registerGuards } from "@/router/guards";

const routes: Array<RouteRecordRaw> = [
    ...onboardingRoutes,
    ...tabsRoutes,
    ...settingsRoutes,
    ...financeRoutes,
    ...recoveryRoutes,
    {
        path: '/:pathMatch(.*)*',
        redirect: '/tabs/home'
    }
]

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes
})

registerGuards(router)

export default router