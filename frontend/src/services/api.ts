export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type PageState = Record<string, JsonValue>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: Record<string, unknown>;

  constructor(status: number, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = typeof details.code === 'string' ? details.code : undefined;
    this.details = details;
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const timeout = new AbortController();
  const abort = () => timeout.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = window.setTimeout(() => timeout.abort(), 20_000);
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  try {
    const response = await fetch(path, { ...options, headers, signal: timeout.signal, credentials: 'same-origin' });
    const content = response.status === 204 ? '' : await response.text();
    let data: unknown;
    try { data = content ? JSON.parse(content) : undefined; }
    catch {
      throw new ApiError(response.status, '서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    if (!response.ok) {
      const details = data && typeof data === 'object' ? data as Record<string, unknown> : {};
      throw new ApiError(response.status, typeof details.message === 'string' ? details.message : `요청에 실패했습니다 (${response.status}).`, details);
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timeout.signal.aborted) throw new ApiError(0, '요청 시간이 초과되었거나 취소되었습니다. 연결 상태를 확인하고 다시 시도해 주세요.');
    throw new ApiError(0, '서버에 연결할 수 없습니다. 변경 내용은 이 브라우저에 보관합니다.');
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

/** Files belong to the document API, rather than the persisted page JSON. */
export function serializableState(value: Record<string, unknown>): PageState {
  const ancestors = new WeakSet<object>();
  const visit = (item: unknown): JsonValue | undefined => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') return Number.isFinite(item) ? item : null;
    if (typeof item === 'bigint') return item.toString();
    if (typeof item !== 'object') return undefined;
    if (typeof File !== 'undefined' && item instanceof File) return undefined;
    if (typeof Blob !== 'undefined' && item instanceof Blob) return undefined;
    if (typeof Element !== 'undefined' && item instanceof Element) return undefined;
    if (item instanceof Date) return item.toISOString();
    if (ancestors.has(item)) return undefined;
    ancestors.add(item);
    let result: JsonValue;
    if (Array.isArray(item)) result = item.map((entry) => visit(entry) ?? null);
    else {
      const object: Record<string, JsonValue> = {};
      for (const [key, entry] of Object.entries(item)) {
        const converted = visit(entry);
        if (converted !== undefined) object[key] = converted;
      }
      result = object;
    }
    ancestors.delete(item);
    return result;
  };
  return visit(value) as PageState;
}
