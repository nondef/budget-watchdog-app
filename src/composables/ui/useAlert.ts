import { alertController } from "@ionic/vue";
import type { AlertButton, AlertInput, AlertOptions as IonAlertOptions } from "@ionic/vue";
import type { OverlayEventDetail } from "@ionic/core";

/** dismiss() çağrılarında ve onDidDismiss sonucunda dönen roller. */
export const ALERT_ROLE = {
    /** Kullanıcı iptal butonuyla veya donanım geri tuşuyla kapattı. */
    cancel: 'cancel',
    /** Kullanıcı backdrop'a (alert dışına) tıkladı. */
    backdrop: 'backdrop',
    /** Kullanıcı onay butonuna bastı. */
    confirm: 'confirm',
    /** Yıkıcı (geri alınamaz) aksiyon onaylandı. */
    destructive: 'destructive',
} as const

interface AlertOptions {
    header?: string
    subHeader?: string
    /** Ionic varsayılanı gereği düz metin; HTML için innerHTMLTemplatesEnabled gerekir. */
    message?: string
    /**
     * Form alanları. Ionic kuralı: radio, checkbox ve text input'lar
     * aynı alert içinde karıştırılamaz.
     */
    inputs?: AlertInput[]
    /**
     * Butonlar sırayla dizilir; `role: 'cancel'` her zaman en sonda gösterilir.
     * handler'dan `false` dönmek alert'in kapanmasını engeller (ör. doğrulama).
     */
    buttons?: AlertButton[]
    /** Backdrop'a tıklayınca kapansın mı? Varsayılan true; kritik onaylarda false ver. */
    backdropDismiss?: boolean
    cssClass?: string | string[]
    htmlAttributes?: IonAlertOptions['htmlAttributes']
}

interface ConfirmOptions {
    header: string
    message?: string
    subHeader?: string
    /** Onay butonu metni. Varsayılan 'Tamam'. */
    confirmText?: string
    /** İptal butonu metni. Varsayılan 'Vazgeç'. */
    cancelText?: string
    /**
     * true ise onay butonu 'destructive' rolü alır (iOS'ta kırmızı görünür)
     * ve yanlışlıkla kapanmasın diye backdrop ile kapatma kapatılır.
     */
    destructive?: boolean
    backdropDismiss?: boolean
}

interface PromptOptions extends ConfirmOptions {
    /** AppInput tipi. Varsayılan 'text'. */
    inputType?: 'text' | 'number' | 'email' | 'password' | 'textarea'
    placeholder?: string
    /** Başlangıç değeri. */
    value?: string
    /** AppInput'a geçirilecek ek attribute'lar (autocapitalize, maxlength...). */
    attributes?: AlertInput['attributes']
    /**
     * Onay anında doğrulama: false dönerse alert açık kalır,
     * string dönerse o mesaj message alanının yerine yazılır ve alert açık kalır.
     */
    validate?: (value: string) => boolean | string
}

export interface AlertHandle {
    /** Alert'i programatik kapatır. */
    dismiss: (data?: unknown, role?: string) => Promise<boolean>
    /** Alert kapanınca çözülür; { data, role } döner. */
    onDidDismiss: <T = unknown>() => Promise<OverlayEventDetail<T>>
}

/** Yeni bir alert açılırken eskisi programatik kapatıldığında dönen rol. */
export const ALERT_REPLACED_ROLE = 'replaced'

/**
 * Aynı anda tek alert: yenisi gelince öncekini kapatırız ki üst üste binmesin.
 * create() ile present() arasındaki await boşluğunda hızlı tekrar eden tetikler
 * (çift ionChange, mount+watch) ikinci bir alert açamaz.
 */
let activeAlert: HTMLIonAlertElement | null = null

async function dismissActiveAlert(role: string = ALERT_REPLACED_ROLE): Promise<void> {
    if (!activeAlert) return
    const alert = activeAlert
    activeAlert = null
    await alert.dismiss(undefined, role)
}

