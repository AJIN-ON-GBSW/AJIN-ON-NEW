import { readSheet } from 'read-excel-file/universal';
import { ApiError, request } from './api';
import type { PageSnapshot } from './pageStore';

export const EVALUATION_HEADERS = ['평가 종류', '연도', '점검일', '차수', '공장', '관리번호', '평가항목', '판정', '부적합 사항', '개선대책', '조치 상태'] as const;
export const EVALUATION_FIELDS = ['type', 'year', 'date', 'round', 'plant', 'managementNumber', 'item', 'judgment', 'nonconformance', 'improvement', 'actionStatus'] as const;
export const EVALUATION_TYPES = ['내부 현장평가', '품질5스타', 'SQ평가', 'IATF 16949'] as const;
export const EVALUATION_JUDGMENTS = ['보완', '일부미흡', '다수미흡', '양호', '미기재', 'Major', 'Minor', 'OFI'] as const;
export interface EvaluationImportRow {
  type: string; year: number; date: string; round: number; plant: string; managementNumber: string;
  item: string; judgment: string; nonconformance: string; improvement: string; actionStatus: string;
}
export interface ImportIssue { row: number; field: string; message: string }
export interface ParsedEvaluationImport {
  rows: EvaluationImportRow[];
  rowNumbers: number[];
  preview: Array<{ row: number; values: string[] }>;
  rowCount: number;
  errors: ImportIssue[];
}
export interface EvaluationImportResult { imported: number; skipped: number; snapshot: PageSnapshot }
export class EvaluationImportValidationError extends Error {
  constructor(readonly errors: ImportIssue[]) {
    super('엑셀 입력값을 확인해 주세요. 오류가 있는 행은 등록하지 않습니다.');
    this.name = 'EvaluationImportValidationError';
  }
}
const empty = (value: unknown) => value === null || value === undefined || typeof value === 'string' && value.trim() === '';
const show = (value: unknown) => value instanceof Date ? Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : '올바르지 않은 날짜' : value === null || value === undefined ? '' : String(value);
const fieldLabel = (field: string) => EVALUATION_HEADERS[EVALUATION_FIELDS.indexOf(field as typeof EVALUATION_FIELDS[number])] ?? ({ headers: '열 이름', columns: '열', rows: '등록 데이터', row: '행' } as Record<string, string>)[field] ?? field;

function dateValue(value: unknown): string {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : '';
  const input = typeof value === 'string' ? value.trim() : '';
  const found = input.match(/^(\d{4})([-./])(\d{1,2})\2(\d{1,2})$/);
  return found ? `${found[1]}-${found[3]!.padStart(2, '0')}-${found[4]!.padStart(2, '0')}` : input;
}
function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function textValue(value: unknown, field: string, row: number, maximum: number, required: boolean, errors: ImportIssue[]) {
  if (value !== null && value !== undefined && typeof value !== 'string' && typeof value !== 'number') {
    errors.push({ row, field, message: `${fieldLabel(field)}은 문자로 입력해 주세요.` });
    return '';
  }
  const normalized = empty(value) ? '' : String(value).trim();
  if (required && !normalized) errors.push({ row, field, message: '필수 항목입니다.' });
  if (normalized.length > maximum) errors.push({ row, field, message: `${maximum}자 이하로 입력해 주세요.` });
  if (normalized.includes('\0')) errors.push({ row, field, message: '사용할 수 없는 문자가 포함되어 있습니다.' });
  return normalized;
}
function integerValue(value: unknown, field: 'year' | 'round', row: number, minimum: number, maximum: number, errors: ImportIssue[]) {
  const text = typeof value === 'string' ? value.trim() : value;
  const normalized = field === 'round' && typeof text === 'string' ? text.replace(/^(\d+)차$/, '$1') : text;
  const number = typeof normalized === 'number' ? normalized : typeof normalized === 'string' && /^\d+$/.test(normalized) ? Number(normalized) : NaN;
  if (!Number.isInteger(number) || number < minimum || number > maximum) errors.push({ row, field, message: `${minimum}~${maximum} 범위의 정수를 입력해 주세요.` });
  return number;
}

