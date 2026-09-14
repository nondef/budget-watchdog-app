import { BaseMigration } from "./base-migration";
import { DatabaseAdapter } from "@/domain";

/**
 * Seed'lenmiş varsayılan kategorilerin sabit Türkçe isimlerini
 * "defaultCategories.*" çeviri anahtarlarına dönüştürür.
 * Görüntüleme anında translateCategoryName ile aktif dile çevrilirler.
 * Kullanıcının kendi oluşturduğu kategoriler (farklı isimler) etkilenmez.
 */
export class RenameDefaultCategoriesToI18nKeys extends BaseMigration {
    version = 14;
    name = "rename_default_categories_to_i18n_keys";

    private readonly renames: Array<{ oldName: string; key: string; type: 'expense' | 'income' }> = [
        { oldName: "Yeme & İçme", key: "defaultCategories.foodDrink", type: "expense" },
        { oldName: "Ulaşım", key: "defaultCategories.transport", type: "expense" },
        { oldName: "Eğlence", key: "defaultCategories.entertainment", type: "expense" },
        { oldName: "Sağlık", key: "defaultCategories.health", type: "expense" },
        { oldName: "Alışveriş", key: "defaultCategories.shopping", type: "expense" },
        { oldName: "Faturalar", key: "defaultCategories.bills", type: "expense" },
        { oldName: "Eğitim", key: "defaultCategories.education", type: "expense" },
        { oldName: "Sigorta", key: "defaultCategories.insurance", type: "expense" },
        { oldName: "Borçlar", key: "defaultCategories.debts", type: "expense" },
        { oldName: "Kişisel Bakım", key: "defaultCategories.personalCare", type: "expense" },
        { oldName: "Maaş", key: "defaultCategories.salary", type: "income" },
        { oldName: "Freelance", key: "defaultCategories.freelance", type: "income" },
        { oldName: "Yatırım", key: "defaultCategories.investment", type: "income" },
        { oldName: "Satış", key: "defaultCategories.sales", type: "income" },
        { oldName: "Hediye", key: "defaultCategories.gift", type: "income" },
        { oldName: "Kira Geliri", key: "defaultCategories.rentalIncome", type: "income" },
        { oldName: "Burs/Yardım", key: "defaultCategories.scholarship", type: "income" },
        { oldName: "Diğer", key: "defaultCategories.other", type: "income" },
    ];

    async up(db: DatabaseAdapter): Promise<void> {
        for (const { oldName, key, type } of this.renames) {
            await db.run(
                `UPDATE categories SET name = ? WHERE name = ? AND type = ?`,
                [key, oldName, type]
            );
        }
    }

    async down(db: DatabaseAdapter): Promise<void> {
        for (const { oldName, key, type } of this.renames) {
            await db.run(
                `UPDATE categories SET name = ? WHERE name = ? AND type = ?`,
                [oldName, key, type]
            );
        }
    }
}
