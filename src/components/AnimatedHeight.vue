<script setup lang="ts">
/**
 * İçeriği uzayıp kısaldıkça yüksekliğini animasyonla değiştiren kutu.
 *
 * CSS `height: auto`ya geçiş yapamıyor; bu yüzden iç kutunun gerçek
 * yüksekliği ResizeObserver ile ölçülüp dış kutuya piksel olarak yazılıyor,
 * geçişi de dış kutunun `transition: height`i yapıyor. İlk ölçümden önce
 * stil yok (auto), dolayısıyla açılışta animasyon oynamaz.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'

const inner = ref<HTMLElement>()
const height = ref<number>()

let observer: ResizeObserver | undefined

onMounted(() => {
  if (!inner.value) return
  observer = new ResizeObserver(([entry]) => {
    const next = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height
    // Ionic başka sekmedeki sayfayı `display: none` ile gizliyor; o an ölçüm 0
    // gelir. Yazılsaydı sekmeye dönüşte kutu sıfırdan büyürdü. Kullanılan
    // yerlerde gerçek içerik hiçbir zaman 0 değil (boş durumun da dolgusu var).
    if (next > 0) height.value = next
  })
  observer.observe(inner.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="animated-height" :style="height !== undefined ? { height: `${height}px` } : undefined">
    <div ref="inner">
      <slot />
    </div>
  </div>
</template>

<style scoped>
/* Taşan (çıkan/kayan) satırlar kartın dışına sarkmasın. */
.animated-height {
  overflow: hidden;
  transition: height 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  .animated-height {
    transition: none;
  }
}
</style>
