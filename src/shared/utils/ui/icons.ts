// Dinamik ikon çözümü — DB'de ikon ADI saklanıyor, karşılığı burada bulunur.
//
// Eskiden `import * as ionicons` kullanılıyordu; bu, tüm setin (~1300 ikon,
// base64 data-URI) bundle'a girmesine sebep oluyordu (icons chunk'ı 1.87 MB).
// Aşağıdaki açık kayıt yalnızca uygulamanın gerçekten kullandığı ikonları
// taşır (ICON_CATEGORIES + wallet-options + kategori seeder'ı).
//
// YENİ İKON EKLERKEN buraya da eklenmeli — aksi halde getIconByName undefined
// döner ve ikon boş görünür.
import {
    airplaneOutline, alarmOutline, bagOutline, balloonOutline, bandageOutline,
    barChartOutline, barbellOutline, basketOutline, batteryFullOutline, bedOutline,
    beerOutline, bicycleOutline, boatOutline, bookOutline, briefcaseOutline,
    bulbOutline, busOutline, businessOutline, cafeOutline, calculatorOutline,
    calendarNumberOutline, calendarOutline, cameraOutline, carOutline, cardOutline,
    cartOutline, cashOutline, cloudOutline, colorPaletteOutline, compassOutline,
    constructOutline, desktopOutline, diamondOutline, documentTextOutline, earthOutline,
    ellipsisHorizontalOutline, fastFoodOutline, fileTrayFullOutline, filmOutline,
    fingerPrintOutline, fitnessOutline, flameOutline, flashOutline, flowerOutline,
    footballOutline, gameControllerOutline, giftOutline, globeOutline, gridOutline,
    hardwareChipOutline, headsetOutline, heartOutline, helpOutline, homeOutline,
    logoBitcoin,
    iceCreamOutline, infiniteOutline, keyOutline, laptopOutline, leafOutline,
    locationOutline, mapOutline, medicalOutline, moonOutline, musicalNotesOutline,
    nutritionOutline, pawOutline, phonePortraitOutline, pieChartOutline, pizzaOutline,
    pricetagOutline, pricetagsOutline, pulseOutline, qrCodeOutline, rainyOutline,
    receiptOutline, restaurantOutline, ribbonOutline, schoolOutline, shieldOutline,
    shirtOutline, sparklesOutline, speedometerOutline, starOutline, statsChartOutline,
    storefrontOutline, subwayOutline, sunnyOutline, ticketOutline, timeOutline,
    trainOutline, trendingUpOutline, walkOutline, walletOutline, watchOutline,
    waterOutline, wifiOutline, wineOutline,
} from 'ionicons/icons'

const ICON_REGISTRY: Record<string, string> = {
    airplaneOutline, alarmOutline, bagOutline, balloonOutline, bandageOutline,
    barChartOutline, barbellOutline, basketOutline, batteryFullOutline, bedOutline,
    beerOutline, bicycleOutline, boatOutline, bookOutline, briefcaseOutline,
    bulbOutline, busOutline, businessOutline, cafeOutline, calculatorOutline,
    calendarNumberOutline, calendarOutline, cameraOutline, carOutline, cardOutline,
    cartOutline, cashOutline, cloudOutline, colorPaletteOutline, compassOutline,
    constructOutline, desktopOutline, diamondOutline, documentTextOutline, earthOutline,
    ellipsisHorizontalOutline, fastFoodOutline, fileTrayFullOutline, filmOutline,
    fingerPrintOutline, fitnessOutline, flameOutline, flashOutline, flowerOutline,
    footballOutline, gameControllerOutline, giftOutline, globeOutline, gridOutline,
    hardwareChipOutline, headsetOutline, heartOutline, helpOutline, homeOutline,
    logoBitcoin,
    iceCreamOutline, infiniteOutline, keyOutline, laptopOutline, leafOutline,
    locationOutline, mapOutline, medicalOutline, moonOutline, musicalNotesOutline,
    nutritionOutline, pawOutline, phonePortraitOutline, pieChartOutline, pizzaOutline,
    pricetagOutline, pricetagsOutline, pulseOutline, qrCodeOutline, rainyOutline,
    receiptOutline, restaurantOutline, ribbonOutline, schoolOutline, shieldOutline,
    shirtOutline, sparklesOutline, speedometerOutline, starOutline, statsChartOutline,
    storefrontOutline, subwayOutline, sunnyOutline, ticketOutline, timeOutline,
    trainOutline, trendingUpOutline, walkOutline, walletOutline, watchOutline,
    waterOutline, wifiOutline, wineOutline,
}

export function getIconByName(iconName?: string): string | undefined {
    if (!iconName) return undefined

    return ICON_REGISTRY[iconName]
}

/** Bilinmeyen ad geldiğinde boş kutu yerine nötr bir ikon gösterir. */
export function getIconByNameOrFallback(iconName?: string): string {
    return getIconByName(iconName) ?? helpOutline
}
