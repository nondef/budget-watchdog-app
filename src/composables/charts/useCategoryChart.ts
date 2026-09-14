import { ComputedRef, onBeforeUnmount, Ref, watch } from "vue";
import { useMoney } from "@/composables/money/useMoney";
import { tailwindToHex } from "@/shared/utils/ui/colors";
import Chart from "chart.js/auto";
import { Percentage } from '@/domain';

interface CategoryChartItem {
    name: string;
    amount: number;
    percentage: Percentage;
    icon: { color: string };
}

export function useCategoryChart(
    canvasRef: Ref<HTMLCanvasElement | null>,
    categories: ComputedRef<CategoryChartItem[]>,
) {
    const { formatMoney } = useMoney()
    let chartInstance: Chart | null = null

    const render = () => {
        if (!canvasRef.value) return
        chartInstance?.destroy()

        const hasData = categories.value.length > 0

        chartInstance = new Chart(canvasRef.value.getContext('2d')!, {
            type: 'doughnut',
            data: hasData
                ? {
                    labels: categories.value.map(c => c.name),
                    datasets: [{
                        data: categories.value.map(c => c.amount),
                        backgroundColor: categories.value.map(c => tailwindToHex(c.icon.color)),
                        borderWidth: 0,
                        hoverOffset: 4,
                    }],
                }
                : {
                    labels: [''],
                    datasets: [{ data: [1], backgroundColor: '#e5e7eb', borderWidth: 0 }],
                },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                animation: { duration: hasData ? 600 : 0 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: hasData,
                        callbacks: {
                            label: (ctx) => {
                                const c = categories.value[ctx.dataIndex]
                                return ` ${c.name}: ${formatMoney(c.amount)} (%${Math.round(c.percentage.value)})`
                            },
                        },
                    },
                },
            },
        })
    }

    watch([canvasRef, categories], render, { flush: 'post' })
    onBeforeUnmount(() => chartInstance?.destroy())
}
