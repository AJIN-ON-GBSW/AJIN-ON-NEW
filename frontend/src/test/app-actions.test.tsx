// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import Qstar from '../pages/Qstar.jsx';
import Performance from '../pages/Performance.jsx';
import EvalHistory from '../pages/EvalHistory.jsx';
import Main from '../pages/Main.jsx';
import FieldAudit from '../pages/FieldAudit.jsx';
import Internal from '../pages/Internal.jsx';
import SQ from '../pages/SQ.jsx';
import IATF from '../pages/IATF.jsx';
import { PageStateStore } from '../services/pageStore';

const actions = vi.hoisted(() => ({
  download: vi.fn(async () => ({ filename: 'quality.xlsx', sheetCount: 3, rowCount: 10 })),
  snapshot: vi.fn(async () => ({ id: 'snapshot-1', at: '2026-11-03T00:00:00Z', entity: 'ajin', entityName: '아진산업', values: [], total: '89.06' })),
}));
vi.mock('../services/screen-actions', () => ({ downloadScreenWorkbook: actions.download, snapshotQstar: actions.snapshot }));

let states: Record<string, Record<string, unknown>>;
let revisions: Record<string, number>;
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  localStorage.clear();
  actions.download.mockClear(); actions.snapshot.mockClear();
  const qstar = new Qstar({ pageId: 'qstar' });
  const performance = new Performance({ pageId: 'performance' });
  const history = new EvalHistory({ pageId: 'eval-history' });
  states = { qstar: structuredClone(qstar.state), performance: structuredClone(performance.state), 'eval-history': structuredClone(history.state),
    main: structuredClone(new Main({ pageId: 'main' }).state),
    'field-audit': structuredClone(new FieldAudit({ pageId: 'field-audit' }).state),
    internal: structuredClone(new Internal({ pageId: 'internal' }).state),
    sq: structuredClone(new SQ({ pageId: 'sq' }).state),
    iatf: structuredClone(new IATF({ pageId: 'iatf' }).state),
  };
  revisions = {};
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(async (input: string, options: RequestInit = {}) => {
    const path = String(input);
    const page = path.match(/^\/api\/pages\/([^/]+)\/state$/)?.[1];
    if (page) {
      if (!states[page]) throw new Error(`Unexpected page request: ${page}`);
      if (options.method === 'PUT') {
        const body = JSON.parse(String(options.body));
        states[page] = body.state;
        revisions[page] = (revisions[page] ?? 0) + 1;
      }
      return json({ page, state: states[page], revision: revisions[page] ?? 0, updatedAt: '2026-11-03T00:00:00Z' });
    }
    if (path.startsWith('/api/documents')) return json([]);
    throw new Error(`Unexpected API request: ${path}`);
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function open(path: string) {
  history.replaceState({}, '', path);
  const view = render(<App />);
  await waitFor(() => expect(view.container.querySelector('[aria-busy]')?.getAttribute('aria-busy')).toBe('false'));
  return view;
}

describe('actual app button routing', () => {
  it('downloads the Qstar workbook instead of opening the generic document dialog', async () => {
    await open('/qstar');
    fireEvent.click(screen.getByRole('button', { name: '엑셀로 내려받기' }));
    await waitFor(() => expect(actions.download).toHaveBeenCalledTimes(1));
    expect(actions.download).toHaveBeenCalledWith('qstar', expect.objectContaining({ state: expect.objectContaining({ estEntity: 'ajin' }) }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('saves a Qstar aggregate snapshot instead of only flushing the generic page store', async () => {
    const flush = vi.spyOn(PageStateStore.prototype, 'flush');
    await open('/qstar');
    flush.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '이 시점 집계 저장' }));
    await waitFor(() => expect(actions.snapshot).toHaveBeenCalledTimes(1));
    expect(actions.snapshot).toHaveBeenCalledWith(expect.objectContaining({ state: expect.objectContaining({ estEntity: 'ajin' }) }));
    expect(flush).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens real notice attachments when a Qstar PDF link is selected', async () => {
    await open('/qstar');
    fireEvent.click(screen.getAllByRole('link', { name: 'PDF 보기 ›' })[0]!);
    expect(await screen.findByRole('dialog', { name: '통보서 자료' })).not.toBeNull();
    expect(screen.getByRole('button', { name: '파일 첨부' })).not.toBeNull();
    expect(actions.download).not.toHaveBeenCalled();
  });

  it('flushes performance inputs when the actual save button is clicked', async () => {
    const flush = vi.spyOn(PageStateStore.prototype, 'flush');
    await open('/performance');
    flush.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '실적 저장' }));
    await waitFor(() => expect(flush).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('변경 내용을 저장했습니다.')).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(actions.download).not.toHaveBeenCalled();
  });

  it('hydrates every lazily loaded screen after actual link navigation, including revisiting Qstar', async () => {
    const view = await open('/qstar');
    const steps = [
      ['FieldAudit', '/field-audit', '품질5스타 현장평가'],
      ['Internal', '/internal', '내부 현장평가'],
      ['EvalHistory', '/eval-history', '내부 현장평가'],
      ['SQ', '/sq', 'SQ평가'],
      ['IATF', '/iatf', 'IATF 16949'],
      ['Main', '/', ''],
      ['Qstar', '/qstar', '품질5스타'],
      ['Performance', '/performance', '품질5스타 실적 관리'],
    ];
    for (const [route, path, heading] of steps) {
      const link = view.container.querySelector<HTMLAnchorElement>(`a[href="${route}.dc.html"]`);
      expect(link, `Navigation link for ${route}`).not.toBeNull();
      fireEvent.click(link!);
      await waitFor(() => expect(location.pathname).toBe(path));
      await waitFor(() => expect(view.container.querySelector('[aria-busy]')?.getAttribute('aria-busy')).toBe('false'));
      if (heading) expect(view.container.querySelector('h1')?.textContent).toContain(heading);
      expect(view.container.querySelector('[inert]')).toBeNull();
    }
  });

  it.each([
    ['button', '결과 등록 (엑셀)'], ['link', '엑셀 일괄 등록'],
  ] as const)('opens registration for the %s %s rather than treating Excel as a download', async (role, label) => {
    await open('/eval-history');
    fireEvent.click(screen.getByRole(role, { name: label }));
    expect(await screen.findByRole('dialog', { name: '엑셀 평가 결과 등록' })).not.toBeNull();
    expect((screen.getByRole('button', { name: '0행 등록' }) as HTMLButtonElement).disabled).toBe(true);
    expect(actions.download).not.toHaveBeenCalled();
  });
});
