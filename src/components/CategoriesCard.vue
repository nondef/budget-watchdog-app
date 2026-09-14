<script setup lang="ts">
import { IonIcon } from '@ionic/vue';
import { swapHorizontalOutline } from 'ionicons/icons';
import { defineEmits, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Percentage } from "@/domain";
import { getIconByName } from "@/shared/utils";
import { TimeRange } from "@/shared/utils/date";

interface CategoryRow {
  id: string
  name: string
  icon: { name: string; color: string }
  amount: string
  amountValue: number
  percentage: Percentage
}

interface Props {
  categories: CategoryRow[]
  dateText: string
  mode: 'expense' | 'income'
}

withDefaults(defineProps<Props>(), {
  categories: () => [],
  dateText: 'Mart 2025',
  mode: 'expense'
})

const emit = defineEmits<{
  (e: 'toggleMode'): void
  (e: 'timeRangeChange', rangeId: TimeRange): void
}>();

const handleToggle = (event: Event) => {
  event.stopPropagation();
  emit('toggleMode');
};

const selectTimeRange = (rangeId: TimeRange, event: Event) => {
  event.stopPropagation()
  activeRange.value = rangeId
  emit('timeRangeChange', rangeId);
};

const colorMap: Record<string, string> = {
  'bg-red-500': '#ef4444', 'bg-red-600': '#dc2626',
  'bg-pink-500': '#ec4899', 'bg-pink-600': '#db2777',
  'bg-purple-500': '#a855f7', 'bg-purple-600': '#9333ea',
  'bg-blue-500': '#3b82f6', 'bg-blue-600': '#2563eb',
  'bg-indigo-500': '#777777', 'bg-indigo-600': '#5e5e5e',
  'bg-green-500': '#10b981', 'bg-green-600': '#059669',
  'bg-emerald-500': '#10b981', 'bg-emerald-600': '#059669',
  'bg-yellow-500': '#f59e0b', 'bg-yellow-600': '#d97706',
  'bg-teal-500': '#14b8a6', 'bg-teal-600': '#0d9488',
  'bg-orange-500': '#f97316', 'bg-orange-600': '#ea580c',
  'bg-slate-500': '#64748b',
}

const barColor = (cls: string) => colorMap[cls.replace('-100', '-500')] || '#64748b'

const { t } = useI18n();

const activeRange = ref<TimeRange>('thisMonth')

const timeRanges = computed(() => [
  { id: 'today' as TimeRange, label: t('common.timeRanges.today') },
  { id: 'thisWeek' as TimeRange, label: t('common.timeRanges.thisWeek') },
  { id: 'thisMonth' as TimeRange, label: t('common.timeRanges.thisMonth') },
  { id: 'thisYear' as TimeRange, label: t('common.timeRanges.thisYear') },
  { id: 'allTime' as TimeRange, label: t('common.timeRanges.allTime') }
]);
</script>

<template>
  <section class="bg-surface rounded-2xl px-4">
    <header class="flex items-center justify-between py-4">
      <div>
        <h3 class="text-[14px] font-semibold text-content">{{ $t('cards.categoriesTitle') }}</h3>
        <p class="text-[11px] text-content-muted mt-0.5">{{ dateText }}</p>
      </div>

      <button
          class="inline-flex items-center gap-1 px-2.5 h-7 rounded-full text-[11px] font-medium text-content-secondary border border-line-strong active:bg-surface-strong transition shrink-0"
          @click="handleToggle"
      >
        <ion-icon :icon="swapHorizontalOutline" class="size-3" />
        {{ mode === 'expense' ? $t('common.expense') : $t('common.income') }}
      </button>
    </header>

    <!-- Tarih pill switcher -->
    <div class="-mx-1 mb-3">
      <div class="flex gap-1 overflow-x-auto px-1 pb-1 no-scrollbar">
        <button
            v-for="r in timeRanges"
            :key="r.id"
            type="button"
            class="px-3 h-8 rounded-full text-[12px] font-semibold transition shrink-0"
            :class="activeRange === r.id
                ? 'bg-inverse-surface text-inverse-on-surface'
                : 'bg-surface-sunken text-content-tertiary active:bg-surface-strong'"
            @click.stop="selectTimeRange(r.id, $event)"
        >
          {{ r.label }}
        </button>
      </div>
    </div>

    <div v-if="categories.length" class="pb-2">
      <div
          v-for="(c, idx) in categories.slice(0, 5)"
          :key="c.id"
          class="py-3"
          :class="{ 'border-t border-line': idx !== 0 }"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5 min-w-0">
            <div
                class="size-9 rounded-full flex items-center justify-center shrink-0 text-white"
                :class="c.icon.color"
            >
              <ion-icon :icon="getIconByName(c.icon.name)" class="size-[16px]" />
            </div>
            <span class="text-[13px] text-content truncate">{{ c.name }}</span>
          </div>
          <div class="text-right shrink-0">
            <div class="text-[13px] font-medium text-content tabular-nums leading-tight">
              {{ c.amount }}
            </div>
            <div class="text-[11px] text-content-muted tabular-nums leading-tight">
              %{{ c.percentage.value.toFixed(0) }}
            </div>
          </div>
        </div>

        <!-- Çizgi göstergesi -->
        <div class="mt-2 h-[3px] bg-surface-sunken rounded-full overflow-hidden">
          <div
              class="h-full rounded-full"
              :style="{ width: `${c.percentage.value}%`, backgroundColor: barColor(c.icon.color) }"
          />
        </div>
      </div>
    </div>

    <div v-else class="py-6 text-center text-[13px] text-content-muted">
      {{ $t('common.noData') }}
    </div>
  </section>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
</style>
