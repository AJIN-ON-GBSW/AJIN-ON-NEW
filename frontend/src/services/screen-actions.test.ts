// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { buildScreenWorkbook, planScreenWorkbook, snapshotQstar, type ActionPage } from './screen-actions';

function qstar(): ActionPage {
  return {
    state: { admin: true, estEntity: 'ajin', histYear: '2025' },
    renderVals: () => ({
      estEntityName: '아진산업', estTotal: '89.06',
      estRows: [{ name: '입고불량', max: 10, value: '8.87', source: '실적 관리', rate: '88.7%', loss: '−1.13' }, { name: '외주사관리', max: 15, value: '미입력', source: '직접 입력', rate: '—', loss: '—' }],
      estEntities: [{ name: '아진산업', code: 'D017', total: '89.06', status: '5개 항목 모두 입력' }],
      histRows: [{ name: '아진산업', code: 'D017', v1: '[점수]', v2: '[점수]', v3: '[점수]', v4: '[점수]', v5: '[점수]', total: '[합계]', grade: '[등급]' }],
    }),
    setState(update, callback) { this.state = { ...this.state, ...(typeof update === 'function' ? update(this.state) : update) }; callback?.(); },
    store: { update: vi.fn(), flush: vi.fn(async () => undefined) },
  };
}
const valueAt = (data: ReturnType<typeof planScreenWorkbook>['sheets'][number]['data'], row: number, col: number) => {
  const cell = data[row]?.[col];
  return cell && typeof cell === 'object' && 'value' in cell ? cell.value : cell;
};

describe('screen actions', () => {
  it('saves exactly one immutable displayed snapshot for rapid repeated clicks', async () => {
    const page = qstar();
    const one = snapshotQstar(page); const two = snapshotQstar(page);
    expect(one).toBe(two);
    const saved = await one;
    expect(saved.entity).toBe('ajin');
    expect(saved.entityName).toBe('아진산업');
    expect(saved.total).toBe('89.06');
    expect(saved.values[1]?.value).toBe('미입력');
    expect(page.state.snapshots).toEqual([saved]);
    expect(page.store?.flush).toHaveBeenCalledTimes(1);
    page.state.estEntity = 'ajincar';
    expect(saved.entity).toBe('ajin');
  });

  it('rejects a failed snapshot save so the UI cannot report success', async () => {
    const page = qstar();
    page.store!.flush = vi.fn(async () => { throw new Error('Offline'); });
    await expect(snapshotQstar(page)).rejects.toThrow('Offline');
    expect(page.state.snapshots).toHaveLength(1);
  });

  it('exports real Qstar current values and leaves unprovided history values empty', () => {
    const plan = planScreenWorkbook('qstar', qstar(), new Date('2026-11-03T01:00:00Z'));
    expect(plan.filename).toBe('AJIN_ON_품질5스타_20261103.xlsx');
    expect(valueAt(plan.sheets[0]!.data, 1, 3)).toBe(8.87);
    expect(valueAt(plan.sheets[0]!.data, 2, 3)).toBe('');
    expect(valueAt(plan.sheets[0]!.data, 3, 3)).toBe(89.06);
    expect(valueAt(plan.sheets[2]!.data, 1, 3)).toBe('');
    expect(valueAt(plan.sheets[2]!.data, 1, 9)).toBe('');
  });

  it('exports the visible FieldAudit result filter and keeps example descriptions marked as examples', () => {
    const page = { state: {}, renderVals: () => ({ resRows: [{ kind: '타사', corp: '[타사 법인명]', plant: '[공장명]', date: '2026.03.10', evaluator: '현대차·기아 [평가원]', no: '2-7', item: '교육 및 자격인증', text: '예) 특별특성 작업자 자격인증 주기 확인' }], critItems: [{ id: '2-7', name: '교육 및 자격인증', max: 30, question: '적절한가?', points: [{ text: '실제 제공된 점검 기준' }] }] }) };
    const plan = planScreenWorkbook('field-audit', page);
    expect(plan.sheets[0]!.data).toHaveLength(2);
    expect(valueAt(plan.sheets[0]!.data, 1, 0)).toBe('타사');
    expect(valueAt(plan.sheets[0]!.data, 1, 1)).toBe('');
    expect(valueAt(plan.sheets[0]!.data, 1, 7)).toBe('예) 특별특성 작업자 자격인증 주기 확인');
    expect(valueAt(plan.sheets[1]!.data, 1, 4)).toBe('실제 제공된 점검 기준');
  });

  it('keeps current SQ filtering and explicit zero scores', () => {
    const page = { state: {}, renderVals: () => ({ rows: [{ name: '우신산업', key: '일반용접', score: 0 }], typeRows: [{ sys: '인증제도', no: '2', name: '용접', count: '1', subs: [{ label: '① 일반용접', note: '저항용접' }] }] }) };
    const plan = planScreenWorkbook('sq', page);
    expect(plan.sheets[0]!.data).toHaveLength(2);
    expect(valueAt(plan.sheets[0]!.data, 1, 1)).toBe('일반용접');
    expect(valueAt(plan.sheets[0]!.data, 1, 3)).toBe(0);
    expect(valueAt(plan.sheets[0]!.data, 1, 4)).toBe('');
    expect(plan.sheets[1]!.data).toHaveLength(2);
  });

  it('exports visible IATF rows without converting unknown audit details into zeros', () => {
    const page = { state: {}, renderVals: () => ({ rows: [{ year: '2026', kind: '사후2차', site: '본사 · 경산', dates: '2026.07.06 ~ 07.07 (2일)' }], certRows: [{ org: '아진산업', plant: '본사', has: '취득', no: '[인증서 번호]' }] }) };
    const plan = planScreenWorkbook('iatf', page);
    expect(valueAt(plan.sheets[0]!.data, 1, 2)).toBe('본사 · 경산');
    expect(valueAt(plan.sheets[0]!.data, 1, 4)).toBe('');
    expect(valueAt(plan.sheets[0]!.data, 1, 6)).toBe('');
    expect(valueAt(plan.sheets[1]!.data, 1, 3)).toBe('');
  });

  it('builds a real XLSX ZIP payload', async () => {
    const blob = await buildScreenWorkbook('qstar', qstar());
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});
