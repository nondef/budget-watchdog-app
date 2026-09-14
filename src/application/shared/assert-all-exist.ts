import { EntityNotFoundException } from "@/domain";

/**
 * Verifies that all entities with the specified IDs exist, throwing an exception if any are missing.
 *
 * @param { string } entityName - The name of the entity type being verified.
 * @param { string[] } ids - An array of entity IDs to verify.
 * @param { (ids: string[]) => Promise<T[]> } load - A function to load entities by their IDs.
 * @return { Promise<T[]> } A promise that resolves to an array of the entities found.
 * @throws { EntityNotFoundException } If any of the specified IDs are not found.
 */
export async function assertAllExist<T extends { id: string }>(
    entityName: string,
    ids: string[],
    load: (ids: string[]) => Promise<T[]>
): Promise<T[]> {
    const requested = new Set(ids)
    const found = await load([...requested])

    if (found.length !== requested.size) {
        const foundIds = new Set(found.map(entity => entity.id))
        const missing = [...requested].filter(id => !foundIds.has(id))

        throw new EntityNotFoundException(entityName, missing)
    }

    return found
}