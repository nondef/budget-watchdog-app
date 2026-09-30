<script setup lang="ts">
/**
 * `v-if` ile gelip giden bir bloğu yüksekliğiyle birlikte açıp kapatır;
 * altındaki içerik zıplamak yerine yukarı/aşağı kayar.
 *
 * Saf CSS ile yapılamıyor: `height: auto`ya geçiş yok ve `max-height` hilesi
 * gerçek yükseklik bilinmeden süreyi bozuyor. Bu yüzden JS kancaları doğal
 * boyutu ölçüp yükseklik, dolgu, kenarlık ve dış boşluğu 0 ↔ doğal değer
 * arasında taşıyor. Dış boşluk da dahil: Ana Sayfa kartları arası boşluk
 * her kartın kendi `margin-bottom`u, kapanan kart onu da götürmeli.
 */
const DURATION_MS = 260

type StyleKey = 'height' | 'paddingTop' | 'paddingBottom' | 'marginTop' | 'marginBottom'
    | 'borderTopWidth' | 'borderBottomWidth' | 'opacity'

const COLLAPSED: Record<StyleKey, string> = {
  height: '0px',
  paddingTop: '0px',
  paddingBottom: '0px',
  marginTop: '0px',
  marginBottom: '0px',
  borderTopWidth: '0px',
  borderBottomWidth: '0px',
  opacity: '0',
}

const KEYS = Object.keys(COLLAPSED) as StyleKey[]

const TRANSITION = KEYS
    .map(k => `${k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)} ${DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`)
    .join(', ')

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const apply = (el: HTMLElement, values: Partial<Record<StyleKey, string>>) => {
  for (const k of KEYS) el.style[k] = values[k] ?? ''
}

const clear = (el: HTMLElement) => {
  apply(el, {})
  el.style.overflow = ''
  el.style.transition = ''
}

// Stil değişikliğinin geçişten önce uygulanması için düzeni zorla.
const reflow = (el: HTMLElement) => void el.offsetHeight

const onEnter = (el: Element, done: () => void) => {
  const node = el as HTMLElement
  if (reducedMotion()) return done()

  const natural = node.offsetHeight
  node.style.overflow = 'hidden'
  apply(node, COLLAPSED)
  reflow(node)

  node.style.transition = TRANSITION
  // Yükseklik dışındakiler boş bırakılınca kendi (CSS'teki) değerlerine döner.
  apply(node, { height: `${natural}px` })
  setTimeout(done, DURATION_MS)
}

const onLeave = (el: Element, done: () => void) => {
  const node = el as HTMLElement
  if (reducedMotion()) return done()

  node.style.height = `${node.offsetHeight}px`
  node.style.overflow = 'hidden'
  reflow(node)

  node.style.transition = TRANSITION
  apply(node, COLLAPSED)
  setTimeout(done, DURATION_MS)
}
</script>

<template>
  <transition
      :css="false"
      @enter="onEnter"
      @after-enter="el => clear(el as HTMLElement)"
      @enter-cancelled="el => clear(el as HTMLElement)"
      @leave="onLeave"
  >
    <slot />
  </transition>
</template>
