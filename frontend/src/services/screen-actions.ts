import writeExcelFile, { type Cell, type SheetData } from 'write-excel-file/universal';
import type { PageStateStore } from './pageStore';

export interface QstarSnapshotValue {
  name: string;
  max: number;
  value: string;
  source: string;
  rate: string;
  loss: string;
}
export interface QstarSnapshot {
  id: string;
  at: string;
  entity: string;
  entityName: string;
  values: QstarSnapshotValue[];
  total: string;
}
interface ScreenValues { [key: string]: unknown }
export interface ActionPage {
  state: Record<string, unknown>;
  renderVals(): ScreenValues;
  setState(update: Record<string, unknown> | ((previous: Record<string, unknown>) => Record<string, unknown>), callback?: () => void): void;
  store?: Pick<PageStateStore, 'update' | 'flush'>;
}
export interface ScreenWorkbookSheet {
  sheet: string;
  data: SheetData;
  columns: Array<{ width: number }>;
  stickyRowsCount: number;
}
export interface ScreenWorkbookPlan { filename: string; sheets: ScreenWorkbookSheet[]; rowCount: number }
const pendingSnapshots = new WeakMap<ActionPage, Promise<QstarSnapshot>>();
const rows = (value: unknown): ScreenValues[] => Array.isArray(value) ? value.filter((row): row is ScreenValues => !!row && typeof row === 'object') : [];
const text = (value: unknown) => value === undefined || value === null ? '' : String(value);
/** Bracketed design placeholders are missing data, not real scores, dates, or grades. */
const exported = (value: unknown): string | number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  const valueText = text(value);
  return /^\[[^\]]*\]$/.test(valueText) || ['—', '미입력'].includes(valueText) ? '' : valueText;
};
const numeric = (value: unknown): string | number => {
  const present = exported(value);
  if (present === '') return '';
  const number = Number(present);
  return Number.isFinite(number) ? number : present;
};
const cells = (values: unknown[]): Cell[] => values.map((value) => {
  const content = exported(value);
  return { value: content, type: typeof content === 'number' ? Number : String, wrap: true, alignVertical: 'top' };
});
function sheet(name: string, headers: string[], values: unknown[][], widths?: number[]): ScreenWorkbookSheet {
  return {
    sheet: name,
    data: [headers.map((value): Cell => ({ value, type: String, fontWeight: 'bold', backgroundColor: '#0B2343', textColor: '#FFFFFF', wrap: true })), ...values.map(cells)],
    columns: headers.map((_value, index) => ({ width: widths?.[index] ?? 22 })), stickyRowsCount: 1,
  };
}
function snapshotValues(values: ScreenValues): QstarSnapshotValue[] {
  return rows(values.estRows).map((row) => ({
    name: text(row.name), max: typeof row.max === 'number' && Number.isFinite(row.max) ? row.max : 0,
    value: text(row.value), source: text(row.source), rate: text(row.rate), loss: text(row.loss),
  }));
}

/** Capture the displayed estimate exactly; no inferred PPM conversion, grades, or missing values. */
export function snapshotQstar(page: ActionPage): Promise<QstarSnapshot> {
  const current = pendingSnapshots.get(page);
  if (current) return current;
  const operation = async () => {
    if (!page.store) throw new Error('화면을 불러온 후 다시 집계를 저장해 주세요.');
    if (page.state.admin === false) throw new Error('본사 관리자 모드에서 집계를 저장할 수 있습니다.');
    const values = page.renderVals();
    const snapshot: QstarSnapshot = {
      id: crypto.randomUUID(), at: new Date().toISOString(), entity: text(page.state.estEntity),
      entityName: text(values.estEntityName), values: snapshotValues(values), total: text(values.estTotal),
    };
    if (!snapshot.values.length) throw new Error('저장할 집계 내용이 없습니다.');
    await new Promise<void>((resolve) => page.setState((previous) => ({ snapshots: [...rows(previous.snapshots), snapshot] }), resolve));
    page.store.update(page.state);
    await page.store.flush();
    return snapshot;
  };
  const pending = operation();
  pendingSnapshots.set(page, pending);
  void pending.finally(() => { pendingSnapshots.delete(page); }).catch(() => undefined);
  return pending;
}

