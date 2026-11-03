import type { ReactNode } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { Main, Qstar, Performance, FieldAudit, Internal, EvalHistory, SQ, IATF } from '../pages/index.js';
import { styleObject } from '../runtime/PageComponent.jsx';
import { buildEvaluationWorkbook, exportEvaluationTemplate, planEvaluationWorkbook } from '../services/export-workbook';

// Business handlers belong to the generated React class. Rendering its returned React tree
// exercises real DOM events without invoking the separately tested API hydration lifecycle.
function page(Page: any) {
  const instance = new Page({ pageId: 'test' });
  instance.setState = (patch: any, callback?: () => void) => {
    const next = typeof patch === 'function' ? patch(instance.state, instance.props) : patch;
    instance.state = { ...instance.state, ...next };
    callback?.();
  };
  return instance;
}

function screenOf(instance: any) {
  const screen = render(instance.render() as ReactNode);
  return { ...screen, refresh: () => screen.rerender(instance.render() as ReactNode) };
}

function blobBytes(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T12:00:00+09:00'));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('all supplied screen layouts are React elements', () => {
  const screens = [
    ['Main', Main, '품질에 필요한 모든 자료', '품질5스타 현장평가'],
    ['Qstar', Qstar, '2026 법인별 점수', '입고불량'],
    ['Performance', Performance, '품질5스타 실적 관리', '입고수량'],
    ['FieldAudit', FieldAudit, '품질5스타 현장평가', '평가기준'],
    ['Internal', Internal, '2026년 연간 흐름', '2차 정기 현장평가'],
    ['EvalHistory', EvalHistory, '평가이력 마스터리스트', '다수미흡'],
    ['SQ', SQ, 'SQ 업종 분류', '프레스금형'],
    ['IATF', IATF, '인증 현황', '심사이력'],
  ] as const;

  it.each(screens)('%s renders its supplied content without DC runtime markup', (_name, Page, title, content) => {
    const { container } = screenOf(page(Page));
    expect(container.textContent).toContain(title);
    expect(container.textContent).toContain(content);
    expect(container.textContent).toContain('AJIN ON');
    expect(container.querySelector('main')).not.toBeNull();
    expect(container.querySelector('x-dc, sc-for, sc-if, iframe, script')).toBeNull();
    expect(container.innerHTML).not.toMatch(/\{\{|@@RT@@|hint-placeholder/);
    expect(container.querySelector('svg path')?.getAttribute('d') ?? '').not.toContain('{{');
  });

  it('converts dynamic CSS declarations and SVG attributes to their React equivalents', () => {
    expect(styleObject('background-color: #fff; font-size: 14px; --accent: #123')).toEqual({
      backgroundColor: '#fff', fontSize: '14px', '--accent': '#123',
    });
    const { container } = screenOf(page(Main));
    const icon = container.querySelector('a[href="Qstar.dc.html"] svg');
    expect(icon?.getAttribute('stroke-width')).toBe('1.8');
    expect(icon?.getAttribute('stroke-linecap')).toBe('round');
    expect(container.querySelector('label[for="homeSearch"]')).not.toBeNull();
  });
});

describe('home and quality dashboard interactions', () => {
  it('advances all four banners and expands then collapses the additional services', () => {
    const subject = page(Main);
    const screen = screenOf(subject);
    const next = screen.getByRole('button', { name: '다음 공지' });
    for (let count = 1; count <= 4; count += 1) {
      expect(next.textContent).toContain(`${count} / 4`);
      fireEvent.click(next); screen.refresh();
    }
    expect(subject.state.idx).toBe(0);
    expect(screen.queryByText('계열사 현황')).toBeNull();
    fireEvent.click(screen.getByText('전체보기')); screen.refresh();
    expect(screen.getByText('계열사 현황')).not.toBeNull();
    fireEvent.click(screen.getByText('접기')); screen.refresh();
    expect(screen.queryByText('계열사 현황')).toBeNull();
  });

  it('keeps the original expected-score sum and separates each company selection', () => {
    const subject = page(Qstar);
    expect(subject.renderVals().estTotal).toBe('89.06');
    expect(subject.renderVals().estRows).toHaveLength(5);
    subject.renderVals().estEntities[1].pick();
    expect(subject.renderVals().estEntityName).toBe('아진카인텍');
    expect(subject.renderVals().estTotal).toBe('—');
    expect(subject.renderVals().estRows.every((row: any) => row.value === '미입력')).toBe(true);
    subject.renderVals().histYearChips[0].pick();
    expect(subject.state.histYear).toBe('2022');
  });
});

describe('performance input and table conversion', () => {
  it('preserves nested table loops, input event handlers, boolean disabled and zero values', () => {
    const subject = page(Performance);
    const screen = screenOf(subject);
    const table = screen.container.querySelector('table')!;
    expect(table.rows).toHaveLength(5);
    expect([...table.rows].every((row) => row.cells.length === 15)).toBe(true);
    expect(table.querySelectorAll('tbody input')).toHaveLength(36);
    const receipts = screen.getByRole('spinbutton', { name: '입고수량 25년 9월' }) as HTMLInputElement;
    expect(receipts.closest('td')?.parentElement?.parentElement?.tagName).toBe('TBODY');
    expect(receipts.disabled).toBe(false);
    fireEvent.change(receipts, { target: { value: '0' } }); screen.refresh();
    expect(subject.state.data['ajin|incoming|receipts|0']).toBe('0');
    expect((screen.getByRole('spinbutton', { name: '입고수량 25년 9월' }) as HTMLInputElement).value).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: '본사 관리자' })); screen.refresh();
    expect((screen.getByRole('spinbutton', { name: '입고수량 25년 9월' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '실적 저장' })).toBeNull();
  });

  it('calculates half-year PPM from totals rather than the average of monthly PPM', () => {
    const subject = page(Performance);
    subject.state.data = {
      'ajin|incoming|receipts|0': '100', 'ajin|incoming|domestic|0': '1', 'ajin|incoming|kd|0': '0',
      'ajin|incoming|receipts|1': '900', 'ajin|incoming|domestic|1': '0', 'ajin|incoming|kd|1': '0',
    };
    const ppm = subject.renderVals().rows.find((row: any) => row.label === 'PPM');
    expect(ppm.cells[0].text).toBe('10,000.00');
    expect(ppm.cells[1].text).toBe('0.00');
    expect(ppm.cells[6].text).toBe('1,000.00');
    expect(subject.renderVals().summaryCards[0].stats[2].value).toBe('1,000.00');
    subject.renderVals().entityTabs[1].pick();
    expect(subject.renderVals().rows[0].cells[0].value).toBe('');
  });
});

