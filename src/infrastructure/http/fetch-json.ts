import { fetchWithTimeout, FetchWithTimeoutOptions } from './fetch-with-timeout'
import { HttpStatusError } from './errors'

export async function fetchJson<T>(url: string, options: FetchWithTimeoutOptions = {}): Promise<T> {
    const response = await fetchWithTimeout(url, {
        ...options,
        headers: { Accept: 'application/json', ...options.headers }
    })

    if (!response.ok) {
        throw new HttpStatusError(url, response.status, response.statusText)
    }

    return await response.json() as T
}