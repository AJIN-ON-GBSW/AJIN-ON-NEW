import { ApiError, request, serializableState, type PageState } from './api';

export interface PageSnapshot { page: string; state: PageState; revision: number; updatedAt: string | null }
export type SavePhase = 'loading' | 'saved' | 'pending' | 'saving' | 'offline' | 'conflict' | 'error';
export interface SaveStatus {
  phase: SavePhase;
  message: string;
  revision: number;
  dirty: boolean;
  savedAt: string | null;
}
interface Recovery { version: 1; page: string; state: PageState; base: PageState; revision: number; savedAt: string }

export function loadPageState(page: string, signal?: AbortSignal) {
  return request<PageSnapshot>(`/api/pages/${encodeURIComponent(page)}/state`, { signal });
}
export function savePageState(page: string, state: PageState, revision: number) {
  return request<PageSnapshot>(`/api/pages/${encodeURIComponent(page)}/state`, {
    method: 'PUT', body: JSON.stringify({ state, revision }),
  });
}

function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => equal(value, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]));
}
const messages: Record<SavePhase, string> = {
  loading: '저장된 내용 불러오는 중', saved: '저장 완료', pending: '변경 내용 저장 대기', saving: '저장 중',
  offline: '서버 연결 안 됨 · 이 브라우저에 임시 보관', conflict: '다른 곳에서 변경된 내용이 있습니다. 저장 방법을 선택해 주세요.', error: '저장하지 못했습니다. 다시 시도해 주세요.',
};

/** Class-component friendly, debounced, serial persistence. Subscribe for visible save feedback.
 * load() returns the restored state. Call update() after user changes, flush() before navigation.
 * On conflict retry() safely merges different top-level fields. retry(true) explicitly keeps ours.
 * dispose() stops timers/listeners; unsaved recovery survives in localStorage until saved.
 */
export class PageStateStore {
  private state: PageState;
  private base: PageState;
  private revision = 0;
  private savedAt: string | null = null;
  private dirty = false;
  private phase: SavePhase = 'loading';
  private message = messages.loading;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing: Promise<void> | undefined;
  private listeners = new Set<(status: SaveStatus) => void>();
  private stateListeners = new Set<(state: PageState) => void>();
  private disposed = false;
  private generation = 0;
  private recoveryKey: string;
  private readonly onOnline = () => { if (this.dirty && this.phase === 'offline') void this.retry().catch(() => undefined); };
  private readonly onUnload = (event: BeforeUnloadEvent) => {
    if (this.dirty) { event.preventDefault(); event.returnValue = ''; }
  };