/** Export only what the current screen actually knows, retaining the current filters. */
export function planScreenWorkbook(pageId: string, page: Pick<ActionPage, 'state' | 'renderVals'>, now = new Date()): ScreenWorkbookPlan {
  const values = page.renderVals();
  const sheets: ScreenWorkbookSheet[] = [];
  let name: string;
  if (pageId === 'qstar') {
    name = '품질5스타';
    const current = rows(values.estRows).map((row) => [values.estEntityName, row.name, row.max, numeric(row.value), row.rate, row.loss, row.source]);
    current.push([values.estEntityName, '합계', 100, numeric(values.estTotal), '', '', '현재 화면 집계']);
    sheets.push(sheet('현재 예상점수', ['법인', '평가항목', '배점', '점수', '달성률', '차감', '출처'], current, [24, 22, 12, 14, 14, 14, 44]));
    sheets.push(sheet('법인별 점수', ['법인', '업체코드', '합계', '입력 현황'], rows(values.estEntities).map((row) => [row.name, row.code, numeric(row.total), row.status]), [24, 16, 14, 30]));
    sheets.push(sheet('평가이력', ['연도', '법인', '업체코드', '입고불량', '필드클레임', '품질경영', '외주사관리', '현장평가', '합계', '등급'], rows(values.histRows).map((row) => [page.state.histYear, row.name, row.code, numeric(row.v1), numeric(row.v2), numeric(row.v3), numeric(row.v4), numeric(row.v5), numeric(row.total), row.grade])));
    const snapshots = rows(page.state.snapshots);
    if (snapshots.length) sheets.push(sheet('집계 저장 이력', ['저장 시각', '법인', '평가항목', '배점', '점수', '합계', '출처'], snapshots.flatMap((snapshot) => rows(snapshot.values).map((row) => [snapshot.at, snapshot.entityName || snapshot.entity, row.name, row.max, numeric(row.value), numeric(snapshot.total), row.source])), [28, 24, 22, 12, 14, 14, 44]));
  } else if (pageId === 'field-audit') {
    name = '품질5스타_현장평가';
    sheets.push(sheet('평가 결과', ['구분', '법인', '공장', '평가일', '평가원', '항목번호', '평가항목', '내용'], rows(values.resRows).map((row) => [row.kind, row.corp, row.plant, row.date, row.evaluator, row.no, row.item, row.text]), [12, 24, 24, 16, 30, 14, 40, 72]));
    sheets.push(sheet('선택 영역 평가기준', ['항목번호', '평가항목', '배점', '질문', '점검 기준'], rows(values.critItems).map((row) => [row.id, row.name, row.max, row.question, rows(row.points).map((point) => text(point.text)).join('\n')]), [14, 36, 12, 64, 90]));
  } else if (pageId === 'sq') {
    name = 'SQ평가';
    sheets.push(sheet('협력사 평가 현황', ['협력사', '업종', '평가일', '점수', '등급', '다음 평가', '평가원'], rows(values.rows).map((row) => [row.name, row.key || row.type, row.date, numeric(row.score), row.grade, row.next, row.evaluator])));
    sheets.push(sheet('대상 업종', ['제도', '순', '업종', '세부업종', '비고', '업종 비고', '세부업종 수'], rows(values.typeRows).flatMap((row) => rows(row.subs).map((sub) => [row.sys, row.no, row.name, sub.label, sub.note, row.note, row.count])), [18, 10, 20, 32, 52, 52, 14]));
  } else if (pageId === 'iatf') {
    name = 'IATF16949';
    sheets.push(sheet('심사이력', ['연도', '구분', '사업장', '심사일', 'MD', '인증기관', 'Major', 'Minor', 'OFI', '시정조치'], rows(values.rows).map((row) => [row.year, row.kind, row.site, row.dates, numeric(row.md), row.certificationBody, numeric(row.major), numeric(row.minor), numeric(row.ofi), row.actionStatus]), [12, 16, 32, 38, 10, 24, 10, 10, 10, 30]));
    sheets.push(sheet('인증 현황', ['법인', '사업장', '취득 여부', '인증서 번호', '비고'], rows(values.certRows).map((row) => [row.org, row.plant, row.has, row.no, row.note])));
  } else throw new Error('이 화면의 엑셀 내보내기는 지원하지 않습니다.');
  const records = rows(page.state.records);
  if (records.length) sheets.push(sheet('등록 내역', ['제목', '일자', '법인 · 공장', '점수', '내용', '첨부 파일 ID', '등록 시각'], records.map((row) => [row.title, row.date, row.entity, numeric(row.score), row.note, Array.isArray(row.documentIds) ? row.documentIds.join(', ') : '', row.createdAt]), [32, 16, 24, 12, 64, 50, 28]));
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return { filename: `AJIN_ON_${name}_${date}.xlsx`, sheets, rowCount: sheets.reduce((count, item) => count + Math.max(0, item.data.length - 1), 0) };
}

export async function buildScreenWorkbook(pageId: string, page: Pick<ActionPage, 'state' | 'renderVals'>): Promise<Blob> {
  return writeExcelFile(planScreenWorkbook(pageId, page).sheets, { fontFamily: '맑은 고딕', fontSize: 11 }).toBlob();
}
export async function downloadScreenWorkbook(pageId: string, page: Pick<ActionPage, 'state' | 'renderVals'>): Promise<{ filename: string; sheetCount: number; rowCount: number }> {
  const plan = planScreenWorkbook(pageId, page);
  const blob = await writeExcelFile(plan.sheets, { fontFamily: '맑은 고딕', fontSize: 11 }).toBlob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = plan.filename; document.body.appendChild(anchor);
  try { anchor.click(); }
  finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000); }
  return { filename: plan.filename, sheetCount: plan.sheets.length, rowCount: plan.rowCount };
}
