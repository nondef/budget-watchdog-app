import { BaseSeeder } from "@/infrastructure/database/seeders/base-seeder";
import { v6 as uuidv6 } from "uuid";
import { DatabaseAdapter } from "@/domain";

export class CategoriesSeeder extends BaseSeeder {
    constructor() {
        super('categories');
    }

    protected async seed(db: DatabaseAdapter): Promise<number> {
        // name alanı çeviri anahtarı tutar; görüntülemede translateCategoryName ile çevrilir.
        // Kullanıcı kategorileri düz metin isimle kaydedilir, ikisi bu prefix ile ayrışır.
        const categories = [
            { id: uuidv6(), name: "defaultCategories.foodDrink", icon: 'restaurantOutline', type: "expense", color: "bg-orange-500" },
            { id: uuidv6(), name: "defaultCategories.transport", icon: 'carOutline', type: "expense", color: "bg-blue-500" },
            { id: uuidv6(), name: "defaultCategories.entertainment", icon: 'gameControllerOutline', type: "expense", color: "bg-purple-500" },
            { id: uuidv6(), name: "defaultCategories.health", icon: 'medicalOutline', type: "expense", color: "bg-teal-500" },
            { id: uuidv6(), name: "defaultCategories.shopping", icon: 'bagOutline', type: "expense", color: "bg-pink-500" },
            { id: uuidv6(), name: "defaultCategories.bills", icon: 'documentTextOutline', type: "expense", color: "bg-red-500" },
            { id: uuidv6(), name: "defaultCategories.education", icon: 'schoolOutline', type: "expense", color: "bg-indigo-500" },
            { id: uuidv6(), name: "defaultCategories.insurance", icon: 'shieldOutline', type: "expense", color: "bg-emerald-500"},
            { id: uuidv6(), name: "defaultCategories.debts", icon: 'cardOutline', type: "expense", color: "bg-rose-500" },
            { id: uuidv6(), name: "defaultCategories.personalCare", icon: 'cut', type: "expense", color: "bg-violet-500" },
            { id: uuidv6(), name: "defaultCategories.salary", icon: 'cashOutline', type: "income", color: "bg-green-500" },
            { id: uuidv6(), name: "defaultCategories.freelance", icon: 'laptopOutline', type: "income", color: "bg-blue-500" },
            { id: uuidv6(), name: "defaultCategories.investment", icon: 'trendingUpOutline', type: "income", color: "bg-emerald-500" },
            { id: uuidv6(), name: "defaultCategories.sales", icon: 'storefrontOutline', type: "income", color: "bg-orange-500" },
            { id: uuidv6(), name: "defaultCategories.gift", icon: 'giftOutline', type: "income", color: "bg-yellow-500" },
            { id: uuidv6(), name: "defaultCategories.rentalIncome", icon: 'homeOutline', type: "income", color: "bg-purple-500" },
            { id: uuidv6(), name: "defaultCategories.scholarship", icon: 'ribbonOutline', type: "income", color: "bg-cyan-500" },
            { id: uuidv6(), name: "defaultCategories.other", icon: 'ellipsisHorizontalOutline', type: "income", color: "bg-gray-500" }
        ]

        // `created_at`/`updated_at`/`is_system` kolonları tabloya sonradan
        // (migration 016) eklendi. O migration eldeki satırları backfill ediyor
        // ama TEMİZ KURULUMDA seeder migration'lardan SONRA çalışıyor: backfill
        // boş tabloda dönüyor, ardından bu INSERT kolonları hiç yazmıyordu.
        // Sonuç: varsayılan kategoriler NULL zaman damgasıyla doğuyor ve
        // `resolveTimestamps` her okumada patlıyordu — tek satır bütün
        // `findAll` çağrısını düşürdüğü için kategori ekranı hiç açılmıyordu.
        // Ayrıca `is_system = 0` kalıyor, yani sistem kategorisi silme koruması
        // temiz kurulumda hiç devreye girmiyordu.
        //
        // ISO 8601 yazılıyor: repository de `toISOString()` kullanıyor ve
        // migration 026 tüm tarih kolonlarını bu formata normalize etti.
        const now = new Date().toISOString()

        return await this.insertBatch(db, categories.map(category => ({
            ...category,
            is_system: 1,
            created_at: now,
            updated_at: now,
        })))
    }
}