/** The first row is the exact downloadable template. Blank rows retain their original Excel row numbers. */
export function parseEvaluationData(data: readonly (readonly unknown[])[]): ParsedEvaluationImport {
  const errors: ImportIssue[] = [];
  const header = [...(data[0] ?? [])];
  while (header.length && empty(header[header.length - 1])) header.pop();
  if (header.length !== EVALUATION_HEADERS.length) errors.push({ row: 1, field: 'headers', message: '입력 양식의 열 11개를 순서대로 사용해 주세요.' });
  EVALUATION_HEADERS.forEach((label, index) => {
    if (show(header[index]).trim() !== label) errors.push({ row: 1, field: 'headers', message: `${index + 1}번째 열 이름은 “${label}”이어야 합니다.` });
  });
  const populated = data.slice(1).map((values, index) => ({ values, row: index + 2 })).filter(({ values }) => !values.every(empty));
  const result: ParsedEvaluationImport = {
    rows: [], rowNumbers: [], rowCount: populated.length, errors,
    preview: populated.slice(0, 10).map(({ row, values }) => ({ row, values: EVALUATION_HEADERS.map((_header, index) => show(values[index])) })),
  };
  if (!populated.length) errors.push({ row: 2, field: 'rows', message: '등록할 데이터가 없습니다. 제목 행 아래에 평가 내용을 입력해 주세요.' });
  if (populated.length > 1000) errors.push({ row: 1002, field: 'rows', message: '한 번에 1000개 행까지 등록할 수 있습니다.' });
  if (errors.some((error) => error.row === 1) || populated.length > 1000) return result;
  for (const { values, row } of populated) {
    if (values.slice(11).some((value) => !empty(value))) errors.push({ row, field: 'columns', message: '입력 양식에 없는 추가 열 값이 있습니다.' });
    const type = textValue(values[0], 'type', row, 30, true, errors);
    const year = integerValue(values[1], 'year', row, 2000, 2100, errors);
    const date = dateValue(values[2]);
    if (!validDate(date)) errors.push({ row, field: 'date', message: '점검일은 실제 날짜를 YYYY-MM-DD로 입력해 주세요.' });
    const round = integerValue(values[3], 'round', row, 1, 10, errors);
    const plant = textValue(values[4], 'plant', row, 150, true, errors);
    const managementNumber = textValue(values[5], 'managementNumber', row, 100, true, errors);
    const item = textValue(values[6], 'item', row, 300, true, errors);
    const judgment = textValue(values[7], 'judgment', row, 30, true, errors);
    const nonconformance = textValue(values[8], 'nonconformance', row, 20_000, false, errors);
    const improvement = textValue(values[9], 'improvement', row, 20_000, false, errors);
    const actionStatus = textValue(values[10], 'actionStatus', row, 100, false, errors);
    if (!(EVALUATION_TYPES as readonly string[]).includes(type)) errors.push({ row, field: 'type', message: `평가 종류: ${EVALUATION_TYPES.join(', ')}` });
    if (!(EVALUATION_JUDGMENTS as readonly string[]).includes(judgment)) errors.push({ row, field: 'judgment', message: `판정: ${EVALUATION_JUDGMENTS.join(', ')}` });
    result.rows.push({ type, year, date, round, plant, managementNumber, item, judgment, nonconformance, improvement, actionStatus });
    result.rowNumbers.push(row);
  }
  if (new TextEncoder().encode(JSON.stringify(result.rows)).length > 1024 * 1024) errors.push({ row: 1, field: 'rows', message: '한 번에 등록하는 데이터는 1MB 이하여야 합니다. 파일을 나누어 등록해 주세요.' });
  return result;
}

export async function parseEvaluationWorkbook(file: File | Blob | ArrayBuffer): Promise<ParsedEvaluationImport> {
  if (typeof File !== 'undefined' && file instanceof File && !/\.xlsx$/i.test(file.name)) throw new Error('입력 양식에 맞는 .xlsx 파일을 선택해 주세요.');
  try { return parseEvaluationData(await readSheet(file, 1)); }
  catch (error) {
    if (error instanceof EvaluationImportValidationError) throw error;
    throw new Error('엑셀 파일을 읽지 못했습니다. 암호가 없는 .xlsx 파일인지 확인해 주세요.');
  }
}

export async function importEvaluations(rows: readonly EvaluationImportRow[]): Promise<EvaluationImportResult> {
  const checked = parseEvaluationData([EVALUATION_HEADERS, ...rows.map((row) => EVALUATION_FIELDS.map((field) => row[field]))]);
  if (checked.errors.length) throw new EvaluationImportValidationError(checked.errors);
  return request<EvaluationImportResult>('/api/evaluations/import', { method: 'POST', body: JSON.stringify({ rows: checked.rows }) });
}

export function evaluationImportIssues(error: unknown, originalRows?: readonly number[]): ImportIssue[] {
  if (error instanceof EvaluationImportValidationError) return error.errors;
  if (!(error instanceof ApiError) || !Array.isArray(error.details.errors)) return [];
  return error.details.errors.flatMap((value: unknown) => {
    if (!value || typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    if (typeof item.row !== 'number' || typeof item.field !== 'string' || typeof item.message !== 'string') return [];
    return [{ row: originalRows?.[item.row - 2] ?? item.row, field: item.field, message: item.message }];
  });
}
export function evaluationFieldLabel(field: string) { return fieldLabel(field); }
