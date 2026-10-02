import { toastController } from "@ionic/vue";
import type { ToastOptions } from "@ionic/vue";

/**
 * Ionic toast seçeneklerinden (ionicframework.com/docs/api/toast) uygulamada
 * anlamlı olanlar. Bilerek dışarıda bırakılanlar:
 *  - color: Ionic `.ion-color-*`'ı !important ile yazar, snackbar görünümünü bozar.
 *  - htmlAttributes: toast'ta aria-live "assertive" yapılmamalı; kullanıcının
 *    mutlaka görmesi gereken mesaj için useAlert kullan.
 *  - enter/leaveAnimation: main.ts'te global olarak veriliyor.
 */
type ToastConfig = Pick<
    ToastOptions,
    'duration' | 'position' | 'positionAnchor' | 'header' | 'icon' | 'buttons' | 'layout' | 'cssClass'
>

/** Ionic'in varsayılanı 0'dır (dismiss() çağrılana kadar kalır); her zaman bir süre veriyoruz. */
const DEFAULT_DURATION = 3000

/** Aynı anda tek toast: yenisi gelince öncekini kapatırız ki üst üste binmesin. */
let activeToast: HTMLIonToastElement | null = null

/** Ionic önbellekteki sayfaları DOM'da tuttuğu için yalnızca görünür barı kullan. */
function getVisibleTabBar(): HTMLElement | undefined {
    if (typeof document === 'undefined') return undefined

    return Array.from(document.querySelectorAll<HTMLElement>('ion-tab-bar.app-tab-bar'))
        .find((tabBar) => {
            if (tabBar.closest('.ion-page-hidden, .ion-page-invisible, [hidden], [aria-hidden="true"]')) {
                return false
            }
            const rect = tabBar.getBoundingClientRect()
            const style = window.getComputedStyle(tabBar)
            return rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight &&
                rect.bottom > 0 && style.display !== 'none' && style.visibility !== 'hidden'
        })
}

/**
 * MD3 snackbar (görünüm: theme/ionic/toast.css). `defaults` bu çağrı yerinin
 * varsayılanlarıdır; tek bir mesaj için `show`'un ikinci parametresiyle ezilir.
 */
export function useToast(defaults: ToastConfig = {}) {
    const show = async (message: string, opts: ToastConfig = {}): Promise<HTMLIonToastElement> => {
        const config = { ...defaults, ...opts }
        const position = config.position ?? 'bottom'

        const toast = await toastController.create({
            ...config,
            message,
            duration: config.duration ?? DEFAULT_DURATION,
            position,
            // Bottom toast tab barın üstüne oturur; "middle"da Ionic anchor'ı yok sayar.
            positionAnchor: config.positionAnchor ?? (position === 'bottom' ? getVisibleTabBar() : undefined),
            swipeGesture: 'vertical',
        })

        activeToast?.dismiss()
        activeToast = toast
        toast.onDidDismiss().then(() => {
            if (activeToast === toast) {
                activeToast = null
            }
        })

        await toast.present()
        return toast
    }

    return { show }
}
