import { AccountType, IIcon } from "@/domain";

export interface AccountDTO {
    id: string;
    name: string;
    type: AccountType;
    balance: {
        amount: number
        currencyId: string
    };
    icon: {
        name: string
        color: string
    };
    isActive: boolean;
    notes?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface CreateAccountInput {
    name: string;
    type: AccountType;
    currencyId: string;
    balance: number;
    icon: IIcon
    notes?: string;
}

export interface UpdateAccountInput {
    id: string
    name?: string
    type?: AccountType
    icon?: Partial<IIcon>
    notes?: string
    isActive?: boolean
}