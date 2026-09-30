export interface IconDefinition {
    name: string;
    iconName: string;
}

export interface IconCategory {
    nameKey: string
    icons: IconDefinition[]
}

export const ICON_CATEGORIES: IconCategory[] = [
    {
        nameKey: 'iconPicker.categories.entertainment',
        icons: [
            { name: 'Oyun', iconName: 'gameControllerOutline' },
            { name: 'Müzik', iconName: 'musicalNotesOutline' },
            { name: 'Film', iconName: 'filmOutline' },
            { name: 'Tiyatro', iconName: 'sparklesOutline' },
            { name: 'Spor', iconName: 'footballOutline' },
            { name: 'Etkinlik', iconName: 'calendarNumberOutline' },
            { name: 'Kitap', iconName: 'bookOutline' },
            { name: 'Sanat', iconName: 'colorPaletteOutline' },
            { name: 'Kulaklık', iconName: 'headsetOutline' },
            { name: 'Bilet', iconName: 'ticketOutline' },
        ]
    },
    {
        nameKey: 'iconPicker.categories.work',
        icons: [
            { name: 'Çanta', iconName: 'briefcaseOutline' },
            { name: 'Eğitim', iconName: 'schoolOutline' },
            { name: 'İş', iconName: 'businessOutline' },
            { name: 'Ofis', iconName: 'desktopOutline' },
            { name: 'Saat', iconName: 'timeOutline' },
            { name: 'Hedef', iconName: 'ribbonOutline' },
            { name: 'Belge', iconName: 'documentTextOutline' },
            { name: 'Grafik', iconName: 'statsChartOutline' },
        ]
    },
    {
        nameKey: 'iconPicker.categories.finance',
        icons: [
            { name: 'Cüzdan', iconName: 'walletOutline' },
            { name: 'Kart', iconName: 'cardOutline' },
            { name: 'Nakit', iconName: 'cashOutline' },
            { name: 'Banka', iconName: 'businessOutline' },
            { name: 'Hesap Makinesi', iconName: 'calculatorOutline' },
            { name: 'Artış', iconName: 'trendingUpOutline' },
            { name: 'Fiş', iconName: 'receiptOutline' },
            { name: 'Etiket', iconName: 'pricetagOutline' },
            { name: 'Kumbara', iconName: 'pieChartOutline' },
        ]
    },
    {
        nameKey: 'iconPicker.categories.foodDrink',
        icons: [
            { name: 'Restoran', iconName: 'restaurantOutline' },
            { name: 'Fast Food', iconName: 'fastFoodOutline' },
            { name: 'Pizza', iconName: 'pizzaOutline' },
            { name: 'Kafe', iconName: 'cafeOutline' },
            { name: 'İçecek', iconName: 'wineOutline' },
            { name: 'Bira', iconName: 'beerOutline' },
            { name: 'Dondurma', iconName: 'iceCreamOutline' },
            { name: 'Beslenme', iconName: 'nutritionOutline' },
        ]
    },
    {
        nameKey: 'iconPicker.categories.transport',
        icons: [
            { name: 'Araba', iconName: 'carOutline' },
            { name: 'Uçak', iconName: 'airplaneOutline' },
            { name: 'Bisiklet', iconName: 'bicycleOutline' },
            { name: 'Metro', iconName: 'subwayOutline' },
            { name: 'Otobüs', iconName: 'busOutline' },
            { name: 'Tren', iconName: 'trainOutline' },
            { name: 'Gemi', iconName: 'boatOutline' },
            { name: 'Yakıt', iconName: 'speedometerOutline' },
        ]
    },
    {
        nameKey: 'iconPicker.categories.shopping',
        icons: [
            { name: 'Alışveriş', iconName: 'bagOutline' },
            { name: 'Market', iconName: 'basketOutline' },
            { name: 'Mağaza', iconName: 'storefrontOutline' },
            { name: 'Hediye', iconName: 'giftOutline' },
            { name: 'Sepet', iconName: 'cartOutline' },
            { name: 'Giyim', iconName: 'shirtOutline' },
            { name: 'Etiketler', iconName: 'pricetagsOutline' },
        ]
    },
    {
        nameKey: 'iconPicker.categories.health',
        icons: [
            { name: 'Sağlık', iconName: 'medicalOutline' },
            { name: 'Fitness', iconName: 'fitnessOutline' },
            { name: 'Kalp', iconName: 'heartOutline' },
            { name: 'Bandaj', iconName: 'bandageOutline' },
            { name: 'Nabız', iconName: 'pulseOutline' },
            { name: 'Ağırlık', iconName: 'barbellOutline' },
            { name: 'Yürüyüş', iconName: 'walkOutline' },
        ]
    },
    {
        nameKey: 'iconPicker.categories.home',
        icons: [
            { name: 'Ev', iconName: 'homeOutline' },
            { name: 'Yatak', iconName: 'bedOutline' },
            { name: 'Aydınlatma', iconName: 'bulbOutline' },
            { name: 'Su', iconName: 'waterOutline' },
            { name: 'Elektrik', iconName: 'flashOutline' },
            { name: 'Isınma', iconName: 'flameOutline' },
            { name: 'Tamir', iconName: 'constructOutline' },
            { name: 'Anahtar', iconName: 'keyOutline' },
        ]
    },
    {
        nameKey: 'iconPicker.categories.technology',
        icons: [
            { name: 'Bilgisayar', iconName: 'laptopOutline' },
            { name: 'Telefon', iconName: 'phonePortraitOutline' },
            { name: 'Masaüstü', iconName: 'desktopOutline' },
            { name: 'İşlemci', iconName: 'hardwareChipOutline' },
            { name: 'Wi-Fi', iconName: 'wifiOutline' },
            { name: 'Bulut', iconName: 'cloudOutline' },
            { name: 'Pil', iconName: 'batteryFullOutline' },
            { name: 'Akıllı Saat', iconName: 'watchOutline' },
            { name: 'Kamera', iconName: 'cameraOutline' },
        ]
    },
    {
        nameKey: 'iconPicker.categories.natureTravel',
        icons: [
            { name: 'Yaprak', iconName: 'leafOutline' },
            { name: 'Çiçek', iconName: 'flowerOutline' },
            { name: 'Güneş', iconName: 'sunnyOutline' },
            { name: 'Yağmur', iconName: 'rainyOutline' },
            { name: 'Dünya', iconName: 'earthOutline' },
            { name: 'Evcil Hayvan', iconName: 'pawOutline' },
            { name: 'Harita', iconName: 'mapOutline' },
            { name: 'Pusula', iconName: 'compassOutline' },
            { name: 'Konum', iconName: 'locationOutline' },
        ]
    },
    {
        nameKey: 'iconPicker.categories.other',
        icons: [
            { name: 'İnternet', iconName: 'globeOutline' },
            { name: 'Gece', iconName: 'moonOutline' },
            { name: 'Alarm', iconName: 'alarmOutline' },
            { name: 'Yıldız', iconName: 'starOutline' },
            { name: 'Takvim', iconName: 'calendarOutline' },
            { name: 'Balon', iconName: 'balloonOutline' },
        ]
    }
]
