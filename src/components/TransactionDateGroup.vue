<script setup lang="ts">
import { TransactionDTO } from "@/application";
import TransactionListItem from "@/components/TransactionListItem.vue";
import AnimatedHeight from "@/components/AnimatedHeight.vue";

defineProps<{
  title: string,
  items: TransactionDTO[]
}>()

const emit = defineEmits<{
  selectTransaction: [transaction: TransactionDTO]
}>()
</script>

<template>
  <section class="bg-surface rounded-2xl px-4 mb-3">
    <div class="sticky top-0 z-10 -mx-4 px-4 py-3 bg-surface/95 backdrop-blur border-b border-line rounded-t-2xl">
      <p class="text-[12px] font-semibold text-content-muted uppercase tracking-wider">
        {{ title }}
      </p>
    </div>

    <!-- Arama/filtre değişince satırlar girer/çıkar, grup kartı da yumuşakça
         uzar/kısalır. Yapışkan başlık dışarıda: AnimatedHeight'in
         `overflow: hidden`ı onu bozmasın. -->
    <animated-height>
      <transition-group tag="div" name="list-row" class="relative py-1">
        <TransactionListItem
            v-for="(item, idx) in items"
            :key="item.id"
            :transaction="item"
            @click="emit('selectTransaction', item)"
            :class="{ 'border-t border-line': idx !== 0 }"
        />
      </transition-group>
    </animated-height>
  </section>
</template>
