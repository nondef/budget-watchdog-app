<script setup lang="ts">
import { checkmarkOutline } from "ionicons/icons";
import { IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote } from "@ionic/vue";
import { CurrencyDTO } from "@/application";
import { useCurrencyDisplay } from "@/composables/money/useCurrencyDisplay";

const { currencyName, currencyCountry } = useCurrencyDisplay()

interface Props {
  currencies: CurrencyDTO[]
  selectedCurrency: CurrencyDTO | null
  search: string
}

interface Emits {
  'select': [value: CurrencyDTO]
}

defineProps<Props>()

const emits = defineEmits<Emits>()

const pickCurrency = (currency: CurrencyDTO) => {
  emits('select', currency)
}
</script>

<template>
  <ion-list inset class="currency-list">
    <ion-list-header lines="full" v-if="search">
      <ion-label class="text-[10px] font-semibold uppercase tracking-wider text-content">
        {{ $t('currencyPicker.all') }}
      </ion-label>
    </ion-list-header>

    <ion-item
        v-for="c in currencies"
        :key="c.id"
        lines="none"
        button
        :detail="false"
        class="currency-item"
        :class="{ 'is-selected': selectedCurrency?.id === c.id }"
        @click="pickCurrency(c)"
    >
      <!-- symbol avatar -->
      <div slot="start" class="currency-avatar">
        <span class="text-[15px] font-bold leading-none">{{ c.symbol }}</span>
      </div>

      <ion-label>
        <div class="flex items-center gap-1.5">
          <h3 class="text-[14px] font-bold text-content leading-tight">{{ c.code }}</h3>
          <span class="text-[13px] text-content-secondary font-medium truncate leading-tight">{{ currencyName(c) }}</span>
        </div>
        <ion-note class="text-[11px] text-content-muted leading-tight" v-if="currencyCountry(c)">{{ currencyCountry(c) }}</ion-note>
      </ion-label>

      <!-- check indicator -->
      <div slot="end" class="currency-check" :class="{ 'is-on': selectedCurrency?.id === c.id }">
        <ion-icon v-if="selectedCurrency?.id === c.id" :icon="checkmarkOutline" class="size-[14px]" />
      </div>
    </ion-item>

    <div v-if="currencies.length === 0" class="py-10 text-center">
      <ion-label class="text-[13px] text-content-muted">{{ $t('currencyPicker.noResult', { term: search }) }}</ion-label>
    </div>
  </ion-list>
</template>

<style scoped>
/* Liste kapsayıcısı da yuvarlatılmış bir kart: yüzeyden ayrılan zemin + köşeler. */
.currency-list {
  background: transparent;
}

/* Modern liste satırı: her satır modal yüzeyinden hafif ayrılmış bir "kart" gibi.
   Köşeler yuvarlatılmış, satırlar arasında ince boşluk, dokununca sunken ton.
   Light'ta uygulamanın kart dili: krem --c-surface zemin (surface-strong burada
   modal yüzeyinden koyu kalıp kirli görünüyordu); dark'ta elevated ilişki için
   aşağıdaki .ion-palette-dark bloğu surface-strong'a döner. */
.currency-item {
  --background: var(--c-surface) !important;
  --background-hover: var(--c-surface-sunken) !important;
  --background-activated: var(--c-surface-sunken) !important;
  --background-focused: var(--c-surface-sunken) !important;
  --color: var(--c-content) !important;
  --border-radius: 16px;
  --padding-top: 0;
  --padding-bottom: 0;
  --padding-start: 12px;
  --inner-padding-end: 12px;
  --min-height: 64px;
  margin-bottom: 12px;
  /* HOST'a da yarıçap şart: --border-radius yalnızca Ionic'in iç .item-native'ini
     yuvarlatır; host yarıçapsız + overflow:hidden olunca o yuvarlak zemini kare kutuya
     kırpıyor ve aşağıdaki hairline halka da kare çiziliyordu (köşeler sivri). Seçili
     satırda sorun yoktu, çünkü .is-selected host'a 16px veriyor. */
  border-radius: 16px;
  overflow: hidden;
  /* IconPickerModal ile ayni dil: her kart zeminden hairline halka ile ayrilir. */
  box-shadow: inset 0 0 0 1px var(--c-line);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

/* Symbol avatar — yumuşak sunken zemin, yuvarlatılmış kare.
   Light'ta satırdan hafif koyu sunken chip (eski --c-surface neredeyse beyazdı,
   koyu satır üstünde göz yoruyordu); dark'ta satırdan hafif koyu kalması için
   aşağıdaki .ion-palette-dark bloğu --c-surface'e döner. */
.currency-avatar {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--c-surface-sunken);
  color: var(--c-content);
  transition: background 0.18s ease, color 0.18s ease;
}