describe('internal schedules', () => {
  it('moves the selected card before its target, then auto-sorts after changing a date', () => {
    const subject = page(Internal);
    const original = subject.state.order.second.slice();
    subject.renderVals().cards.find((card: any) => card.name === '경산').pick();
    expect(subject.state.picked).toBe('gyeongsan');
    subject.renderVals().cards.find((card: any) => card.name === '준텍').pick();
    expect(subject.state.order.second.slice(0, 6)).toEqual(['hq', 'geoncheon', 'gueo', 'ipsil', 'gyeongsan', 'juntek']);
    expect(subject.state.picked).toBeNull();
    subject.renderVals().cards.find((card: any) => card.name === '아진전자부품').setDate({ target: { value: '2026-10-01' } });
    expect(subject.state.order.second[0]).toBe('ajinelec');
    expect(subject.state.month).toBe(10);
    expect(subject.state.order.second).not.toEqual(original);
    subject.renderVals().pickFirst();
    expect(subject.state.order.first[0]).toBe('gyeongsan');
    expect(subject.renderVals().cards).toHaveLength(10);
  });

  it('hides future surprise dates in viewer mode and keeps the calendar consistent', () => {
    const subject = page(Internal);
    subject.renderVals().toggleRoundKind();
    subject.renderVals().toggleAdmin();
    const values = subject.renderVals();
    const future = values.cards.find((card: any) => card.name === '준텍');
    expect(future.status).toBe('일정 비공개');
    expect(future.dateText).toBe('불시 · 비공개');
    expect(future.order).toBe('?');
    expect(values.summary.find((item: any) => item.label === '다음 평가').value).toBe('비공개');
    expect(values.cells.flatMap((day: any) => day.events).some((event: any) => event.label.includes('준텍'))).toBe(false);
    expect(values.cards.find((card: any) => card.name === '경산').dateText).toBe('2026.10.13');
  });
});

