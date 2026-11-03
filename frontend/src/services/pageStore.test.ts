// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializableState } from './api';
import { PageStateStore } from './pageStore';

const response = (state: unknown, revision = 0, status = 200) => new Response(JSON.stringify({ page: 'qstar', state, revision, updatedAt: '2026-11-03T00:00:00Z' }), { status, headers: { 'Content-Type': 'application/json' } });
let stores: PageStateStore[] = [];
function store(initial: Record<string, unknown> = {}) { const next = new PageStateStore('qstar', initial); stores.push(next); return next; }
beforeEach(() => { localStorage.clear(); stores = []; });
afterEach(() => { stores.forEach((item) => item.dispose()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('page persistence', () => {
  it('keeps reusable object references but excludes attached file contents', () => {
    const shared = { score: 90 };
    const input: Record<string, unknown> = { all: [shared], filtered: [shared], upload: new File(['private'], 'report.txt') };
    input.self = input;
    expect(serializableState(input)).toEqual({ all: [{ score: 90 }], filtered: [{ score: 90 }] });
  });

  it('does not save equivalent JSONB objects whose key order changed', async () => {
    const fetch = vi.fn(async () => response({ scores: { out: 12, qm: 9 }, entity: 'ajin', admin: true }));
    vi.stubGlobal('fetch', fetch);
    const subject = store({ admin: true, entity: 'ajin', scores: { qm: 9, out: 12 } });
    await subject.load();
    subject.update({ admin: true, entity: 'ajin', scores: { qm: 9, out: 12 } });
    await subject.flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(subject.status.dirty).toBe(false);
    expect(subject.status.phase).toBe('saved');
  });

  it('serializes concurrent flushes and preserves edits made during a save', async () => {
    let finishFirst: ((value: Response) => void) | undefined;
    const writes: Array<{ state: unknown; revision: number }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method !== 'PUT') return response({ note: '' });
      const body = JSON.parse(String(options.body)) as { state: unknown; revision: number };
      writes.push(body);
      if (writes.length === 1) return new Promise<Response>((resolve) => { finishFirst = resolve; });
      return response(body.state, 2);
    }));
    const subject = store();
    await subject.load();
    subject.update({ note: 'first' });
    const first = subject.flush();
    const second = subject.flush();
    subject.update({ note: 'second' });
    finishFirst!(response({ note: 'first' }, 1));
    await Promise.all([first, second]);
    expect(writes).toEqual([{ state: { note: 'first' }, revision: 0 }, { state: { note: 'second' }, revision: 1 }]);
    expect(subject.status.phase).toBe('saved');
    expect(subject.currentState).toEqual({ note: 'second' });
    expect(localStorage.getItem('ajin-on:unsaved:v1:qstar')).toBeNull();
  });

  it('retains unsaved data when offline and restores it after a reload', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'PUT') throw new TypeError('Offline');
      return response({ note: 'old' });
    }));
    const subject = store();
    await subject.load(); subject.update({ note: 'unsaved' });
    await expect(subject.flush()).rejects.toThrow();
    expect(subject.status.phase).toBe('offline');
    subject.dispose();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Offline'); }));
    const reopened = store();
    expect(await reopened.load()).toEqual({ note: 'unsaved' });
    expect(reopened.status.dirty).toBe(true);
    expect(reopened.status.phase).toBe('offline');
  });

  it('merges independent concurrent fields without overwriting the remote edit', async () => {
    let current = { title: 'Initial', note: 'Old' };
    let revision = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method !== 'PUT') return response(current, revision);
      const body = JSON.parse(String(options.body)) as { state: typeof current; revision: number };
      if (body.revision !== revision) return new Response(JSON.stringify({ code: 'REVISION_CONFLICT', message: 'Conflict' }), { status: 409 });
      current = body.state; revision += 1; return response(current, revision);
    }));
    const subject = store(); await subject.load();
    subject.update({ title: 'Initial', note: 'Our note' });
    current = { title: 'Remote title', note: 'Old' }; revision = 1;
    await expect(subject.flush()).rejects.toThrow('Conflict');
    const stateChanged = vi.fn();
    const unsubscribe = subject.subscribeState(stateChanged);
    await subject.retry();
    expect(stateChanged).toHaveBeenCalledWith({ title: 'Remote title', note: 'Our note' });
    unsubscribe();
    expect(current).toEqual({ title: 'Remote title', note: 'Our note' });
    expect(subject.status.phase).toBe('saved');
  });

  it('requires an explicit overwrite for changes to the same field', async () => {
    let current = { note: 'Old' }; let revision = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method !== 'PUT') return response(current, revision);
      const body = JSON.parse(String(options.body)) as { state: typeof current; revision: number };
      if (body.revision !== revision) return new Response(JSON.stringify({ code: 'REVISION_CONFLICT', message: 'Conflict' }), { status: 409 });
      current = body.state; revision += 1; return response(current, revision);
    }));
    const subject = store(); await subject.load(); subject.update({ note: 'Our note' });
    current = { note: 'Remote note' }; revision = 1;
    await expect(subject.flush()).rejects.toThrow();
    await expect(subject.retry()).rejects.toThrow('같은 항목');
    expect(current.note).toBe('Remote note');
    await subject.retry(true);
    expect(current.note).toBe('Our note');
  });
});