/** Oluşturulan alert'i tekil olarak kaydeder ve sunar. */
async function presentSingle(alert: HTMLIonAlertElement): Promise<void> {
    await dismissActiveAlert()
    activeAlert = alert
    alert.onDidDismiss().then(() => {
        if (activeAlert === alert) activeAlert = null
    })
    await alert.present()
}

export function useAlert() {
    /** Tam kontrol gereken durumlar için ham API. */
    const showAlert = async (options: AlertOptions): Promise<AlertHandle> => {
        const alert = await alertController.create({
            header: options.header,
            subHeader: options.subHeader,
            message: options.message,
            // Ionic alert'in varsayılanı []'dir; undefined geçersek present()
            // içinde this.inputs.length okunurken patlar.
            inputs: options.inputs ?? [],
            buttons: options.buttons ?? [{ text: 'Tamam', role: ALERT_ROLE.confirm }],
            backdropDismiss: options.backdropDismiss ?? true,
            cssClass: options.cssClass,
            htmlAttributes: options.htmlAttributes,
        })

        await presentSingle(alert)

        return {
            dismiss: (data?: unknown, role?: string) => alert.dismiss(data, role),
            onDidDismiss: <T = unknown>() => alert.onDidDismiss<T>(),
        }
    }

    /** Basit bilgilendirme: tek 'Tamam' butonu, kapanana kadar bekler. */
    const info = async (header: string, message?: string): Promise<void> => {
        const alert = await showAlert({ header, message })
        await alert.onDidDismiss()
    }

    /**
     * Onay diyaloğu. Kullanıcı onayladıysa true, iptal/backdrop ise false döner.
     *
     *   if (await alert.confirm({ header: 'Silinsin mi?', destructive: true })) { ... }
     */
    const confirm = async (options: ConfirmOptions): Promise<boolean> => {
        const confirmRole = options.destructive ? ALERT_ROLE.destructive : ALERT_ROLE.confirm

        const alert = await showAlert({
            header: options.header,
            subHeader: options.subHeader,
            message: options.message,
            backdropDismiss: options.backdropDismiss ?? !options.destructive,
            buttons: [
                { text: options.cancelText ?? 'Vazgeç', role: ALERT_ROLE.cancel },
                { text: options.confirmText ?? 'Tamam', role: confirmRole },
            ],
        })

        const { role } = await alert.onDidDismiss()
        return role === confirmRole
    }

    /**
     * Tek input'lu giriş diyaloğu. Onaylanırsa girilen değeri,
     * iptal edilirse null döner. `validate` ile alert kapanmadan doğrulanır.
     */
    const prompt = async (options: PromptOptions): Promise<string | null> => {
        const confirmRole = options.destructive ? ALERT_ROLE.destructive : ALERT_ROLE.confirm

        const alert = await alertController.create({
            header: options.header,
            subHeader: options.subHeader,
            message: options.message,
            backdropDismiss: options.backdropDismiss ?? !options.destructive,
            inputs: [
                {
                    name: 'value',
                    type: options.inputType ?? 'text',
                    placeholder: options.placeholder,
                    value: options.value,
                    attributes: options.attributes,
                },
            ],
            buttons: [
                { text: options.cancelText ?? 'Vazgeç', role: ALERT_ROLE.cancel },
                {
                    text: options.confirmText ?? 'Tamam',
                    role: confirmRole,
                    handler: (data: { value?: string }) => {
                        if (!options.validate) return true
                        const result = options.validate(data.value ?? '')
                        if (result === true) return true
                        // false döndürmek alert'i açık tutar (Ionic davranışı)
                        if (typeof result === 'string') alert.message = result
                        return false
                    },
                },
            ],
        })

        await presentSingle(alert)

        const { role, data } = await alert.onDidDismiss<{ values: { value?: string } }>()
        if (role !== confirmRole) return null
        return data?.values?.value ?? ''
    }

    return {
        showAlert,
        info,
        confirm,
        prompt,
        /** Açık olan alert'i (varsa) kapatır. */
        dismiss: () => dismissActiveAlert(ALERT_ROLE.cancel),
    }
}
