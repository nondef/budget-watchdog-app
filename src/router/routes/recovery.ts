import { RouteRecordRaw } from "vue-router";

/**
 * Kalıcı durum kurulumu kalıcı olarak başarısız olduğunda gidilen tek rota.
 *
 * Sabit ayrı bir dosyada duruyor çünkü hem router, hem açılış akışı (main.ts),
 * hem de guard ona ihtiyaç duyuyor; guard'dan dışa vermek main.ts → guards →
 * stores → ... zincirinde gereksiz bir bağımlılık yaratırdı.
 */
export const RECOVERY_ROUTE = '/recovery'

export const recoveryRoutes: RouteRecordRaw[] = [
    {
        path: RECOVERY_ROUTE,
        component: () => import('@/views/RecoveryPage.vue')
    }
]
