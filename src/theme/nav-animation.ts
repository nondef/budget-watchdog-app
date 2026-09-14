import { createAnimation, type Animation } from '@ionic/vue';

/**
 * Modern sayfa geçiş animasyonu (Material "shared-axis X" esinli).
 *
 * Ionic'in stack navigasyonunda (route push/pop) kullanılır. Tab geçişleri
 * yön 'none' ile commit edildiği için BURASI tab'ları etkilemez — onlar
 * TabsPage.vue içindeki MutationObserver ile ayrıca animasyonlanır.
 *
 * - Giren sayfa: hafif yatay kayma + ölçek ile fade-in (derinlik hissi)
 * - Çıkan sayfa: ters yöne küçük kayma + ölçek ile fade-out
 * - `direction` 'forward' ise içerik soldan sağa akar, 'back' ise tersi.
 */
export const modernNavAnimation = (
    _baseEl: HTMLElement,
    opts: {
      enteringEl: HTMLElement;
      leavingEl?: HTMLElement;
      direction?: 'forward' | 'back';
      duration?: number;
    },
): Animation => {
  const { enteringEl, leavingEl, direction } = opts;
  const forward = direction !== 'back';
  const shift = forward ? 28 : -28;

  const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const duration = reduceMotion ? 1 : opts.duration ?? 320;

  const root = createAnimation()
      .duration(duration)
      .easing('cubic-bezier(0.32, 0.72, 0, 1)');

  const enter = createAnimation()
      .addElement(enteringEl)
      .beforeStyles({ 'transform-origin': 'center center', 'will-change': 'transform, opacity' })
      .afterClearStyles(['transform', 'opacity', 'will-change'])
      .fromTo('opacity', 0, 1);

  if (!reduceMotion) {
    enter.fromTo(
        'transform',
        `translateX(${shift}px) scale(0.97)`,
        'translateX(0) scale(1)',
    );
  }

  root.addAnimation(enter);

  if (leavingEl) {
    const leave = createAnimation()
        .addElement(leavingEl)
        .beforeStyles({ 'transform-origin': 'center center', 'will-change': 'transform, opacity' })
        .afterClearStyles(['transform', 'opacity', 'will-change'])
        .fromTo('opacity', 1, 0);

    if (!reduceMotion) {
      leave.fromTo(
          'transform',
          'translateX(0) scale(1)',
          `translateX(${-shift}px) scale(0.97)`,
      );
    }

    root.addAnimation(leave);
  }

  return root;
};
