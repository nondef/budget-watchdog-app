import { computed, ComputedRef, onBeforeUnmount, Ref, watch } from "vue";
import Chart from "chart.js/auto";
import { MonthData } from "@/composables/data/useMonthData";
import { useMoney } from "@/composables/money/useMoney";

export type ChartTimeRange = 'day' | 'week' | 'month'
export type ChartTab = 'income' | 'expense' | 'total'

interface Options {
    canvasRef: Ref<HTMLCanvasElement | null>
    monthData: ComputedRef<MonthData>
    timeRange: Ref<ChartTimeRange>
    activeTab: Ref<ChartTab>
    monthLabel: Ref<string>
}

const COLOR = {
    income: '#10b981',
    expense: '#ef4444',
    neutral: '#6b7280'
}

export function useCashFlowChart(opts: Options) {
    const { canvasRef, monthData, monthLabel, activeTab, timeRange } = opts
    const { formatMoney, baseCurrency } = useMoney()

    let chartInstance: Chart | null = null

    const series = computed(() => {
        const m = monthData.value

        if (timeRange.value === 'day') {
            return buildDailySeries(m, activeTab.value, monthLabel.value)
        }

        if (timeRange.value === 'week') {
            return buildWeeklySeries(m, activeTab.value)
        }

        return buildMonthlySeries(m, activeTab.value, monthLabel.value)
    })

    const render = () => {
        if (!canvasRef?.value) return

        const ctx = canvasRef.value.getContext('2d')

        if (!ctx) return

        chartInstance?.destroy()

        const { labels, data, color } = series.value

        chartInstance = new Chart(ctx, {
            type: timeRange.value === 'month' ? 'bar' : 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: baseCurrency.value?.code ?? '',
                        data,
                        borderWidth: 2,
                        borderColor: color,
                        backgroundColor: `${color}20`,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: color,
                        pointRadius: 4,
                    },
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (v) => formatMoney(Number(v))
                        }
                    },
                    x: {
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => formatMoney(Number(ctx.parsed.y))
                        }
                    }
                }
            }
        })
    }

    watch([canvasRef, series, timeRange], () => render(), { flush: 'post' })

    onBeforeUnmount(() => {
        chartInstance?.destroy()
        chartInstance = null
    })

    return { redraw: render }
}

// Builders

function buildDailySeries(m: MonthData, tab: ChartTab, monthLabel: string) {
    const step = Math.max(1, Math.ceil(m.daysInMonth / 7))
    const labels = []
    const data = []

    for (let day = 1; day <= m.daysInMonth; day += step) {
        const d = m.daily[day - 1] ?? { income: 0, expense: 0 }
        labels.push(`${monthLabel.substring(0, 3)} ${String(day).padStart(2, '0')}`)
        data.push(pickValue(d.income, d.expense, tab))
    }

    return { labels, data, color: pickColor(data, tab) }
}

function buildWeeklySeries(m: MonthData, tab: ChartTab) {
    const weeks = Array.from({ length: 4 }, () => ({ income: 0, expense: 0 }))

    m.daily.forEach((d, i) => {
        const w = Math.min(Math.floor(i / 7), 3)
        weeks[w].income += d.income
        weeks[w].expense += d.expense
    })

    const labels = ['Hafta 1', 'Hafta 2', 'Hafta 3', 'Hafta 4']
    const data = weeks.map(w => pickValue(w.income, w.expense, tab))

    return { labels, data, color: pickColor(data, tab) }
}

function buildMonthlySeries(m: MonthData, tab: ChartTab, monthLabel: string) {
    const value = pickValue(m.income, m.expense, tab)

    return {
        labels: [monthLabel],
        data: [value],
        color: pickColor([value], tab)
    }
}

function pickValue(income: number, expense: number, tab: ChartTab) {
    if (tab === 'income') return income
    if (tab === 'expense') return expense

    return income - expense
}

function pickColor(data: number[], tab: ChartTab) {
    if (tab === 'income') return COLOR.income
    if (tab === 'expense') return COLOR.expense

    const sum = data.reduce((a, b) => a + b, 0)

    return sum >= 0 ? COLOR.income : COLOR.expense
}
