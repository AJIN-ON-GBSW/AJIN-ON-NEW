import type { EvaluationExportRow, EvaluationExportSource } from './export-workbook';

export interface ImportedEvaluationRow {
  type: string;
  year: number;
  date: string;
  round: number;
  plant: string;
  managementNumber: string;
  item: string;
  judgment: string;
  nonconformance: string;
  improvement: string;
  actionStatus: string;
}

const TYPES: Record<string, string> = {
  internal: '내부 현장평가', qstar: '품질5스타', sq: 'SQ평가', iatf: 'IATF 16949',
};
const JUDGMENTS: Record<string, string> = {
  b: '보완', i: '일부미흡', d: '다수미흡', y: '양호', x: '미기재', major: 'Major', minor: 'Minor', ofi: 'OFI',
};
const COLORS: Record<string, [string, string]> = {
  b: ['#eef3fd', '#3a5f9f'], i: ['#e2ebfb', '#1d4ed8'], d: ['#fff1dc', '#a35f12'],
  y: ['#e7f5ee', '#1f7a55'], x: ['#f0f2f5', '#66758a'],
  major: ['#fdecec', '#c23b3b'], minor: ['#fff1dc', '#a35f12'], ofi: ['#eef3fd', '#3a5f9f'],
};
const all = (value: unknown) => value === undefined || value === null || value === 'all';
const equal = (left: unknown, right: unknown) => String(left) === String(right);
const compact = (text: string) => text.replace(/\s+/g, '').toLowerCase();
const typeKey = (value: unknown) => {
  const text = typeof value === 'string' ? compact(value) : '';
  return Object.keys(TYPES).find((key) => key === text || compact(TYPES[key]!) === text || (key === 'iatf' && text === 'iatf16949심사'));
};
const judgmentKey = (value: unknown) => {
  const label = typeof value === 'string' ? compact(value) : '';
  return Object.keys(JUDGMENTS).find((key) => key === label || compact(JUDGMENTS[key]!) === label);
};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const sortDate = (date: string) => date.replaceAll('.', '-');

function itemCode(item: string) {
  return item.match(/^\s*(\d+(?:[.-]\d+)+)(?:\s|$)/)?.[1] ?? item.trim();
}

/** API-normalized imports are read defensively so a malformed saved record cannot break the screen. */
export function importedEvaluationRows(source: EvaluationExportSource): EvaluationExportRow[] {
  const values = source.state.importedRows;
  if (!Array.isArray(values)) return [];
  const result: EvaluationExportRow[] = [];
  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const kind = typeKey(row.type);
    const judgment = judgmentKey(row.judgment);
    const year = Number(row.year);
    const round = Number(row.round);
    const date = text(row.date);
    if (!kind || !judgment || !Number.isInteger(year) || !Number.isInteger(round) ||
      year < 2000 || year > 2100 || round < 1 || round > 10 || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !text(row.plant).trim() || !text(row.managementNumber).trim() || !text(row.item).trim()) continue;
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== date) continue;
    const item = text(row.item);
    result.push({
      type: TYPES[kind]!, year, date, round, plant: text(row.plant),
      managementNumber: text(row.managementNumber), itemCode: itemCode(item), item,
      judgmentCode: judgment, judgment: JUDGMENTS[judgment]!,
      nonconformance: text(row.nonconformance), improvement: text(row.improvement), actionStatus: text(row.actionStatus),
    });
  }
  return result;
}

function matches(row: EvaluationExportRow, state: Record<string, unknown>): boolean {
  if (state.scope === 'all') return true;
  return (all(state.type) || typeKey(state.type) === typeKey(row.type)) &&
    (all(state.year) || equal(state.year, row.year)) &&
    (all(state.plant) || equal(state.plant, row.plant)) &&
    (all(state.round) || equal(state.round, row.round)) &&
    (all(state.area) || equal(state.area, row.itemCode.split(/[.-]/)[0])) &&
    (all(state.judg) || judgmentKey(state.judg) === row.judgmentCode);
}

/** Single source for both the visible list and workbook, independent of UI pagination. */
export function combinedEvaluationRows(source: EvaluationExportSource): EvaluationExportRow[] {
  const rows: EvaluationExportRow[] = [];
  const state = source.state;
  const originalTypeSelected = state.scope === 'all' || all(state.type) || typeKey(state.type) === 'internal';
  if (originalTypeSelected) {
    for (const event of source.EVENTS) {
      const eventCodes = Array.isArray(source.J) ? source.J[event.id] : source.J?.[String(event.id)];
      const codes = (eventCodes ?? '').split('|');
      let sequence = 0;
      Object.entries(event.items).forEach(([code, count], itemIndex) => {
        const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
        for (let index = 0; index < total; index += 1) {
          sequence += 1;
          const judgment = judgmentKey(codes[itemIndex]?.[index]) ?? 'x';
          const row: EvaluationExportRow = {
            type: TYPES.internal!, year: event.y, date: event.date, round: event.round, plant: event.plant,
            managementNumber: `QM-${String(event.y).slice(2)}-${event.round}-${String(sequence).padStart(3, '0')}`,
            itemCode: code, item: `${code} ${source.ITEMS[code] ?? ''}`.trim(),
            judgmentCode: judgment, judgment: JUDGMENTS[judgment]!, nonconformance: '', improvement: '', actionStatus: '',
          };
          if (matches(row, state)) rows.push(row);
        }
      });
    }
  }
  for (const row of importedEvaluationRows(source)) if (matches(row, state)) rows.push(row);
  return rows.sort((left, right) => sortDate(right.date).localeCompare(sortDate(left.date)));
}

