import { describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { combinedEvaluationRows, enhanceEvaluationValues, importedEvaluationRows, type ImportedEvaluationRow } from './imported-evaluations';
import { buildEvaluationWorkbook, planEvaluationWorkbook, type EvaluationExportSource } from './export-workbook';

function imported(overrides: Partial<ImportedEvaluationRow> = {}): ImportedEvaluationRow {
  return {
    type: '내부 현장평가', year: 2027, date: '2027-04-01', round: 2, plant: '새공장', managementNumber: 'NEW-001',
    item: '2-9 부적합품 관리', judgment: '일부미흡', nonconformance: '태그 사유 누락', improvement: '기재란 추가', actionStatus: '조치 중',
    ...overrides,
  };
}
function source(rows: ImportedEvaluationRow[] = [imported()]): EvaluationExportSource {
  return {
    state: { type: 'internal', year: 'all', plant: 'all', round: 'all', area: 'all', judg: 'all', scope: 'filter', limit: 40, extras: { summary: true, heat: true }, importedRows: rows },
    EVENTS: [{ id: 0, y: 2026, round: 1, date: '2026.04.01', sort: '2026-04-01', plant: '본사', items: { '1-1': 2, '2-9': 1 } }],
    ITEMS: { '1-1': '입고품 관리', '2-9': '부적합품 관리' }, J: ['bi|d'], PLANTS: ['본사'],
  };
}
const values = () => ({ listRows: [{ mg: 'already-limited' }], listCount: '3', yearChips: [{ label: '전체' }, { label: '2026년' }], plantChips: [{ label: '전체' }, { label: '본사' }], hasData: true });

describe('imported evaluation rows', () => {
  it('combines complete source rows with actual imported text without duplicating the limited UI list', () => {
    const subject = source();
    const all = combinedEvaluationRows(subject);
    expect(all).toHaveLength(4);
    expect(all[0]).toMatchObject({ managementNumber: 'NEW-001', itemCode: '2-9', nonconformance: '태그 사유 누락', improvement: '기재란 추가', actionStatus: '조치 중' });
    const next = enhanceEvaluationValues(subject, values());
    expect(next.listRows).toHaveLength(4);
    expect(next.listRows[0]).toMatchObject({ yr: '2027 · 2차', date: '2027.04.01', mg: 'NEW-001', no: '2-9', item: '부적합품 관리', j: '일부미흡', imported: true });
    expect(next.listRows.some((row) => row.mg === 'already-limited')).toBe(false);
    expect(next.listCount).toBe('4');
  });

  it('honors all six visible filters and keeps the workbook rows identical', () => {
    const subject = source([imported(), imported({ managementNumber: 'OTHER', plant: '다른공장' })]);
    subject.state = { ...subject.state, year: 2027, plant: '새공장', round: 2, area: '2', judg: 'i' };
    const next = enhanceEvaluationValues(subject, values());
    const plan = planEvaluationWorkbook(subject);
    expect(next.listCount).toBe('1');
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]!.managementNumber).toBe(next.listRows[0]!.mg);
    subject.state.judg = 'b';
    expect(enhanceEvaluationValues(subject, values()).listEmpty).toBe(true);
    expect(planEvaluationWorkbook(subject).rows).toHaveLength(0);
  });

  it('supports all four evaluation types while all-scope export leaves the visible filter intact', () => {
    const subject = source([
      imported(), imported({ type: '품질5스타', managementNumber: 'FIVE' }),
      imported({ type: 'SQ평가', managementNumber: 'SQ' }),
      imported({ type: 'IATF 16949 심사', managementNumber: 'IATF', item: '8.7.1.3 의심품 관리' }),
    ]);
    for (const [type, managementNumber] of [['qstar', 'FIVE'], ['sq', 'SQ'], ['iatf', 'IATF']]) {
      subject.state.type = type;
      expect(combinedEvaluationRows(subject).map((row) => row.managementNumber)).toEqual([managementNumber]);
    }
    subject.state.scope = 'all';
    expect(planEvaluationWorkbook(subject).rows).toHaveLength(7);
    const visible = enhanceEvaluationValues(subject, { ...values(), hasData: false });
    expect(visible.listRows.map((row) => row.mg)).toEqual(['IATF']);
    expect(visible.hasData).toBe(true);
    expect(visible.noData).toBe(false);
  });

  it('exposes type selectors only when non-internal imports exist and makes those rows reachable', () => {
    expect(enhanceEvaluationValues(source([]), values()).showImportedTypes).toBe(false);
    expect(enhanceEvaluationValues(source(), values()).showImportedTypes).toBe(false);
    const subject = source([imported({ type: 'IATF 16949', judgment: 'Major', managementNumber: 'IATF-NEW' })]);
    const instance = { ...subject, setState: (patch: Record<string, unknown>) => { instance.state = { ...instance.state, ...patch }; } };
    const next = enhanceEvaluationValues(instance, values());
    expect(next.showImportedTypes).toBe(true);
    expect(next.typeChips.map((chip) => chip.label)).toEqual(['전체', '내부 현장평가', '품질5스타', 'SQ평가', 'IATF 16949']);
    next.typeChips.find((chip) => chip.label === 'IATF 16949')!.pick();
    const selected = enhanceEvaluationValues(instance, values());
    expect(selected.listRows.map((row) => row.mg)).toEqual(['IATF-NEW']);
    selected.typeChips.find((chip) => chip.label === '전체')!.pick();
    expect(enhanceEvaluationValues(instance, values()).listCount).toBe('4');
  });

  it('uses actual expanded and imported counts in both export scope options without changing their actions', () => {
    const subject = source([imported({ type: 'IATF 16949', judgment: 'Major' })]);
    subject.state = { ...subject.state, type: 'iatf', scope: 'all' };
    const pick = vi.fn();
    const next = enhanceEvaluationValues(subject, {
      ...values(), filterLabel: '전체 연도 · 모든 공장', filterRows: '0',
      scopeOpts: [
        { label: '지금 걸어둔 조건만', pick, style: 'original-style', dot: 'original-dot', sub: '0행' },
        { label: '전체 싹 모아서', pick, sub: '999행' },
      ],
    });
    expect(next.scopeOpts[0]!.sub).toBe('전체 연도 · 모든 공장 · 1행');
    expect(next.scopeOpts[1]!.sub).toBe('2026 ~ 2027 · 모든 공장 · 4행');
    expect(next.scopeOpts[0]).toMatchObject({ label: '지금 걸어둔 조건만', style: 'original-style', dot: 'original-dot' });
    expect(next.scopeOpts[0]!.pick).toBe(pick);
    expect(next.filterRows).toBe('1');
  });

  it('paginates the combined list and resets the page when selecting new imported years and plants', () => {
    const subject = source(Array.from({ length: 45 }, (_, index) => imported({ managementNumber: `N-${index}` })));
    const setState = vi.fn((patch: Record<string, unknown>) => { subject.state = { ...subject.state, ...patch }; });
    const instance = { ...subject, setState };
    const first = enhanceEvaluationValues(instance, values());
    expect(first.listRows).toHaveLength(40);
    expect(first.listCount).toBe('48');
    expect(first.moreLabel).toBe('더 보기 (40 / 48)');
    expect(first.hasMore).toBe(true);
    first.more();
    instance.state = subject.state;
    const second = enhanceEvaluationValues(instance, values());
    expect(second.listRows).toHaveLength(48);
    expect(second.hasMore).toBe(false);
    second.yearChips.find((chip) => chip.label === '2027년')!.pick();
    expect(setState).toHaveBeenLastCalledWith({ year: 2027, sel: null, limit: 40 });
    second.plantChips.find((chip) => chip.label === '새공장')!.pick();
    expect(setState).toHaveBeenLastCalledWith({ plant: '새공장', sel: null, limit: 40 });
  });

  it('selects actual detail text without using the incompatible reference event modal state', () => {
    const subject = source(); const setState = vi.fn();
    const next = enhanceEvaluationValues({ ...subject, setState }, values());
    next.listRows[0]!.open!();
    expect(setState).toHaveBeenCalledWith({ importedDetail: expect.objectContaining({ nonconformance: '태그 사유 누락', improvement: '기재란 추가', actionStatus: '조치 중' }) });
    expect(next.listRows[1]!.open).toBeUndefined();
  });

  it('ignores malformed saved imports without breaking valid reference data', () => {
    const subject = source();
    subject.state.importedRows = [null, 'bad', imported({ date: '2027-02-30' }), imported({ year: 2101 }), imported({ judgment: 'unknown' }), imported()];
    expect(importedEvaluationRows(subject)).toHaveLength(1);
    expect(combinedEvaluationRows(subject)).toHaveLength(4);
  });

  it('supports all IATF judgments and keeps evaluation year independent from the inspection date', () => {
    const subject = source(['Major', 'Minor', 'OFI'].map((judgment) => imported({ type: 'IATF 16949', judgment, managementNumber: judgment, year: 2026 })));
    subject.state = { ...subject.state, type: 'iatf', year: 2026 };
    const setState = vi.fn();
    const next = enhanceEvaluationValues({ ...subject, setState }, values());
    expect(next.listRows.map((row) => row.j)).toEqual(['Major', 'Minor', 'OFI']);
    expect(next.listRows.every((row) => row.jStyle.includes('background: #'))).toBe(true);
    next.judgChips.find((chip) => chip.label === 'Major')!.pick();
    expect(setState).toHaveBeenCalledWith({ judg: 'major', limit: 40 });
    subject.state.judg = 'major';
    expect(planEvaluationWorkbook(subject).rows.map((row) => row.judgment)).toEqual(['Major']);
  });

  it('counts imported-only item codes in summaries and heat totals', () => {
    const subject = source([imported({ type: 'IATF 16949 심사', item: '8.7.1.3 의심품 관리' })]);
    subject.state = { ...subject.state, type: 'iatf' };
    const plan = planEvaluationWorkbook(subject);
    expect(plan.sheets).toHaveLength(3);
    expect(plan.sheets[2]!.data[0]).toContainEqual(expect.objectContaining({ value: '8.7.1.3 의심품 관리' }));
    expect(plan.sheets[2]!.data[1]!.at(-1)).toMatchObject({ value: 1 });
    expect(plan.sheets[1]!.data.at(-1)!.at(-1)).toMatchObject({ value: 1 });
  });

  it('writes actual imported descriptions into a genuine eleven-column workbook', async () => {
    const subject = source([imported({ nonconformance: '=실제 입력된 문장', improvement: '격리 위치 지정' })]);
    subject.state = { ...subject.state, year: 2027, extras: { summary: false, heat: false } };
    const blob = await buildEvaluationWorkbook(subject);
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob);
    });
    const archive = unzipSync(new Uint8Array(bytes));
    const data = new DOMParser().parseFromString(strFromU8(archive['xl/worksheets/sheet1.xml']!), 'application/xml');
    const strings = strFromU8(archive['xl/sharedStrings.xml']!);
    expect(data.getElementsByTagName('row')).toHaveLength(2);
    expect(data.getElementsByTagName('c')).toHaveLength(22);
    expect(data.getElementsByTagName('f')).toHaveLength(0);
    expect(strings).toContain('=실제 입력된 문장');
    expect(strings).toContain('격리 위치 지정');
    expect(strings).toContain('조치 중');
  });
});
