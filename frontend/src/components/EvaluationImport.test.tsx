// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import writeExcelFile, { type Cell } from 'write-excel-file/universal';
import EvaluationImport from './EvaluationImport';
import { EVALUATION_HEADERS } from '../services/evaluation-import';

function readBytes(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob); });
}
async function workbook(invalid = false) {
  const headers: string[] = [...EVALUATION_HEADERS];
  if (invalid) headers[0] = '잘못된 제목';
  const values = ['내부 현장평가', 2026, '2026.11.03', '1차', '경산공장', 'QM-26-1-001', '1-1 입고 대기품 관리', '일부미흡', '실제 지적 원문', '', '진행 중'];
  const row = (values: readonly (string | number)[]): Cell[] => values.map((value) => ({ value, type: typeof value === 'number' ? Number : String }));
  const bytes = await readBytes(await writeExcelFile([row(headers), row(values)]).toBlob());
  const file = new File([bytes], 'real.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  // jsdom does not implement the native Blob.arrayBuffer() browser API used by the current reader.
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes });
  return file;
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('evaluation import dialog', () => {
  it('previews a real XLSX file and flushes existing edits before submitting normalized data', async () => {
    let finishFlush: (() => void) | undefined;
    const before = vi.fn(() => new Promise<void>((resolve) => { finishFlush = resolve; }));
    const imported = vi.fn(async () => undefined);
    const snapshot = { page: 'eval-history', state: { importedRows: [] }, revision: 1, updatedAt: '2026-11-03T00:00:00Z' };
    const fetch = vi.fn(async (_input: string, _options: RequestInit) => new Response(JSON.stringify({ imported: 1, skipped: 0, snapshot }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    render(<EvaluationImport onClose={vi.fn()} onBeforeImport={before} onImported={imported} />);
    fireEvent.change(screen.getByLabelText('엑셀 파일 (.xlsx)'), { target: { files: [await workbook()] } });
    await screen.findByText('real.xlsx · 데이터 1행');
    expect(screen.getByRole('region', { name: '등록 미리보기' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '1행 등록' }));
    await waitFor(() => expect(before).toHaveBeenCalledTimes(1));
    expect(fetch).not.toHaveBeenCalled();
    finishFlush!();
    await waitFor(() => expect(imported).toHaveBeenCalledWith(snapshot, { imported: 1, skipped: 0, snapshot }));
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body.rows[0]).toMatchObject({ year: 2026, date: '2026-11-03', round: 1, nonconformance: '실제 지적 원문', improvement: '' });
    expect(await screen.findByText('1건을 등록했습니다. 이미 등록된 중복 0건은 건너뛰었습니다.')).not.toBeNull();
  });

  it('displays a bad header and disables the whole batch before any POST', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const before = vi.fn(async () => undefined);
    render(<EvaluationImport onClose={vi.fn()} onBeforeImport={before} onImported={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('엑셀 파일 (.xlsx)'), { target: { files: [await workbook(true)] } });
    expect(await screen.findByRole('region', { name: '엑셀 입력 오류' })).not.toBeNull();
    expect(screen.getByText(/1행 · 열 이름:/)).not.toBeNull();
    const submit = screen.getByRole('button', { name: '1행 등록' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(before).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
