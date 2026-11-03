// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import writeExcelFile, { type Cell } from 'write-excel-file/universal';
import { ApiError } from './api';
import {
  EVALUATION_HEADERS, evaluationImportIssues, importEvaluations, parseEvaluationData, parseEvaluationWorkbook,
} from './evaluation-import';

const valid = () => ['내부 현장평가', 2026, '2026-11-03', '1차', '경산공장', 'QM-26-1-001', '1-1 입고 대기품 관리', '일부미흡', '실제 부적합 원문\n두 번째 줄', '', '진행 중'];
afterEach(() => { vi.unstubAllGlobals(); });

describe('evaluation XLSX parsing', () => {
  it('normalizes exported dotted dates and round labels while preserving empty evidence', () => {
    const source = valid(); source[2] = '2026.11.03';
    const parsed = parseEvaluationData([EVALUATION_HEADERS, source]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({ type: '내부 현장평가', year: 2026, date: '2026-11-03', round: 1, improvement: '', nonconformance: '실제 부적합 원문\n두 번째 줄' });
  });
  it('keeps actual Excel row numbers when empty rows occur before an invalid row', () => {
    const source = valid(); source[2] = '2026-02-30'; source[7] = '';
    const parsed = parseEvaluationData([EVALUATION_HEADERS, [], source]);
    expect(parsed.rowCount).toBe(1);
    expect(parsed.rowNumbers).toEqual([3]);
    expect(parsed.errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 3, field: 'date' }), expect.objectContaining({ row: 3, field: 'judgment' })]));
    expect(parsed.rows[0]?.judgment).toBe('');
  });
  it('rejects changed headers, extra columns and header-only workbooks', () => {
    const header = [...EVALUATION_HEADERS]; header[0] = '종류' as typeof header[0];
    expect(parseEvaluationData([header, valid()]).errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 1, field: 'headers' })]));
    expect(parseEvaluationData([EVALUATION_HEADERS, [...valid(), 'unmapped data']]).errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 2, field: 'columns' })]));
    expect(parseEvaluationData([EVALUATION_HEADERS]).errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 2, field: 'rows' })]));
  });
  it('rejects excessive rows and oversized text payloads before any API call', () => {
    expect(parseEvaluationData([EVALUATION_HEADERS, ...Array.from({ length: 1001 }, valid)]).errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'rows' })]));
    const long = valid(); long[8] = 'a'.repeat(20_000);
    expect(parseEvaluationData([EVALUATION_HEADERS, ...Array.from({ length: 60 }, () => long)]).errors).toEqual(expect.arrayContaining([expect.objectContaining({ row: 1, field: 'rows', message: expect.stringContaining('1MB') })]));
  });
  it('reports all invalid year, round, type and judgment fields', () => {
    const source = valid(); source[0] = '임의 평가'; source[1] = 2026.5; source[3] = '11차'; source[7] = '임의 판정';
    expect(parseEvaluationData([EVALUATION_HEADERS, source]).errors.map((error) => error.field)).toEqual(expect.arrayContaining(['type', 'year', 'round', 'judgment']));
  });
  it('reads a real workbook first sheet and recognizes native Excel date cells', async () => {
    const values: (string | number | Date)[] = valid(); values[2] = new Date('2026-11-03T00:00:00Z');
    const cell = (value: string | number | Date): Cell => ({ value, type: value instanceof Date ? Date : typeof value === 'number' ? Number : String, ...(value instanceof Date ? { format: 'yyyy-mm-dd' } : {}) });
    const blob = await writeExcelFile([
      { sheet: '평가이력', data: [EVALUATION_HEADERS.map(cell), values.map(cell)] },
      { sheet: '요약', data: [[cell('This sheet is not import data')]] },
    ]).toBlob();
    const parsed = await parseEvaluationWorkbook(blob);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.date).toBe('2026-11-03');
  });
});

describe('evaluation import API boundary', () => {
  it('does not submit a partially valid batch', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const row = parseEvaluationData([EVALUATION_HEADERS, valid()]).rows[0]!;
    await expect(importEvaluations([row, { ...row, date: '2026-02-30' }])).rejects.toThrow('엑셀 입력값');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('posts normalized rows and returns the persisted snapshot', async () => {
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    const snapshot = { page: 'eval-history', state: { importedRows: [] }, revision: 3, updatedAt: '2026-11-03T00:00:00Z' };
    const fetch = vi.fn(async () => new Response(JSON.stringify({ imported: 1, skipped: 0, snapshot }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    const rows = parseEvaluationData([EVALUATION_HEADERS, valid()]).rows;
    expect(await importEvaluations(rows)).toEqual({ imported: 1, skipped: 0, snapshot });
    expect(fetch).toHaveBeenCalledWith('/api/evaluations/import', expect.objectContaining({ method: 'POST', body: JSON.stringify({ rows }) }));
  });
  it('maps server compact row numbers back to the selected workbook', () => {
    const error = new ApiError(400, 'Invalid import', { errors: [{ row: 3, field: 'plant', message: '필수 항목입니다.' }] });
    expect(evaluationImportIssues(error, [2, 5])).toEqual([{ row: 5, field: 'plant', message: '필수 항목입니다.' }]);
  });
});
