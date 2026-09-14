import { v4 as uuidv4 } from "uuid";

export interface IIdGenerator {
    generate(): string
}

export class UuidGenerator implements IIdGenerator {
    generate(): string {
        return uuidv4()
    }
}