export interface EvaluationListSource extends EvaluationExportSource {
  setState?: (state: Record<string, unknown>) => void;
}

function chipStyle(on: boolean) {
  return `border: 1px solid ${on ? '#141a23' : '#d5dbe4'}; background: ${on ? '#141a23' : '#ffffff'}; color: ${on ? '#ffffff' : '#2b3644'}; border-radius: 16px; padding: 5px 13px; font: inherit; font-size: 13px; cursor: pointer`;
}

/** Keep original analytics immutable while including actual imported rows in the master list.
 * Extra detail fields stay attached to each row; open() selects importedDetail for the service modal.
 */
export function enhanceEvaluationValues(source: EvaluationListSource, values: Record<string, any>) {
  const state = source.state;
  const visibleSource = { ...source, state: { ...state, scope: 'filter' } };
  const allRows = combinedEvaluationRows(visibleSource);
  const importedRows = importedEvaluationRows(visibleSource);
  const importedKeys = new Set(importedRows.map((row) => JSON.stringify([row.type, row.plant, row.managementNumber, row.date, row.item])));
  const limit = typeof state.limit === 'number' && Number.isFinite(state.limit) ? Math.max(1, Math.floor(state.limit)) : 40;
  const listRows = allRows.slice(0, limit).map((row) => {
    const [background, color] = COLORS[row.judgmentCode] ?? COLORS.x!;
    const imported = importedKeys.has(JSON.stringify([row.type, row.plant, row.managementNumber, row.date, row.item]));
    const label = row.item.startsWith(row.itemCode) ? row.item.slice(row.itemCode.length).trim() || row.item : row.item;
    return {
      yr: `${row.year} · ${row.round}차`, plant: row.plant, date: row.date.replaceAll('-', '.'), mg: row.managementNumber,
      no: row.itemCode, item: label, j: row.judgment,
      jStyle: `justify-self: start; font-size: 11px; font-weight: 700; border-radius: 8px; padding: 3px 8px; background: ${background}; color: ${color}`,
      type: row.type, imported, nonconformance: row.nonconformance, improvement: row.improvement, actionStatus: row.actionStatus,
      open: imported ? () => source.setState?.({ importedDetail: { ...row } }) : undefined,
    };
  });

  const yearChips = [...(values.yearChips ?? [])];
  for (const year of [...new Set(importedRows.map((row) => row.year))].sort((a, b) => a - b)) {
    if (yearChips.some((chip) => chip.label === `${year}년`)) continue;
    yearChips.push({ label: `${year}년`, style: chipStyle(equal(state.year, year)), pick: () => source.setState?.({ year, sel: null, limit: 40 }) });
  }
  const plantChips = [...(values.plantChips ?? [])];
  for (const plant of [...new Set(importedRows.map((row) => row.plant))].sort((a, b) => a.localeCompare(b, 'ko'))) {
    if (plantChips.some((chip) => chip.label === plant)) continue;
    plantChips.push({ label: plant, style: chipStyle(state.plant === plant), pick: () => source.setState?.({ plant, sel: null, limit: 40 }) });
  }
  const judgChips = [...(values.judgChips ?? [])];
  for (const code of [...new Set(importedRows.map((row) => row.judgmentCode))]) {
    const label = JUDGMENTS[code]!;
    if (judgChips.some((chip) => chip.label === label)) continue;
    judgChips.push({ label, style: chipStyle(judgmentKey(state.judg) === code), pick: () => source.setState?.({ judg: code, limit: 40 }) });
  }
  const typeChips = [
    { key: 'all', label: '전체' },
    ...Object.entries(TYPES).map(([key, label]) => ({ key, label })),
  ].map(({ key, label }) => ({
    label,
    style: chipStyle(key === 'all' ? all(state.type) : typeKey(state.type) === key),
    pick: () => source.setState?.({ type: key, sel: null, limit: 40 }),
  }));
  const wholeRows = combinedEvaluationRows({ ...source, state: { ...state, scope: 'all' } });
  const years = [...new Set(wholeRows.map((row) => row.year))].sort((a, b) => a - b);
  const yearLabel = years.length > 1 ? `${years[0]} ~ ${years.at(-1)}` : years.length ? String(years[0]) : '전체 연도';
  const scopeOpts = (values.scopeOpts ?? []).map((option: Record<string, unknown>, index: number) => ({
    ...option,
    sub: index === 0
      ? `${values.filterLabel || '현재 조건'} · ${allRows.length.toLocaleString('ko-KR')}행`
      : `${yearLabel} · 모든 공장 · ${wholeRows.length.toLocaleString('ko-KR')}행`,
  }));
  return {
    ...values, listRows, listCount: allRows.length.toLocaleString('ko-KR'), listEmpty: allRows.length === 0,
    hasMore: allRows.length > limit, moreLabel: `더 보기 (${Math.min(limit, allRows.length).toLocaleString('ko-KR')} / ${allRows.length.toLocaleString('ko-KR')})`,
    more: () => source.setState?.({ limit: limit + 40 }), yearChips, plantChips, judgChips, typeChips, scopeOpts,
    filterRows: allRows.length.toLocaleString('ko-KR'),
    hasData: values.hasData || allRows.length > 0, noData: !(values.hasData || allRows.length > 0),
    importedCount: importedRows.length,
    showImportedTypes: importedRows.some((row) => typeKey(row.type) !== 'internal'),
  };
}
