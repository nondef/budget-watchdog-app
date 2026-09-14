import { toastController } from "@ionic/vue";
import type { ToastButton, ToastOptions as IonToastOptions } from "@ionic/vue";
import {
    alertCircleOutline,
    checkmarkCircleOutline,
    closeOutline,
    informationCircleOutline,
    warningOutline,
} from "ionicons/icons";

type ToastType = 'success' | 'danger' | 'warning' | 'primary'

/** dismiss() çağrılarında ve onDidDismiss sonucunda dönen roller. */
export const TOAST_ROLE = {
    /** Kullanıcı kapat butonuyla veya swipe ile kapattı. */
    cancel: 'cancel',
    /** Süre dolduğunda Ionic'in atadığı rol. */
    timeout: 'timeout',
    /** Yeni bir toast gösterilirken eskisi programatik kapatıldı. */
    replaced: 'replaced',
} as const

interface ToastOptions {
    message: string
    header?: string
    /**
     * Aynı id ile art arda çağrılırsa yeni toast açılmaz; açık olan
     * toast'un mesajı yerinde güncellenir ve süresi baştan başlar.
     * Hızlı tekrarlı bildirimlerde (ör. "X dokunuş kaldı") animasyon
     * yığılmasını önler.
     */
    id?: string
    /**
     * Otomatik kapanma süresi (ms). Varsayılan 3000.
     * `persistent: true` ise yok sayılır.
     */
    duration?: number
    /**
     * true ise toast süreyle kapanmaz; kullanıcı kapat butonu,
     * swipe veya `dismiss()` ile kapatana kadar açık kalır.
     * Erişilebilirlik için otomatik bir kapat butonu eklenir.
     */
    persistent?: boolean
    color?: ToastType
    position?: 'top' | 'bottom' | 'middle'
    /** Özel hizalama hedefi. Bottom toast'lar varsayılan olarak görünür tabbar'ın üstüne hizalanır. */
    positionAnchor?: string | HTMLElement
    /** ionicons ikonu. Verilmezse renge uygun varsayılan ikon kullanılır. */
    icon?: string
    /** Uzun buton metinlerinde 'stacked' kullan. */
    layout?: 'baseline' | 'stacked'
    /** Swipe ile kapatma. Varsayılan açık ('vertical'). */
    swipeGesture?: 'vertical' | false
    buttons?: ToastButton[]
    /** Kalıcı toast'a eklenen kapat butonunu gizler. */
    hideCloseButton?: boolean
    cssClass?: string | string[]
    htmlAttributes?: IonToastOptions['htmlAttributes']
}

export interface ToastHandle {
    /** Toast'u programatik kapatır. handler'lardan veri/rol geçilebilir. */
    dismiss: (data?: unknown, role?: string) => Promise<boolean>
    /** Toast kapanınca çözülür; { data, role } döner. */
    onDidDismiss: HTMLIonToastElement['onDidDismiss']
}

const DEFAULT_DURATION = 3000

const DEFAULT_ICONS: Record<ToastType, string> = {
    success: checkmarkCircleOutline,
    danger: alertCircleOutline,
    warning: warningOutline,
    primary: informationCircleOutline,
}

/** Aynı anda tek toast: yenisi gelince öncekini kapatırız ki üst üste binmesin. */
let activeToast: HTMLIonToastElement | null = null
let activeToastId: string | null = null
/** id'li toast'larda süreyi kendimiz yönetiriz ki güncellemede sıfırlanabilsin. */
let activeTimer: ReturnType<typeof setTimeout> | null = null

function clearActiveTimer() {
    if (activeTimer) {
        clearTimeout(activeTimer)
        activeTimer = null
    }
}

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

async function dismissActive(role: string = TOAST_ROLE.cancel): Promise<boolean> {
    if (!activeToast) return false
    const toast = activeToast
    activeToast = null
    activeToastId = null
    clearActiveTimer()
    return toast.dismiss(undefined, role)
}