  constructor(readonly page: string, initialState: Record<string, unknown> = {}) {
    this.state = serializableState(initialState);
    this.base = this.state;
    this.recoveryKey = `ajin-on:unsaved:v1:${page}`;
    window.addEventListener('online', this.onOnline);
    window.addEventListener('beforeunload', this.onUnload);
  }
  get status(): SaveStatus {
    return { phase: this.phase, message: this.message, revision: this.revision, dirty: this.dirty, savedAt: this.savedAt };
  }
  get currentState(): PageState { return this.state; }
  subscribe(listener: (status: SaveStatus) => void) {
    this.listeners.add(listener);
    listener(this.status);
    return () => { this.listeners.delete(listener); };
  }
  /** Receive server/recovery merges that also need to be applied to the visible page.
   * Subscribe after initial load; update() deliberately does not echo user edits. */
  subscribeState(listener: (state: PageState) => void) {
    this.stateListeners.add(listener);
    return () => { this.stateListeners.delete(listener); };
  }
  private publishState() {
    if (!this.disposed) this.stateListeners.forEach((listener) => listener(this.state));
  }
  private notify(phase: SavePhase, message = messages[phase]) {
    this.phase = phase;
    this.message = message;
    if (!this.disposed) this.listeners.forEach((listener) => listener(this.status));
  }
  private readRecovery(): Recovery | null {
    try {
      const raw = localStorage.getItem(this.recoveryKey);
      const value = raw ? JSON.parse(raw) as Recovery : null;
      return value?.version === 1 && value.page === this.page && value.state && value.base ? value : null;
    } catch { return null; }
  }
  private recover() {
    try {
      if (!this.dirty) localStorage.removeItem(this.recoveryKey);
      else localStorage.setItem(this.recoveryKey, JSON.stringify({
        version: 1, page: this.page, state: this.state, base: this.base, revision: this.revision, savedAt: new Date().toISOString(),
      } satisfies Recovery));
      return true;
    } catch {
      this.notify('error', '임시 보관 공간이 부족합니다. 이 화면을 닫기 전에 서버 저장을 다시 시도해 주세요.');
      return false;
    }
  }
  async load(): Promise<PageState> {
    const recovery = this.readRecovery();
    this.notify('loading');
    try {
      const snapshot = await loadPageState(this.page);
      this.state = snapshot.state;
      this.base = snapshot.state;
      this.revision = snapshot.revision;
      this.savedAt = snapshot.updatedAt;
      if (recovery) {
        this.state = recovery.state;
        this.base = recovery.base;
        this.revision = recovery.revision;
        this.dirty = true;
        if (recovery.revision !== snapshot.revision) {
          this.notify('conflict', '임시 보관된 변경과 서버 변경이 함께 있습니다. 다시 저장을 눌러 확인해 주세요.');
        } else {
          this.notify('pending', '임시 보관된 변경을 복구했습니다. 서버에 저장합니다.');
          this.schedule();
        }
      } else this.notify('saved');
    } catch (error) {
      if (recovery) {
        this.state = recovery.state; this.base = recovery.base; this.revision = recovery.revision; this.dirty = true;
      }
      this.notify(error instanceof ApiError && error.status === 0 ? 'offline' : 'error',
        recovery ? '서버 연결 안 됨 · 임시 보관된 변경을 복구했습니다.' : '서버 내용을 불러오지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.');
    }
    return this.state;
  }
  update(state: Record<string, unknown>) {
    const next = serializableState(state);
    if (equal(next, this.state)) return;
    this.state = next;
    this.dirty = !equal(next, this.base);
    this.generation += 1;
    const recovered = this.recover();
    if (this.phase === 'conflict') return;
    this.notify(this.dirty ? 'pending' : 'saved', !recovered && this.dirty ? '임시 보관 공간이 부족합니다. 서버에 저장 중입니다. 화면을 닫지 마세요.' : messages[this.dirty ? 'pending' : 'saved']);
    if (this.dirty) this.schedule();
  }
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush().catch(() => undefined); }, 450);
  }
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (this.writing) { await this.writing; return this.flush(); }
    if (!this.dirty || this.disposed) return;
    if (this.phase === 'conflict') throw new ApiError(409, this.message, { code: 'REVISION_CONFLICT' });
    const generation = this.generation;
    const next = this.state;
    this.notify('saving');
    const operation = async () => {
      try {
        const snapshot = await savePageState(this.page, next, this.revision);
        this.base = snapshot.state;
        this.revision = snapshot.revision;
        this.savedAt = snapshot.updatedAt;
        this.dirty = generation !== this.generation && !equal(this.state, this.base);
        if (!this.dirty) this.state = snapshot.state;
        this.recover();
        this.notify(this.dirty ? 'pending' : 'saved');
      } catch (error) {
        this.dirty = true;
        this.recover();
        this.notify(error instanceof ApiError && error.status === 409 ? 'conflict' : error instanceof ApiError && error.status === 0 ? 'offline' : 'error', error instanceof Error ? error.message : messages.error);
        throw error;
      }
    };
    this.writing = operation();
    try { await this.writing; }
    finally { this.writing = undefined; }
    if (this.dirty && this.phase === 'pending') return this.flush();
  }
  async retry(overwriteConflicts = false): Promise<void> {
    if (this.writing) await this.writing.catch(() => undefined);
    if (!this.dirty) { await this.load(); this.publishState(); return; }
    const latest = await loadPageState(this.page).catch((error: unknown) => {
      this.notify(error instanceof ApiError && error.status === 0 ? 'offline' : 'error', error instanceof Error ? error.message : messages.error);
      throw error;
    });
    const merged: PageState = { ...latest.state };
    const conflicts: string[] = [];
    for (const key of new Set([...Object.keys(this.base), ...Object.keys(this.state)])) {
      if (equal(this.base[key], this.state[key])) continue;
      if (!overwriteConflicts && !equal(this.base[key], latest.state[key]) && !equal(this.state[key], latest.state[key])) conflicts.push(key);
      if (Object.hasOwn(this.state, key)) merged[key] = this.state[key]!;
      else delete merged[key];
    }
    if (conflicts.length) {
      this.notify('conflict', '같은 항목이 다른 곳에서도 변경되었습니다. “내 변경 내용 저장”을 선택하면 현재 화면의 변경을 저장합니다.');
      throw new ApiError(409, this.message, { code: 'REVISION_CONFLICT', fields: conflicts });
    }
    this.state = merged;
    this.base = latest.state;
    this.revision = latest.revision;
    this.dirty = !equal(this.state, this.base);
    this.recover();
    this.notify(this.dirty ? 'pending' : 'saved');
    this.publishState();
    await this.flush();
  }
  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.disposed = true;
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('beforeunload', this.onUnload);
    this.listeners.clear();
    this.stateListeners.clear();
  }
}
