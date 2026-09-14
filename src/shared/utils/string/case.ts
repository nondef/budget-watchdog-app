export function toCamelCase(str: string): string {
    return str
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase()
        .replace(/[\s_-]+(.)/g, (_, char) => char.toUpperCase())
        .replace(/^./, c => c.toLowerCase());
}

export function toSnakeCase(str: string): string {
    return str
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase();
}