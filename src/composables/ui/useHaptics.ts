import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

/**
 * Dokunsal geri bildirim tek yerden: ileride "titreşimi kapat" gibi bir ayar
 * eklenirse yalnızca burası değişir.
 *
 * Çağrılar bilinçli olarak beklenmez ve hataları yutulur: web'de ya da
 * titreşimi olmayan cihazda plugin reddeder, bu kullanıcı akışını durdurmamalı.
 *
 * Kullanım yeri PIN akışı: girilen rakam ekranda yalnızca nokta olarak
 * görünür, dokunuşun alındığını hissettiren şey titreşimdir. Toggle'lar
 * zaten görsel olarak durum değiştirdiği için burada kullanılmaz.
 */
export function useHaptics() {
    const fire = (run: () => Promise<void>) => {
        void run().catch(() => {});
    };

    return {
        /** Tuş basımı gibi hafif onay. */
        tap: () => fire(() => Haptics.impact({ style: ImpactStyle.Light })),
        success: () => fire(() => Haptics.notification({ type: NotificationType.Success })),
        error: () => fire(() => Haptics.notification({ type: NotificationType.Error })),
    };
}
