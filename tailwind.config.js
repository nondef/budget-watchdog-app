/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '.ion-palette-dark'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      // Semantic renkler — tek kaynak src/theme/variables.css (--c-* değişkenleri).
      // Değerler light/dark'a göre otomatik değişir; bileşenlerde dark: prefix'i GEREKMEZ.
      colors: {
        // ── MARKA PRİMARY = Material 3 nötr gri (pastel/monokrom) tonal paleti ──
        // Uygulamadaki tüm `indigo-*` kullanımları (buton, seçili durum,
        // ikon vurgusu) MD3 nötr gri tonlarına işaret eder. Tek noktadan
        // marka rengi: burayı değiştir, 188 kullanım birden döner. Tonlar
        // HCT neutral tonal ölçeğine karşılık gelir (50≈tone95 … 950≈tone10).
        indigo: {
          50:  '#f1f1f1',  // N-95
          100: '#e2e2e2',  // N-90 — primary-container (light)
          200: '#c6c6c6',  // N-80 — primary (dark)
          300: '#ababab',  // N-70
          400: '#919191',  // N-60
          500: '#777777',  // N-50
          600: '#5e5e5e',  // N-40 — primary (light), birincil aksiyon
          700: '#474747',  // N-30
          800: '#303030',  // N-20
          900: '#1b1b1b',  // N-10
          950: '#111111',
        },
        page: 'var(--c-page)',               // sayfa zemini (ion-content yerine DOM'da)
        surface: {
          DEFAULT: 'var(--c-surface)',         // kart / sheet / modal
          sunken: 'var(--c-surface-sunken)',   // iç kutu, ikon zemini
          strong: 'var(--c-surface-strong)',   // track / chip / vurgu
        },
        content: {
          DEFAULT: 'var(--c-content)',             // birincil metin
          secondary: 'var(--c-content-secondary)', // etiket / alt başlık
          tertiary: 'var(--c-content-tertiary)',   // ikincil gövde
          muted: 'var(--c-content-muted)',         // caption / pasif
          faint: 'var(--c-content-faint)',         // ipucu / devre dışı
        },
        line: {
          DEFAULT: 'var(--c-line)',          // ince ayraç
          strong: 'var(--c-line-strong)',    // belirgin ayraç
        },
        // Hata durumu — ham `red-*` tema değişimini takip etmiyordu.
        error: 'var(--c-error)',
        inverse: {
          surface: 'var(--c-inverse-surface)',        // hero/vurgu kartı zemini
          'on-surface': 'var(--c-inverse-on-surface)',// üzerindeki metin
        },
      },
    },
  },
  plugins: [],
  safelist: [
    'text-emerald-500', 'text-emerald-600', 'bg-emerald-50', 'bg-emerald-100',
    'text-rose-500', 'text-rose-600', 'bg-rose-50', 'bg-rose-100',
    'text-blue-500', 'text-blue-600',
    { pattern: /^bg-(orange|blue|purple|pink|red|indigo|teal|gray|yellow|cyan|slate)-500$/ },
  ]
}