/* Dark: mevcut görünüm korunur — satır modal yüzeyinden elevated (strong),
   avatar satırdan bir tık koyu (surface). */
.ion-palette-dark .currency-item {
  --background: var(--c-surface-strong) !important;
}
.ion-palette-dark .currency-avatar {
  background: var(--c-surface);
}

/* Sağdaki seçim göstergesi — boş halka; seçiliyken yumuşak dolgu + primary
   çerçeve. Eskiden dolgu --c-content idi: dark temada bu #f6f6f6, yani
   koyu satırın üstünde bembeyaz bir disk oluyordu. */
.currency-check {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 9999px;
  border: 1.5px solid var(--c-line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  transition: all 0.18s ease;
}
/* Seçiliyken dolu primary disk + ters renkli tik: tek renk rolü ile her iki
   temada da en yüksek kontrast (light'ta koyu disk/beyaz tik, dark'ta açık
   disk/koyu tik). Eski --md-surface-container-highest dolgusu ham MD3
   token'ıydı ve tonlanmış satır zemininde yeterince ayrışmıyordu. */
.currency-check.is-on {
  border-color: var(--c-primary);
  background: var(--c-primary);
  color: var(--c-on-primary);
}

/* Seçili satır — vurgu YÖNÜ her iki temada da "öne çıkar": zemin, o temanın
   kontrast rengi olan primary'ye doğru hafifçe tonlanır. Eskiden seçili satır
   surface-sunken'a düşüyordu; bu hem light hem dark'ta sayfa/modal zeminine
   yakın bir ton bırakıp satırı pasif/disabled gösteriyordu (light #e7e3dc ≈
   page #eae6e0, dark #202020 ≈ page #1c1c1c). Şimdi light'ta krem satırdan bir
   tık sıcak-koyu, dark'ta bir tık açık: ikisinde de "seçili = daha belirgin".
   Ton primary üzerinden geldiği için tema dönünce yön otomatik terslenir.
   Avatar seçiliyken TERSLENMEZ: --c-content dolgu dark temada beyaz bir kutu
   bırakıyordu; seçim 2px primary halka + dolu tik diski ile zaten belli. */
/* Light'ta karışım oranı bilerek düşük (%3): satır zemini zaten paletin en
   açık tonu (#f8f5f0) olduğu için yukarı doğru headroom yok, aşağı fazla
   inince (%6 → #ece9e4) sayfa zeminine (#eae6e0) yapışıp kartın silueti
   kayboluyordu. %3 (#f2efea) satırı sayfadan ayrı tutar, seçimi ise asıl
   olarak 2px koyu halka + dolu tik diski taşır. */
.currency-item.is-selected {
  --background: color-mix(in srgb, var(--c-primary) 3%, var(--c-surface)) !important;
  --background-hover: color-mix(in srgb, var(--c-primary) 7%, var(--c-surface)) !important;
  --background-activated: color-mix(in srgb, var(--c-primary) 7%, var(--c-surface)) !important;
  --background-focused: color-mix(in srgb, var(--c-primary) 7%, var(--c-surface)) !important;
  --color: var(--c-content) !important;
  border-radius: 16px;
  /* Secili kart: IconPicker secili ikon butonu ile ayni 2px primary halka. */
  box-shadow: inset 0 0 0 2px var(--c-primary);
}

/* Dark: taban satır surface-strong (#3a3a3a) olduğu için karışım da onun
   üstüne yapılır; primary dark'ta açık ton olduğundan satır yükselmiş görünür. */
.ion-palette-dark .currency-item.is-selected {
  --background: color-mix(in srgb, var(--c-primary) 10%, var(--c-surface-strong)) !important;
  --background-hover: color-mix(in srgb, var(--c-primary) 16%, var(--c-surface-strong)) !important;
  --background-activated: color-mix(in srgb, var(--c-primary) 16%, var(--c-surface-strong)) !important;
  --background-focused: color-mix(in srgb, var(--c-primary) 16%, var(--c-surface-strong)) !important;
}

/* Seçili satırın avatarı da aynı yönde bir tık kayar ki chip, tonlanmış satır
   zemininde kaybolmasın. */
.currency-item.is-selected .currency-avatar {
  background: color-mix(in srgb, var(--c-primary) 12%, var(--c-surface-sunken));
}
.ion-palette-dark .currency-item.is-selected .currency-avatar {
  background: color-mix(in srgb, var(--c-primary) 14%, var(--c-surface));
}
</style>
