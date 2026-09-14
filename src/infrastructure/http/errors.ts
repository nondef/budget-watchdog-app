/** HTTP katmanının kendi hataları — domain'den bağımsız. */

export class HttpTimeoutError extends Error {
    constructor(readonly url: string, readonly timeoutMs: number) {
        super(`Request timed out after ${timeoutMs}ms: ${url}`)
        this.name = 'HttpTimeoutError'
    }
}

export class HttpStatusError extends Error {
    constructor(readonly url: string, readonly status: number, statusText: string) {
        super(`HTTP ${status} ${statusText}: ${url}`)
        this.name = 'HttpStatusError'
    }
}