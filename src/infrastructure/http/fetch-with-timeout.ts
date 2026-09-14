import { HttpTimeoutError } from "@/infrastructure/http/errors";

const DEFAULT_TIMEOUT_MS = 10_000

export interface FetchWithTimeoutOptions extends Omit<RequestInit, 'signal'>{
    timeoutMs?: number
    signal?: AbortSignal
}

export async function fetchWithTimeout(url: string, options: FetchWithTimeoutOptions = {}) {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...init } = options

    if (signal?.aborted) {
        throw signal.reason ?? new DOMException('Aborted', 'AbortError')
    }

    const controller = new AbortController()
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })

    let timer: ReturnType<typeof setTimeout>

    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            controller.abort()
            reject(new HttpTimeoutError(url, timeoutMs))
        }, timeoutMs)
    })

    try {
        return await Promise.race([
            fetch(url, { ...init, signal: controller.signal }),
            timeout
        ])
    } catch (error) {
        if (signal?.aborted) {
            throw signal.reason ?? error
        }

        throw error
    } finally {
        clearTimeout(timer!)
        signal?.removeEventListener('abort', onAbort)
    }
}