describe('criteria, SQ and certification filters', () => {
  it('changes audit criteria, opens schedule details and applies both result filters', () => {
    const subject = page(FieldAudit);
    expect(subject.renderVals().critAreas).toHaveLength(5);
    subject.renderVals().critAreas[1].pick();
    expect(subject.renderVals().critItems).toHaveLength(10);
    expect(subject.renderVals().critItems[0].id).toBe('2-1');
    const event = subject.renderVals().visibleYears.flatMap((year: any) => year.items)[0];
    event.pick();
    expect(subject.renderVals().hasSel).toBe(true);
    subject.renderVals().close();
    expect(subject.renderVals().hasSel).toBe(false);
    subject.renderVals().resKinds.find((kind: any) => kind.label === '당사').pick();
    expect(subject.renderVals().resRows.every((row: any) => row.kind === '당사')).toBe(true);
    subject.renderVals().resAreas[2].pick();
    expect(subject.renderVals().resRows.every((row: any) => row.no.startsWith('2-'))).toBe(true);
  });

  it('filters SQ certification systems, own industries and partner industries', () => {
    const subject = page(SQ);
    expect(subject.renderVals().typeRows).toHaveLength(19);
    subject.renderVals().sysChips.find((chip: any) => chip.label === '등록제도').pick();
    expect(subject.renderVals().typeRows).toHaveLength(6);
    subject.renderVals().sysChips.find((chip: any) => chip.label === '우리 업종만').pick();
    expect(subject.renderVals().typeRows.map((row: any) => row.name)).toEqual(['용접', '도장', '프레스금형']);
    subject.renderVals().filters.find((filter: any) => filter.label === '일반용접').pick();
    expect(subject.renderVals().rows).toHaveLength(4);
    expect(subject.renderVals().rows.every((row: any) => row.key === '일반용접')).toBe(true);
  });

  it('expands certification cards and filters exact audit records by site and kind', () => {
    const subject = page(IATF);
    const cert = subject.renderVals().certCards.find((card: any) => card.name === '아진산업');
    cert.toggle();
    expect(subject.renderVals().certCards.find((card: any) => card.name === '아진산업').open).toBe(true);
    subject.renderVals().kindChips.find((chip: any) => chip.label === '사후1차').pick();
    subject.renderVals().siteChips.find((chip: any) => chip.label === '건천').pick();
    expect(subject.renderVals().rows).toHaveLength(1);
    expect(subject.renderVals().rows[0].kind).toBe('사후1차');
    expect(subject.renderVals().rows[0].site).toBe('건천 · 아진카인텍');
    const start = subject.state.start;
    subject.renderVals().next();
    expect(subject.state.start).toBe(start + 1);
  });
});

