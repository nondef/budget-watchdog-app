import { CategoryType, IIcon } from "@/domain";

export interface CategoryDTO {
    id: string;
    name: string;
    type: CategoryType;
    icon: IIcon;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateCategoryInput {
    name: string;
    type: CategoryType;
    icon: IIcon;
}

export interface UpdateCategoryInput {
    id: string;
    name?: string;
    icon?: Partial<IIcon>;
}

export interface DeleteCategoryInput {
    id: string;
}
