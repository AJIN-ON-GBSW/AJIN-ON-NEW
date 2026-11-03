#!/usr/bin/env node
// Live API smoke test: reads page state and owns only its uniquely named temporary document.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const origin = process.env.AJIN_API_BASE_URL || 'http://127.0.0.1:8080';
const results = [];
let ownedDocument = null;
async function checked(label, task) {
  await task();
  results.push({ label, ok: true });
}
async function api(path, options = {}) {
  const response = await fetch(new URL(path, origin), { ...options, signal: AbortSignal.timeout(15_000) });
  assert.ok(response.ok, `${options.method || 'GET'} ${path}: HTTP ${response.status} ${await response.clone().text()}`);
  return response;
}
try {
  await checked('Database health', async () => assert.equal((await (await api('/actuator/health')).json()).status, 'UP'));
  const pages = await (await api('/api/pages')).json();
  assert.equal(Object.keys(pages).length, 8);
  for (const page of Object.keys(pages)) await checked(`${page}: persisted state`, async () => {
    const snapshot = await (await api(`/api/pages/${page}/state`)).json();
    assert.equal(snapshot.page, page);
    assert.equal(typeof snapshot.state, 'object');
    assert.ok(Number.isSafeInteger(snapshot.revision));
    assert.equal(typeof snapshot.state.admin, 'boolean');
  });
  await checked('Reference content search includes matching excerpt', async () => {
    const result = await (await api(`/api/search?${new URLSearchParams({ q: '낙하품' })}`)).json();
    assert.ok(result.pages.length > 0);
    assert.ok(result.pages.every(page => page.excerpt.includes('낙하품')));
  });
  const id = randomUUID();
  const title = `AJIN-ON smoke ${id}`;
  const content = `AJIN-ON API 실제 파일 저장 검증\n${id}\n`;
  const form = new FormData();
  form.append('scope', 'smoke-check');
  form.append('title', title);
  form.append('category', 'API 검증');
  form.append('file', new Blob([content], { type: 'text/plain;charset=utf-8' }), `ajin-on-smoke-${id}.txt`);
  await checked('Upload temporary owned document', async () => {
    ownedDocument = await (await api('/api/documents', { method: 'POST', body: form })).json();
    assert.equal(ownedDocument.title, title);
    assert.equal(ownedDocument.category, 'API 검증');
    assert.equal(ownedDocument.size, new TextEncoder().encode(content).length);
  });
  await checked('Search temporary owned document', async () => {
    const found = await (await api(`/api/documents/search?${new URLSearchParams({ scope: 'smoke-check', q: id })}`)).json();
    assert.equal(found.length, 1);
    assert.equal(found[0].id, ownedDocument.id);
  });
  await checked('Download original bytes', async () => {
    const download = await api(`/api/documents/${ownedDocument.id}/download`);
    assert.equal(await download.text(), content);
    assert.ok(download.headers.get('content-disposition')?.startsWith('attachment;'));
  });
  await checked('Delete temporary owned document', async () => {
    assert.equal((await api(`/api/documents/${ownedDocument.id}`, { method: 'DELETE' })).status, 204);
    const deleted = await fetch(new URL(`/api/documents/${ownedDocument.id}/download`, origin));
    assert.equal(deleted.status, 404);
    ownedDocument = null;
  });
  process.stdout.write(`${JSON.stringify({ origin, passed: results.length, results }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
} finally {
  if (ownedDocument) {
    const cleanup = await fetch(new URL(`/api/documents/${ownedDocument.id}`, origin), { method: 'DELETE', signal: AbortSignal.timeout(10_000) });
    if (!cleanup.ok && cleanup.status !== 404) {
      process.stderr.write(`Temporary document cleanup failed: ${ownedDocument.id} (HTTP ${cleanup.status})\n`);
      process.exitCode = 1;
    }
  }
}
