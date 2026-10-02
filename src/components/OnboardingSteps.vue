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
        class="onboarding-step flex items-center justify-center size-6 rounded-full text-[11px] font-bold transition-colors"
        :aria-current="i === current ? 'step' : undefined"
        :class="i === current
          ? 'onboarding-step--current'
          : i < current
            ? 'onboarding-step--completed'
            : 'onboarding-step--pending'"
      >{{ i }}</span>
      <span
        v-if="i < total"
        class="onboarding-connector h-0.5 w-4 rounded-full transition-colors"
        :class="{ 'onboarding-connector--completed': i < current }"
        aria-hidden="true"
      />
    </template>
  </div>
</template>

<style scoped>
.onboarding-step {
  border: 1px solid transparent;
}

.onboarding-step--current {
  background: var(--c-primary);
  color: var(--c-on-primary);
  border-color: var(--c-primary);
}

.onboarding-step--completed {
  background: var(--md-secondary-container);
  color: var(--md-on-secondary-container);
  border-color: var(--c-line-strong);
}

.onboarding-step--pending {
  background: var(--c-surface-sunken);
  color: var(--c-content-muted);
  border-color: var(--c-line);
}

.onboarding-connector {
  background: var(--c-line-strong);
}

.onboarding-connector--completed {
  background: var(--c-primary);
}
</style>
