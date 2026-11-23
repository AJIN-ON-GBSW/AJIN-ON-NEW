import writeExcelFile, { type Cell, type SheetData } from 'write-excel-file/universal';
import { combinedEvaluationRows, JUDGMENTS } from './imported-evaluations';

/** The reference contains aggregate findings, not nonconformance or corrective-action text. */
export interface EvaluationEvent {
  id: number;
  y: number;
  round: number;
  date: string;
  sort: string;
  plant: string;
  g?: number[];
  items: Record<string, number>;
}

export interface EvaluationExportSource {
  state: Record<string, unknown>;
  EVENTS: EvaluationEvent[];
  ITEMS: Record<string, string>;
  J?: string[] | Record<string, string>;
  PLANTS?: string[];
}

export interface EvaluationExportRow {
  evaluator?: string;
  auditType?: string;
  criteriaVersion?: string;
  type: string;
  year: number;
  date: string;
  round: number;
  plant: string;
  managementNumber: string;
  itemCode: string;
  item: string;
  judgmentCode: string;
  judgment: string;
  nonconformance: string;
  improvement: string;
  actionStatus: string;
}

export interface EvaluationSheet {
  sheet: string;
  data: SheetData;
  columns: Array<{ width: number }>;
  stickyRowsCount: number;
  stickyColumnsCount?: number;
}

export interface EvaluationWorkbookPlan {
  filename: string;
  rows: EvaluationExportRow[];
  sheets: EvaluationSheet[];
  dataSheetCount: number;
  extraSheetCount: number;
}

const COLUMNS = [
  '평가 종류', '연도', '점검일', '차수', '공장', '관리번호', '평가항목', '판정',
  '부적합 사항', '개선대책', '조치 상태',
];
const WIDTHS = [20, 10, 16, 10, 20, 22, 44, 16, 44, 44, 16];
const header = (value: string): Cell => ({
  value, type: String, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: '#0B2343',
  height: 28, wrap: true, alignVertical: 'center',
});
const cell = (value: string | number): Cell => ({
  value, type: typeof value === 'number' ? Number : String, alignVertical: 'top', wrap: true,
});
const all = (value: unknown) => value === undefined || value === null || value === 'all';
const same = (value: unknown, target: unknown) => String(value) === String(target);

function safeSheetName(input: string, used: Set<string>) {
  const base = input.replace(/[\\/\[\]*?:]/g, '_').replace(/^'+|'+$/g, '').trim().slice(0, 31) || '평가이력';
  let name = base;
  let suffix = 2;
  while (used.has(name.toLocaleLowerCase())) {
    const tail = ` (${suffix++})`;
    name = base.slice(0, 31 - tail.length) + tail;
  }
  used.add(name.toLocaleLowerCase());
  return name;
}

/** Expand the original per-item count/judgment codes exactly as the on-screen list does.
 * Sequence numbers advance before filters, keeping the same management number across exports.
 */
export function evaluationExportRows(source: EvaluationExportSource): EvaluationExportRow[] {
  return combinedEvaluationRows(source);
}

function dataRow(row: EvaluationExportRow): Cell[] {
  return [
    row.type, row.year, row.date, `${row.round}차`, row.plant, row.managementNumber,
    row.item, row.judgment, row.nonconformance, row.improvement, row.actionStatus,
  ].map(cell);
}

