<script setup lang="ts">
/**
 * Değeri değişince kayarak yenilenen metin (`value-swap` geçişi).
 *
 * Her tutarı `<transition><span :key>` ile sarmak şablonları boğuyordu; bu
 * bileşen aynı işi tek satırda yapıyor. Metin `key` olduğu için aynı değer
 * yeniden gelirse animasyon oynamaz. Kök Transition olduğundan verilen
 * sınıflar doğrudan span'e düşer.
 */
defineProps<{ text: string | number }>()
</script>

<template>
  <transition name="value-swap" mode="out-in">
    <span :key="text" class="swap-text">{{ text }}</span>
  </transition>
</template>