export function useToast() {
    const showToast = async (options: ToastOptions): Promise<ToastHandle> => {
        const color = options.color ?? 'primary'
        const duration = options.duration ?? DEFAULT_DURATION

        // Aynı id'li toast açıksa yenisini yaratma: mesajı yerinde
        // güncelle, süreyi baştan başlat. Animasyon yığılması olmaz.
        if (options.id && activeToast && activeToastId === options.id) {
            const toast = activeToast
            toast.message = options.message
            toast.color = color
            if (options.icon) toast.icon = options.icon

            clearActiveTimer()
            if (!options.persistent) {
                activeTimer = setTimeout(() => {
                    void toast.dismiss(undefined, TOAST_ROLE.timeout)
                }, duration)
            }

            return {
                dismiss: (data?: unknown, role?: string) => toast.dismiss(data, role),
                onDidDismiss: () => toast.onDidDismiss(),
            }
        }

        await dismissActive(TOAST_ROLE.replaced)

        const persistent = options.persistent ?? false

        const buttons: ToastButton[] = [...(options.buttons ?? [])]

        // Kalıcı toast'un her zaman kapatma yolu olmalı (a11y):
        // role: 'cancel' butonu Ionic tarafından otomatik dismiss eder.
        const hasCancelButton = buttons.some((b) => b.role === 'cancel')
        if (persistent && !hasCancelButton && !options.hideCloseButton) {
            buttons.push({
                icon: closeOutline,
                role: 'cancel',
                htmlAttributes: { 'aria-label': 'Kapat' },
            })
        }

        // id'li toast'larda süreyi manuel timer yönetir; böylece aynı id ile
        // gelen güncellemede süre sıfırlanabilir (native duration sıfırlanamaz).
        const useManualTimer = Boolean(options.id) && !persistent
        const position = options.position ?? 'bottom'
        // positionAnchor tabbar yüksekliğini ve safe-area'yı hesaba katar.
        // Ionic arada MD'de 8px, iOS'ta 10px boşluk bırakır.
        const positionAnchor = options.positionAnchor ??
            (position === 'bottom' ? getVisibleTabBar() : undefined)

        const toast = await toastController.create({
            header: options.header,
            message: options.message,
            duration: persistent || useManualTimer ? 0 : duration,
            color,
            position,
            positionAnchor,
            icon: options.icon ?? DEFAULT_ICONS[color],
            layout: options.layout ?? 'baseline',
            swipeGesture: options.swipeGesture === false ? undefined : 'vertical',
            buttons: buttons.length > 0 ? buttons : undefined,
            cssClass: options.cssClass,
            htmlAttributes: options.htmlAttributes,
        })

        activeToast = toast
        activeToastId = options.id ?? null
        toast.onDidDismiss().then(() => {
            if (activeToast === toast) {
                activeToast = null
                activeToastId = null
                clearActiveTimer()
            }
        })

        await toast.present()

        if (useManualTimer) {
            activeTimer = setTimeout(() => {
                void toast.dismiss(undefined, TOAST_ROLE.timeout)
            }, duration)
        }

        return {
            dismiss: (data?: unknown, role?: string) => toast.dismiss(data, role),
            onDidDismiss: () => toast.onDidDismiss(),
        }
    }

    const success = (msg: string, opts?: Partial<ToastOptions>) => showToast({ message: msg, color: 'success', ...opts })
    const error = (msg: string, opts?: Partial<ToastOptions>) => showToast({ message: msg, color: 'danger', ...opts })
    const warning = (msg: string, opts?: Partial<ToastOptions>) => showToast({ message: msg, color: 'warning', ...opts })
    const info = (msg: string, opts?: Partial<ToastOptions>) => showToast({ message: msg, color: 'primary', ...opts })

    return {
        showToast,
        success,
        error,
        warning,
        info,
        /** Açık olan toast'u (varsa) kapatır. */
        dismiss: () => dismissActive(),
    }
}
