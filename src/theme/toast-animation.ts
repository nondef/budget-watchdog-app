import { createAnimation, type Animation } from '@ionic/vue';

/**
 * MD3 Snackbar giriş/çıkış animasyonu (ion-toast).
 *
 * Ionic'in md varsayılanı SADECE opacity 0.01→1 yapıyor (400ms), yani
 * snackbar hiç hareket etmiyor — en çok "web bileşeni" hissi veren kısım
 * bu. MD3'te snackbar alttan yukarı (üstteyse aşağı) kısa bir kayma ile
 * girer, çıkarken yalnızca söner ve çıkış girişten belirgin şekilde
 * kısadır.
 *
 * Süre/easing MD3 motion token'ları:
 *   giriş → duration-medium1 (250ms) + emphasized-decelerate
 *   çıkış → duration-short3  (150ms) + emphasized-accelerate
 *
 * DİKKAT — dinlenme (resting) transform'u:
 * Ionic wrapper'ı `.toast-bottom { bottom: 0; transform: translate3d(0,100%,0) }`
 * ile ekran dışında konumlandırır; nihai yeri animasyonun inline yazdığı
 * `translateY(opts.bottom)` belirler (opts.bottom içinde safe-area ve
 * positionAnchor hesabı vardır). Bu yüzden nihai transform'u beforeStyles
 * ile inline yazıyoruz: animasyonun fill stilleri temizlense bile toast
 * yerinde kalır. Aynı sebeple dinlenme ofsetini DEĞİŞTİRMİYORUZ —
 * swipe-to-dismiss jesti keyframe'lerini translateY(0) referansına göre
 * kurduğu için ofseti burada büyütmek jest başlarken zıplamaya yol açar.
 */

/** MD3 duration-medium1 */
const ENTER_DURATION = 250;
/** MD3 duration-short3 — çıkış her zaman girişten hızlı. */
const LEAVE_DURATION = 150;

const EMPHASIZED_DECELERATE = 'cubic-bezier(0.05, 0.7, 0.1, 1)';
const EMPHASIZED_ACCELERATE = 'cubic-bezier(0.3, 0, 0.8, 0.15)';

/** Girişteki kayma mesafesi (px). MD3 snackbar kısa bir yol kateder. */
const SLIDE_DISTANCE = 24;

type ToastPosition = 'top' | 'middle' | 'bottom';

interface ToastAnimationOptions {
    position: ToastPosition;
    /** Ionic'in hesapladığı üst dinlenme ofseti (CSS uzunluğu, calc olabilir). */
    top: string;
    /** Ionic'in hesapladığı alt dinlenme ofseti (CSS uzunluğu, calc olabilir). */
    bottom: string;
}

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const getWrapper = (baseEl: HTMLElement): HTMLElement | null =>
    (baseEl.shadowRoot ?? baseEl).querySelector('.toast-wrapper');

/**
 * position="middle" için wrapper'ın top değeri. Ionic bunu kendi
 * animasyonunda hesaplayıp inline yazıyor; kendi animasyonumuzu
 * verdiğimizde aynı işi biz yapmalıyız yoksa toast ekranın tepesinde kalır.
 */
const middleTop = (baseEl: HTMLElement, wrapperEl: HTMLElement) =>
    Math.floor(baseEl.clientHeight / 2 - wrapperEl.clientHeight / 2);

export const mdSnackbarEnterAnimation = (
    baseEl: HTMLElement,
    opts: ToastAnimationOptions,
): Animation => {
    const root = createAnimation()
        .duration(ENTER_DURATION)
        .easing(EMPHASIZED_DECELERATE);

    const wrapperEl = getWrapper(baseEl);
    if (!wrapperEl) return root;

    const reduceMotion = prefersReducedMotion();
    const { position } = opts;

    const wrapper = createAnimation()
        .addElement(wrapperEl)
        .afterClearStyles(['will-change'])
        .fromTo('opacity', 0.01, 1);

    if (position === 'middle') {
        // Ortada kayma yok: MD3 orta konumu bir diyalog gibi ele alır.
        wrapperEl.style.top = `${middleTop(baseEl, wrapperEl)}px`;
        if (!reduceMotion) {
            wrapper.fromTo('transform', 'scale(0.94)', 'scale(1)');
        }
    } else {
        const rest = position === 'top' ? opts.top : opts.bottom;
        // Nihai konum inline yazılır → fill stilleri gitse de yerinde kalır.
        wrapper.beforeStyles({ transform: `translateY(${rest})`, 'will-change': 'transform, opacity' });

        if (!reduceMotion) {
            // Üstte yukarıdan, altta aşağıdan gelir.
            const from =
                position === 'top'
                    ? `translateY(calc(${rest} - ${SLIDE_DISTANCE}px))`
                    : `translateY(calc(${rest} + ${SLIDE_DISTANCE}px))`;
            wrapper.fromTo('transform', from, `translateY(${rest})`);
        }
    }

    if (reduceMotion) root.duration(1);

    return root.addAnimation(wrapper);
};

export const mdSnackbarLeaveAnimation = (
    baseEl: HTMLElement,
    opts?: Partial<ToastAnimationOptions>,
): Animation => {
    const root = createAnimation()
        .duration(prefersReducedMotion() ? 1 : LEAVE_DURATION)
        .easing(EMPHASIZED_ACCELERATE);

    const wrapperEl = getWrapper(baseEl);
    if (!wrapperEl) return root;

    // MD3: çıkış sade bir fade. Kayma eklemek "kaçan" bir his veriyor;
    // ayrıca swipe ile kapatmada jestin transform'uyla çakışırdı.
    const wrapper = createAnimation()
        .addElement(wrapperEl)
        .fromTo('opacity', 0.99, 0);

    // opts yalnızca ileride konuma bağlı bir çıkış istersek diye alınıyor.
    void opts;

    return root.addAnimation(wrapper);
};
