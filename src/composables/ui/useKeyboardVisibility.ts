import { onBeforeUnmount, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import type { PluginListenerHandle } from '@capacitor/core'
import { logger } from '@/infrastructure/logging'

/** Klavye açıkken <html> üzerine basılan işaretçi sınıf (CSS kancası). */
const KEYBOARD_OPEN_CLASS = 'keyboard-open'

/**
 * Yazılım klavyesinin açık/kapalı durumunu izler.
 *
 * Android'de Capacitor activity'si `adjustResize` ile çalışır: klavye açılınca
 * WebView'in yüksekliği küçülür, dolayısıyla sayfanın en altına yapışan
 * `ion-footer` klavyenin ÜSTÜNDE asılı kalır. İstenen davranış, klavye
 * açıkken footer'ın (kaydet butonu vb.) tamamen gizlenmesi; kullanıcı klavyeyi
 * kapatınca geri gelmesi.
 *
 * Burada yalnızca durum yayınlanır ve `<html>` üzerine `.keyboard-open` sınıfı
 * basılır; görsel karar (hangi elemanın gizleneceği) variables.css'te tek bir
 * global kuralda tutulur — her sayfaya ayrı `v-if` yazmaya gerek kalmaz.
 *
 * App.vue'da BİR KEZ çağrılmalıdır.
 */
export function useKeyboardVisibility() {
    const isOpen = ref(false)
    const keyboardHeight = ref(0)
    const handles: PluginListenerHandle[] = []

    const apply = (open: boolean, height: number) => {
        isOpen.value = open
        keyboardHeight.value = height
        document.documentElement.classList.toggle(KEYBOARD_OPEN_CLASS, open)
        // Footer dışında bir şeyi klavyenin üstüne oturtmak isteyen ekranlar
        // için ölçüyü CSS'e de veriyoruz.
        document.documentElement.style.setProperty('--keyboard-height', `${height}px`)
    }

    // Web'de (dev sunucusu / tarayıcı) Keyboard plugin'i yok; tarayıcı zaten
    // layout'u küçültmediği için footer sorunu da oluşmuyor — sessizce atla.
    if (Capacitor.isPluginAvailable('Keyboard')) {
        // `willShow`/`willHide` kullanılıyor: `didShow` klavye animasyonu
        // bittikten sonra tetiklendiğinden footer bir kare boyunca klavyenin
        // üstünde görünüp sonra kayboluyordu.
        Keyboard.addListener('keyboardWillShow', info => apply(true, info.keyboardHeight))
            .then(handle => handles.push(handle))
            .catch(e => logger.warn('Klavye dinleyicisi kurulamadı', { context: 'Keyboard', error: e }))

        Keyboard.addListener('keyboardWillHide', () => apply(false, 0))
            .then(handle => handles.push(handle))
            .catch(e => logger.warn('Klavye dinleyicisi kurulamadı', { context: 'Keyboard', error: e }))
    }

    onBeforeUnmount(() => {
        handles.forEach(handle => void handle.remove())
        handles.length = 0
        apply(false, 0)
    })

    return { isOpen, keyboardHeight }
}