/** A pure preview shares the exact row/sheet counts with the download implementation. */
export function planEvaluationWorkbook(source: EvaluationExportSource, now = new Date()): EvaluationWorkbookPlan {
  const rows = evaluationExportRows(source);
  const state = source.state;
  const usedNames = new Set<string>();
  const sheets: EvaluationSheet[] = [];
  const groups = new Map<string, EvaluationExportRow[]>();
  for (const row of rows) {
    const name = state.split === 'plant' ? row.plant : state.split === 'year' ? `${row.year}년` : '평가이력';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(row);
  }
  // Excel needs at least one visible sheet, including a valid export with no matching rows.
  if (groups.size === 0) groups.set('평가이력', []);
  for (const [name, list] of groups) {
    sheets.push({
      sheet: safeSheetName(name, usedNames), data: [COLUMNS.map(header), ...list.map(dataRow)],
      columns: WIDTHS.map((width) => ({ width })), stickyRowsCount: 1,
    });
  }
  const dataSheetCount = sheets.length;
  const extras = state.extras as { summary?: boolean; heat?: boolean } | undefined;
  if (extras?.summary !== false) {
    const counts = new Map<string, { year: number; plant: string; judgment: string; count: number }>();
    for (const row of rows) {
      const key = JSON.stringify([row.year, row.plant, row.judgment]);
      const entry = counts.get(key) ?? { year: row.year, plant: row.plant, judgment: row.judgment, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
    const values = [...counts.values()].sort((a, b) => a.year - b.year || a.plant.localeCompare(b.plant, 'ko') || a.judgment.localeCompare(b.judgment, 'ko'));
    sheets.push({
      sheet: safeSheetName('요약', usedNames),
      data: [
        ['연도', '공장', '판정', '건수'].map(header),
        ...values.map((entry) => [entry.year, entry.plant, entry.judgment, entry.count].map(cell)),
        ['합계', '', '', rows.length].map((value) => ({ ...cell(value), fontWeight: 'bold' as const })),
      ], columns: [12, 22, 18, 14].map((width) => ({ width })), stickyRowsCount: 1,
    });
  }
  if (extras?.heat !== false) {
    const itemLabels = new Map(Object.entries(source.ITEMS).map(([code, name]) => [code, `${code} ${name}`]));
    for (const row of rows) if (!itemLabels.has(row.itemCode)) itemLabels.set(row.itemCode, row.item);
    const itemCodes = [...itemLabels.keys()].filter((code) => state.scope === 'all' || all(state.area) || same(state.area, code.split(/[.-]/)[0]));
    const presentPlants = new Set(rows.map((row) => row.plant));
    const plants = [...(source.PLANTS ?? []).filter((plant) => presentPlants.has(plant)),
      ...[...presentPlants].filter((plant) => !source.PLANTS?.includes(plant)).sort((a, b) => a.localeCompare(b, 'ko'))];
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = JSON.stringify([row.plant, row.itemCode]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const largest = Math.max(1, ...counts.values());
    sheets.push({
      sheet: safeSheetName('공장×평가항목', usedNames),
      data: [
        ['공장', ...itemCodes.map((code) => itemLabels.get(code)!), '합계'].map(header),
        ...plants.map((plant) => {
          const values = itemCodes.map((code) => counts.get(JSON.stringify([plant, code])) ?? 0);
          return [cell(plant), ...values.map((value) => ({
            ...cell(value), align: 'center' as const,
            backgroundColor: value ? `#${[29, 78, 216].map((tone) => Math.round(255 - (255 - tone) * (0.12 + 0.88 * value / largest)).toString(16).padStart(2, '0')).join('')}` : '#F5F7FA',
            textColor: value / largest > 0.5 ? '#FFFFFF' : '#2B3644',
          })), cell(values.reduce((sum, value) => sum + value, 0))];
        }),
      ], columns: [{ width: 22 }, ...itemCodes.map(() => ({ width: 23 })), { width: 12 }],
      stickyRowsCount: 1, stickyColumnsCount: 1,
    });
  }
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const scope = state.scope === 'all' ? '전체' : [
    all(state.year) ? '전체연도' : `${String(state.year)}년`,
    all(state.plant) ? '모든공장' : String(state.plant),
    all(state.round) ? '' : `${String(state.round)}차`,
    all(state.area) ? '' : `${String(state.area)}영역`,
    all(state.judg) ? '' : JUDGMENTS[String(state.judg)] ?? String(state.judg),
  ].filter(Boolean).join('_');
  return {
    filename: `AJIN_ON_평가이력_${scope}_${stamp}.xlsx`.replace(/[\\/:*?"<>|]/g, '_'),
    rows, sheets, dataSheetCount, extraSheetCount: sheets.length - dataSheetCount,
  };
}

/** Uses the package's current v4 API; universal output is testable in browsers and Node. */
export async function buildEvaluationWorkbook(source: EvaluationExportSource): Promise<Blob> {
  return writeExcelFile(planEvaluationWorkbook(source).sheets, { fontFamily: '맑은 고딕', fontSize: 11 }).toBlob();
}

export async function exportEvaluationWorkbook(source: EvaluationExportSource): Promise<void> {
  const plan = planEvaluationWorkbook(source);
  const blob = await writeExcelFile(plan.sheets, { fontFamily: '맑은 고딕', fontSize: 11 }).toBlob();
  downloadWorkbook(blob, plan.filename);
}

export async function exportEvaluationTemplate(): Promise<void> {
  const blob = await writeExcelFile([COLUMNS.map(header)], {
    sheet: '평가이력 입력양식', columns: WIDTHS.map((width) => ({ width })), stickyRowsCount: 1,
  }, { fontFamily: '맑은 고딕', fontSize: 11 }).toBlob();
  downloadWorkbook(blob, 'AJIN_ON_평가이력_입력양식.xlsx');
}

function downloadWorkbook(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try { anchor.click(); }
  finally {
    anchor.remove();
    // Allow browsers to consume the object URL before releasing the workbook bytes.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