describe('evaluation history and real workbook data', () => {
  it('matches the master list identifiers and every selected filter in its export', () => {
    const subject = page(EvalHistory);
    const full = planEvaluationWorkbook(subject);
    expect(subject.EVENTS).toHaveLength(132);
    expect(full.rows).toHaveLength(4895);
    expect(subject.renderVals().listRows).toHaveLength(40);
    for (const [index, row] of subject.renderVals().listRows.entries()) {
      expect(full.rows[index]).toMatchObject({ managementNumber: row.mg, judgment: row.j, itemCode: row.no });
    }
    subject.renderVals().more();
    expect(subject.renderVals().listRows).toHaveLength(80);
    subject.state = { ...subject.state, year: 2025, plant: '건천', round: 1, area: '2', judg: 'i', split: 'plant' };
    const filtered = planEvaluationWorkbook(subject);
    expect(filtered.rows).toHaveLength(7);
    expect(subject.renderVals().listCount).toBe('7');
    expect(filtered.rows.every((row) => row.year === 2025 && row.plant === '건천' && row.round === 1 && row.itemCode.startsWith('2-') && row.judgment === '일부미흡')).toBe(true);
    expect(filtered.sheets.map((sheet) => sheet.sheet)).toEqual(['건천', '요약', '공장×평가항목']);
    expect(filtered.rows.every((row) => !row.nonconformance && !row.improvement && !row.actionStatus)).toBe(true);
    subject.state.scope = 'all'; subject.state.split = 'year';
    expect(planEvaluationWorkbook(subject).sheets).toHaveLength(7);
    expect(planEvaluationWorkbook(subject).rows).toHaveLength(4895);
  });

  it('creates a genuine XLSX ZIP with eleven columns, matching summary totals and heat cells', async () => {
    const subject = page(EvalHistory);
    subject.state = { ...subject.state, year: 2025, plant: '건천', round: 1, area: '2', judg: 'i', split: 'plant' };
    const blob = await buildEvaluationWorkbook(subject);
    const bytes = await blobBytes(blob);
    const archive = unzipSync(new Uint8Array(bytes));
    const xml = (path: string) => new DOMParser().parseFromString(strFromU8(archive[path]!), 'application/xml');
    const workbook = xml('xl/workbook.xml');
    expect([...workbook.getElementsByTagName('sheet')].map((sheet) => sheet.getAttribute('name'))).toEqual(['건천', '요약', '공장×평가항목']);
    const data = xml('xl/worksheets/sheet1.xml');
    expect(data.getElementsByTagName('row')).toHaveLength(8);
    expect([...data.getElementsByTagName('row')].every((row) => row.getElementsByTagName('c').length === 11)).toBe(true);
    expect(data.getElementsByTagName('f')).toHaveLength(0);
    const summaryRows = xml('xl/worksheets/sheet2.xml').getElementsByTagName('row');
    expect(summaryRows[summaryRows.length - 1]!.lastElementChild?.textContent).toBe('7');
    const heatRows = xml('xl/worksheets/sheet3.xml').getElementsByTagName('row');
    expect(heatRows).toHaveLength(2);
    expect(heatRows[1]!.lastElementChild?.textContent).toBe('7');
  });

  it('downloads a blank eleven-column input template with its promised filename', async () => {
    let workbook: Blob | undefined;
    let filename = '';
    const OriginalURL = URL;
    class DownloadURL extends OriginalURL {
      static createObjectURL(blob: Blob) { workbook = blob; return 'blob:ajin-template'; }
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal('URL', DownloadURL);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { filename = this.download; });
    vi.spyOn(window, 'setTimeout').mockImplementation((callback) => {
      if (typeof callback === 'function') callback();
      return 0 as unknown as ReturnType<typeof window.setTimeout>;
    });
    await exportEvaluationTemplate();
    expect(filename).toBe('AJIN_ON_평가이력_입력양식.xlsx');
    const archive = unzipSync(new Uint8Array(await blobBytes(workbook!)));
    const sheet = new DOMParser().parseFromString(strFromU8(archive['xl/worksheets/sheet1.xml']!), 'application/xml');
    expect(sheet.getElementsByTagName('row')).toHaveLength(1);
    expect(sheet.getElementsByTagName('c')).toHaveLength(11);
    expect(DownloadURL.revokeObjectURL).toHaveBeenCalledWith('blob:ajin-template');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
