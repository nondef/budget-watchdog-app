<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { TimeRange } from "@/shared/utils/date";

interface TimeRangeOption {
  id: TimeRange
  label: string
}

const { t } = useI18n();

defineProps({
  total: { type: String, default: '' },
  income: { type: String, default: '' },
  expense: { type: String, default: '' },
  dateText: { type: String, default: '' }
});

const emit = defineEmits(['timeRangeChange']);

const timeRanges = computed<TimeRangeOption[]>(() => [
  { id: 'today', label: t('common.timeRanges.today') },
  { id: 'thisWeek', label: t('common.timeRanges.thisWeek') },
  { id: 'thisMonth', label: t('common.timeRanges.thisMonth') },
  { id: 'thisYear', label: t('common.timeRanges.thisYear') },
  { id: 'allTime', label: t('common.timeRanges.allTime') }
]);

const activeRange = ref<TimeRange>('thisMonth')

const selectTimeRange = (rangeId: TimeRange) => {
  activeRange.value = rangeId
  emit('timeRangeChange', rangeId);
};
</script>

<template>
  <section class="bg-surface rounded-2xl px-4">
    <header class="flex items-start justify-between py-4">
      <div>
        <h3 class="text-[14px] font-semibold text-content">{{ $t('cards.cashFlowTitle') }}</h3>
        <p class="text-[11px] text-content-muted mt-0.5">{{ dateText }}</p>
      </div>
    </header>

    <!-- Yatay pill switcher -->
    <div class="-mx-1 mb-3">
      <div class="flex gap-1 overflow-x-auto px-1 pb-1 no-scrollbar">
        <button
            v-for="r in timeRanges"
            :key="r.id"
            type="button"
            class="px-3 h-8 rounded-full text-[12px] font-semibold transition shrink-0"
            :class="activeRange === r.id
                ? 'bg-gray-800 dark:bg-gray-100/10 text-white'
                : 'bg-surface-sunken text-content-tertiary active:bg-slate-100 dark:active:bg-gray-100/10'"
            @click="selectTimeRange(r.id)"
        >
          {{ r.label }}
        </button>
      </div>
    </div>

    <div class="pb-3">
      <div class="flex items-center justify-between py-2">
        <div class="flex items-center gap-2">
          <span class="size-1.5 rounded-full bg-emerald-500" />
          <span class="text-[13px] text-content-tertiary">{{ $t('common.income') }}</span>
        </div>
        <span class="text-[14px] font-medium text-content tabular-nums">{{ income }}</span>
      </div>

      <div class="flex items-center justify-between py-2 border-t border-line">
        <div class="flex items-center gap-2">
          <span class="size-1.5 rounded-full bg-rose-500" />
          <span class="text-[13px] text-content-tertiary">{{ $t('common.expense') }}</span>
        </div>
        <span class="text-[14px] font-medium text-content tabular-nums">{{ expense }}</span>
      </div>

      <div class="flex items-center justify-between py-3 px-3 mt-2 rounded-xl bg-indigo-50 dark:bg-gray-100/10">
        <span class="text-[13px] font-medium text-indigo-900 dark:text-white">{{ $t('common.net') }}</span>
        <span class="text-[15px] font-bold text-indigo-700 tabular-nums dark:text-white">{{ total }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
</style>
