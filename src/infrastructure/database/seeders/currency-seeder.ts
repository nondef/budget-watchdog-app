import { BaseSeeder } from "@/infrastructure/database/seeders/base-seeder";
import { v6 as uuidv6 } from "uuid";
import { DatabaseAdapter } from "@/domain";
import { minorUnitForCurrencyCode } from '@/domain/entities/currency';

export class CurrencySeeder extends BaseSeeder {
    constructor() {
        super('currencies');
    }

    protected async seed(db: DatabaseAdapter): Promise<number> {
        const definitions = [
            { id: uuidv6(), code: 'TRY', name: 'Türk Lirası', symbol: '₺', country: 'Türkiye' },
            { id: uuidv6(), code: 'USD', name: 'Amerikan Doları', symbol: '$', country: 'Amerika Birleşik Devletleri' },
            { id: uuidv6(), code: 'EUR', name: 'Euro', symbol: '€', country: 'Avrupa Birliği' },
            { id: uuidv6(), code: 'GBP', name: 'İngiliz Sterlini', symbol: '£', country: 'Birleşik Krallık' },
            { id: uuidv6(), code: 'JPY', name: 'Japon Yeni', symbol: '¥', country: 'Japonya' },
            { id: uuidv6(), code: 'CNY', name: 'Çin Yuanı', symbol: '¥', country: 'Çin' },
            { id: uuidv6(), code: 'RUB', name: 'Rus Rublesi', symbol: '₽', country: 'Rusya' },
            { id: uuidv6(), code: 'CAD', name: 'Kanada Doları', symbol: 'C$', country: 'Kanada' },
            { id: uuidv6(), code: 'AUD', name: 'Avustralya Doları', symbol: 'A$', country: 'Avustralya' },
            { id: uuidv6(), code: 'CHF', name: 'İsviçre Frangı', symbol: 'CHF', country: 'İsviçre' },
            { id: uuidv6(), code: 'SEK', name: 'İsveç Kronu', symbol: 'kr', country: 'İsveç' },
            { id: uuidv6(), code: 'NOK', name: 'Norveç Kronu', symbol: 'kr', country: 'Norveç' },
            { id: uuidv6(), code: 'DKK', name: 'Danimarka Kronu', symbol: 'kr', country: 'Danimarka' },
            { id: uuidv6(), code: 'PLN', name: 'Polonya Zlotisi', symbol: 'zł', country: 'Polonya' },
            { id: uuidv6(), code: 'CZK', name: 'Çek Kronu', symbol: 'Kč', country: 'Çek Cumhuriyeti' },
            { id: uuidv6(), code: 'HUF', name: 'Macar Forinti', symbol: 'Ft', country: 'Macaristan' },
            { id: uuidv6(), code: 'RON', name: 'Rumen Leyi', symbol: 'lei', country: 'Romanya' },
            { id: uuidv6(), code: 'BGN', name: 'Bulgar Levası', symbol: 'лв', country: 'Bulgaristan' },
            { id: uuidv6(), code: 'HRK', name: 'Hırvat Kunası', symbol: 'kn', country: 'Hırvatistan' },
            { id: uuidv6(), code: 'INR', name: 'Hint Rupisi', symbol: '₹', country: 'Hindistan' },
            { id: uuidv6(), code: 'KRW', name: 'Güney Kore Wonu', symbol: '₩', country: 'Güney Kore' },
            { id: uuidv6(), code: 'SGD', name: 'Singapur Doları', symbol: 'S$', country: 'Singapur' },
            { id: uuidv6(), code: 'HKD', name: 'Hong Kong Doları', symbol: 'HK$', country: 'Hong Kong' },
            { id: uuidv6(), code: 'NZD', name: 'Yeni Zelanda Doları', symbol: 'NZ$', country: 'Yeni Zelanda' },
            { id: uuidv6(), code: 'MXN', name: 'Meksika Pesosu', symbol: '$', country: 'Meksika' },
            { id: uuidv6(), code: 'BRL', name: 'Brezilya Reali', symbol: 'R$', country: 'Brezilya' },
            { id: uuidv6(), code: 'ARS', name: 'Arjantin Pesosu', symbol: '$', country: 'Arjantin' },
            { id: uuidv6(), code: 'CLP', name: 'Şili Pesosu', symbol: '$', country: 'Şili' },
            { id: uuidv6(), code: 'COP', name: 'Kolombiya Pesosu', symbol: '$', country: 'Kolombiya' },
            { id: uuidv6(), code: 'PEN', name: 'Peru Solu', symbol: 'S/', country: 'Peru' },
            { id: uuidv6(), code: 'ZAR', name: 'Güney Afrika Randı', symbol: 'R', country: 'Güney Afrika' },
            { id: uuidv6(), code: 'EGP', name: 'Mısır Poundu', symbol: '£', country: 'Mısır' },
            { id: uuidv6(), code: 'SAR', name: 'Suudi Arabistan Riyali', symbol: '﷼', country: 'Suudi Arabistan' },
            { id: uuidv6(), code: 'AED', name: 'BAE Dirhemi', symbol: 'د.إ', country: 'Birleşik Arap Emirlikleri' },
            { id: uuidv6(), code: 'QAR', name: 'Katar Riyali', symbol: '﷼', country: 'Katar' },
            { id: uuidv6(), code: 'KWD', name: 'Kuveyt Dinarı', symbol: 'د.ك', country: 'Kuveyt' },
            { id: uuidv6(), code: 'BHD', name: 'Bahreyn Dinarı', symbol: '.د.ب', country: 'Bahreyn' },
            { id: uuidv6(), code: 'OMR', name: 'Umman Riyali', symbol: '﷼', country: 'Umman' },
            { id: uuidv6(), code: 'JOD', name: 'Ürdün Dinarı', symbol: 'د.ا', country: 'Ürdün' },
            { id: uuidv6(), code: 'LBP', name: 'Lübnan Poundu', symbol: '£', country: 'Lübnan' },
            { id: uuidv6(), code: 'ILS', name: 'İsrail Şekeli', symbol: '₪', country: 'İsrail' },
            { id: uuidv6(), code: 'THB', name: 'Tayland Bahtı', symbol: '฿', country: 'Tayland' },
            { id: uuidv6(), code: 'MYR', name: 'Malezya Ringgiti', symbol: 'RM', country: 'Malezya' },
            { id: uuidv6(), code: 'PHP', name: 'Filipin Pesosu', symbol: '₱', country: 'Filipinler' },
            { id: uuidv6(), code: 'IDR', name: 'Endonezya Rupiahı', symbol: 'Rp', country: 'Endonezya' },
            { id: uuidv6(), code: 'VND', name: 'Vietnam Dongu', symbol: '₫', country: 'Vietnam' },
            { id: uuidv6(), code: 'PKR', name: 'Pakistan Rupisi', symbol: '₨', country: 'Pakistan' },
            { id: uuidv6(), code: 'BDT', name: 'Bangladeş Takası', symbol: '৳', country: 'Bangladeş' },
            { id: uuidv6(), code: 'LKR', name: 'Sri Lanka Rupisi', symbol: '₨', country: 'Sri Lanka' },
            { id: uuidv6(), code: 'NPR', name: 'Nepal Rupisi', symbol: '₨', country: 'Nepal' },
            { id: uuidv6(), code: 'MMK', name: 'Myanmar Kyatı', symbol: 'K', country: 'Myanmar' },
            { id: uuidv6(), code: 'KHR', name: 'Kamboçya Rieli', symbol: '៛', country: 'Kamboçya' },
            { id: uuidv6(), code: 'LAK', name: 'Laos Kipi', symbol: '₭', country: 'Laos' },
        ]
        const currencies = definitions.map(currency => ({
            ...currency,
            minor_unit: minorUnitForCurrencyCode(currency.code),
        }))

        return await this.insertBatch(db, currencies)
    }
}
