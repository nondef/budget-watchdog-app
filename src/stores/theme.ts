import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import { SafeArea, SystemBarsStyle } from '@capacitor-community/safe-area';
import type { ThemeMode } from '@/domain/value-objects/theme';
import { Theme } from '@/domain/value-objects/theme';
import { useAppStore } from '@/stores/app';

const DARK_CLASS = 'ion-palette-dark';

/* Native sistem çubukları (status bar + navigation bar) ikon rengi.
   Dark'ta açık (SystemBarsStyle.Dark) ikonlar, light'ta koyu
   (SystemBarsStyle.Light) ikonlar; aksi halde dark zeminde ikonlar siyah
   kalıyordu.

   @capacitor/status-bar yerine safe-area plugin'inin System Bars API'si
   kullanılıyor: ikisi birlikte kullanılınca pencere inset'lerini ayrı ayrı
   yönetip çakışıyorlar (bkz. plugin README "Setup"). Edge-to-edge modunda
   çubuklar zaten şeffaf olduğu için setBackgroundColor karşılığı yok —
   status bar zeminini App.vue'daki `.status-bar-scrim` boyuyor. */
const applyStatusBar = (dark: boolean) => {
    if (!Capacitor.isNativePlatform()) return;
    SafeArea.setSystemBarsStyle({
        style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    }).catch(() => {});
};
const MODE_STORAGE_KEY = 'bw:theme-mode';

const VALID_MODES: ThemeMode[] = ['light', 'dark', 'system'];

const readStoredMode = (): ThemeMode | null => {
    if (typeof localStorage === 'undefined') return null;
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    return stored && VALID_MODES.includes(stored as ThemeMode)
        ? (stored as ThemeMode)
        : null;
};

export const useThemeStore = defineStore('theme', () => {
    const mode = ref<ThemeMode>('system');
    const systemPrefersDark = ref(false);

    let mediaQuery: MediaQueryList | null = null;
    let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

    const isDark = computed(() => {
        if (mode.value === 'system') return systemPrefersDark.value;
        return mode.value === 'dark';
    });

    const applyToDom = () => {
        document.documentElement.classList.toggle(DARK_CLASS, isDark.value);
        applyStatusBar(isDark.value);
    };

    const watchSystem = () => {
        if (typeof window === 'undefined' || !window.matchMedia) return;

        if (mediaQuery && mediaListener) {
            mediaQuery.removeEventListener('change', mediaListener);
        }

        mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        systemPrefersDark.value = mediaQuery.matches;

        mediaListener = (e) => {
            systemPrefersDark.value = e.matches;
            if (mode.value === 'system') applyToDom();
        };
        mediaQuery.addEventListener('change', mediaListener);
    };

    /**
     * Tema modunu başlatır.
     * - initialMode verilirse (DB kaynak-of-truth, guard'dan gelir) o kullanılır
     *   ve localStorage senkronlanır.
     * - Verilmezse (main.ts açılış çağrısı) localStorage'daki son seçim
     *   senkron okunur → DB async okumasını beklemeden flash'sız doğru tema.
     */
    const initialize = (initialMode?: ThemeMode) => {
        mode.value = initialMode ?? readStoredMode() ?? 'system';

        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(MODE_STORAGE_KEY, mode.value);
        }

        watchSystem();
        applyToDom();
    };

    const setMode = async (next: ThemeMode) => {
        if (mode.value === next) return;
        mode.value = next;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(MODE_STORAGE_KEY, next);
        }
        applyToDom();

        const appStore = useAppStore();
        await appStore.changeTheme(Theme.from(next));
    };

    return {
        mode,
        isDark,
        systemPrefersDark,
        initialize,
        setMode,
    };
});
