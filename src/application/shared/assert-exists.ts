import { EntityNotFoundException } from "@/domain";

/**
 * Verifies that a single entity with the specified ID exists, throwing if it is missing.
 *
 * @param { string } entityName - The name of the entity type being verified.
 * @param { string | undefined } id - The entity ID to verify. Boş/tanımsız id de
 *   "bulunamadı" sayılır: aksi halde `WHERE id = ''` sorgusu sessizce boş dönüp
 *   çağıranın niyeti (bu alan zorunlu) kaybolurdu.
 * @param { (id: string) => Promise<T | null> } load - A function to load the entity by its ID.
 * @return { Promise<T> } A promise that resolves to the found entity.
 * @throws { EntityNotFoundException } If the ID is not found.
 */
export async function assertExists<T>(
    entityName: string,
    id: string | undefined,
    load: (id: string) => Promise<T | null>
): Promise<T> {
    if (!id) {
        throw new EntityNotFoundException(entityName, id ?? '')
    }

    const entity = await load(id)

    if (!entity) {
        throw new EntityNotFoundException(entityName, id)
    }

    return entity
}