<script setup lang="ts">
/**
 * Onboarding numaralı adım göstergesi (1‑2‑3).
 * İzinler (1) → Para Birimi (2) → İlk Cüzdan (3).
 *
 * `current` aktif adımı belirler: geçilmiş adımlar dolu (soluk), aktif adım
 * vurgulu, sonraki adımlar nötr. Her sayfa kendi adım numarasını verir.
 */
withDefaults(defineProps<{ current: number; total?: number }>(), { total: 3 });
</script>

<template>
  <div class="flex items-center justify-center gap-2">
    <template v-for="i in total" :key="i">
      <span
        class="flex items-center justify-center size-6 rounded-full text-[11px] font-bold transition-all"
        :class="i === current
          ? 'dark:bg-gray-100 dark:text-black text-white'
          : i < current
            ? 'dark:bg-slate-200/10 dark:text-white bg-slate-200/90 text-black'
            : 'bg-surface-strong text-content-muted'"
      >{{ i }}</span>
      <span
        v-if="i < total"
        class="h-px w-4 rounded-full transition-colors"
        :class="i < current ? 'bg-line-strong' : 'bg-line-strong'"
      />
    </template>
  </div>
</template>
