# Budget Watchdog — Tasarım Sistemi (Material Design 3)

Stack: **Ionic 8 + Vue 3 + TailwindCSS**. Tüm ekranlar aşağıdaki beş kurala uyar.
Tek renk kaynağı: [`src/theme/variables.css`](../src/theme/variables.css) — MD3 renk rolleri (`--md-*`)
ve onlara eşlenen semantik tokenlar (`--c-*`). Tailwind utility'leri bu tokenlara
[`tailwind.config.js`](../tailwind.config.js) üzerinden bağlıdır.

---

## 1. Bileşenler — Ionic

Yapısal UI daima Ionic bileşenidir: `IonCard`, `IonItem`, `IonInput`, `IonSelect`,
`IonToggle`, `IonSegment`… Ionic bileşenlerinin görünümü **global CSS'te bir kez**
MD3'e bağlanmıştır; sayfa içinde bileşen başına renk/gölge override YAZMA.

Hazır MD3 sınıfları (variables.css):

| Sınıf | Bileşen | MD3 karşılığı |
|---|---|---|
| *(taban)* `ion-card` | kart | elevated card zemini (`surface-container-low`), gölgesiz, 12px köşe |
| `.card-filled` | `ion-card` | filled card — `surface-container-highest` |
| `.card-outlined` | `ion-card` | outlined card — `surface` + `outline-variant` çerçeve |
| `.card-inverse` | `ion-card` | hero/vurgu kartı — inverse surface (light'ta koyu, dark'ta açık) |
| `fill="solid"` | `ion-input/textarea/select` | filled text field — **form alanlarında standart** |
| `.md3-picker` | `ion-item` | filled field görünümlü tıklanır seçici satır |
| `.md3-seg-btn` / `--selected` | `ion-segment-button` | segmented buttons |
| `.plain-toggle` | `ion-toggle` | MD3 switch |
| `.plain-progress` | `ion-progress-bar` | ince progress (track: container-highest, dolgu: primary) |
| `.app-button` | `ion-button` | birincil CTA — nötr inverse zemin, 52px, 1rem köşe |
| `.cat-chip` / `.add-chip` | `ion-chip` | assist/filter chip |

## 2. Stil — Tailwind sadece layout / spacing / hiyerarşi

Tailwind utility'leri şunlar için kullanılır: `flex/grid`, `gap-*`, `p-*/m-*`
(4dp/8dp grid → `p-1 = 4px`, `p-2 = 8px`…), `rounded-*`, tipografi boy/ağırlık
(`text-xs`, `font-semibold`), `truncate`, `size-*`.

Renk için Tailwind'in **ham paleti kullanılmaz** — yalnızca token'a bağlı sınıflar:

- Zemin: `bg-page`, `bg-surface`, `bg-surface-sunken`, `bg-surface-strong`, `bg-inverse-surface`
- Metin: `text-content`, `text-content-secondary`, `text-content-tertiary`,
  `text-content-muted`, `text-content-faint`, `text-inverse-on-surface`
- Ayraç: `border-line`, `border-line-strong` (veya `bg-line`)
- İstisna — **semantik durum renkleri** ham palette kalır: `emerald` (gelir/başarı),
  `rose` (gider/yıkıcı), `amber` (uyarı). Bunlar marka aksanı değil, anlam taşıyıcıdır.
- `indigo-*` yazmak serbesttir ama tonlar tailwind.config'de MD3 nötr gri
  (pastel/monokrom) tonal paletine eşlenmiştir (marka aksanı = pastel gri;
  yeşil/teal ve mor aksan YASAK).

## 3. Renk sistemi — hardcoded renk yok

Hiçbir bileşende hex / `rgb()` / ham Tailwind renk yazılmaz. Sıralama:

1. Önce semantik token: `var(--c-surface)`, `text-content-muted`…
2. Semantik karşılığı yoksa MD3 rolü: `var(--md-surface-container-high)`,
   `var(--md-on-surface-variant)`…
3. Ionic bileşen özelinde: `--ion-color-primary`, `--ion-background-color`
   (bunlar da variables.css'te MD3 rollerine bağlıdır).

Tokenlar light/dark'ı kendisi çözer → bileşenlerde `dark:` prefix'i genelde
GEREKMEZ. İstisna: token dışı semantik renkler (emerald/rose) zemin tersine
dönüyorsa (`.card-inverse` gibi) `dark:text-emerald-700` ile ton düzeltilir.

## 4. Kartlar — M3 Surface Container + Tailwind gölge

- Zemin hiyerarşisi konteyner rollerinden gelir: sayfa `surface` → kart
  `surface-container-low/lowest` → kart içi kutu `surface-container` →
  chip/track `surface-container-highest`.
- `ion-card` global olarak **gölgesiz** sıfırlanmıştır (`box-shadow: none`,
  `margin: 0`). Elevation'ı karta verilen Tailwind sınıfı belirler:

```html
<ion-card class="card-filled p-4">…</ion-card>          <!-- gölgesiz, tonal -->
<ion-card class="p-4 shadow-sm">…</ion-card>            <!-- elevated (level 1) -->
<ion-card class="card-outlined p-4">…</ion-card>        <!-- çerçeveli -->
<ion-card class="card-inverse p-4 shadow-lg">…</ion-card><!-- hero (BalanceCard) -->
```

- Kartlar arası boşluk üst konteynerden: `class="flex flex-col gap-3"` (8dp grid).
- Mevcut `div.bg-surface rounded-2xl` kartlar da aynı token sistemini kullanır;
  yeni kart yazarken `ion-card` tercih et.

## 5. Erişilebilirlik — kontrast

- Metin daima zeminin "on-" rolüyle eşleşir: `surface*` üstünde `on-surface`
  (birincil) / `on-surface-variant` (ikincil); `primary` üstünde `on-primary`;
  `inverse-surface` üstünde `inverse-on-surface`. Bu çiftler MD3 tone map'ten
  geldiği için ≥ 4.5:1 (WCAG AA) sağlar.
- Caption/pasif metinde en açık ton `--c-content-faint` (outline, ~4.5:1 sınırı);
  daha açığı kullanma.
- Yardımcı/etiket metni 11px altına inmez; gövde 15px.
- Durum renkli metinlerde zemine göre ton seç: açık zeminde `*-600/700`,
  koyu zeminde `*-400`.

---

## Referans bileşenler

- **[BalanceCard.vue](../src/components/BalanceCard.vue)** — `ion-card.card-inverse`,
  token'lı metinler, `dark:` ile düzeltilmiş semantik renkler, Tailwind `shadow-lg`.
- **[CurrencyQuickCard.vue](../src/components/CurrencyQuickCard.vue)** — `ion-card`
  taban + `shadow-sm`, iç kutular `bg-surface-sunken`, hover `--md-surface-container-high`.
- Form deseni: tüm alanlar **filled** — `ion-input/textarea fill="solid"` +
  `.md3-picker` seçici satırları (Edit/New sayfaları). `fill="outline"` form
  alanlarında kullanılmaz (monokrom palette çerçeve, ayraç ve pasif metinle
  karışır); `ion-button fill="outline"` ise buton varyantıdır, serbesttir.
