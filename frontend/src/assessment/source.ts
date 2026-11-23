import { request } from '../services/api';
import { loadPageState } from '../services/pageStore';
import { combinedEvaluationRows } from '../services/imported-evaluations';
import type { EvaluationExportRow, EvaluationExportSource } from '../services/export-workbook';
import type { EvaluationImportRow } from '../services/evaluation-import';

export async function loadAssessmentSource() {
  const [reference, snapshot] = await Promise.all([
    request<Omit<EvaluationExportSource, 'state'>>('/api/pages/eval-history/reference'),
    loadPageState('eval-history'),
  ]);
  if (!Array.isArray(reference.EVENTS) || !reference.ITEMS || !reference.J) throw new Error('평가이력 원본을 확인해 주세요.');
  return { rows: combinedEvaluationRows({ ...reference, state: { ...snapshot.state, scope: 'all' } }), items: reference.ITEMS, admin: snapshot.state.admin === true };
}

export const areas: Record<string, string> = {'1':'외주품관리','2':'공정관리','3':'생산/보전','4':'완제품관리','5':'품질역량'};
export type Criterion = {code: string; category: string; item: string; standard: string; points: number};
export async function loadInternalCriteria(items: Record<string, string>): Promise<Criterion[]> {
  const ref = await request<{CRIT: [string,string,number,string,string][]}>('/api/pages/field-audit/reference');
  return ref.CRIT.filter(([code]) => Object.hasOwn(items, code)).map(([code,,points,question,details]) => ({
    code, category: areas[code.split('-')[0]!] || '', item: items[code]!, standard: [question,...details.split('|')].join('\n'), points,
  }));
}
export function reportReference(row: EvaluationExportRow) {
  return {
    id: JSON.stringify([row.type,row.date,row.plant,row.managementNumber,row.item]),
    target: row.plant, eval_date: row.date.replaceAll('.','-'), code: row.itemCode,
    item: row.item.startsWith(row.itemCode + ' ') ? row.item.slice(row.itemCode.length+1) : row.item,
    grade: row.judgment, finding: row.nonconformance, comment: row.nonconformance,
    improvement: row.improvement, managementNumber: row.managementNumber, version: row.criteriaVersion || '', src: 'AJIN ON 평가이력',
  };
}

type Reviewed = {code: string; item: string; grade: string; comment: string; improvement?: string; actionStatus?: string};
export function signedHistoryRows(items: Reviewed[], meta: {round: string; target: string; eval_date: string}, id: string): EvaluationImportRow[] {
  const round = Number(meta.round.replace(/차$/, '').trim());
  if (!meta.target.trim() || !meta.eval_date || !Number.isInteger(round) || round < 1 || round > 10)
    throw new Error('공장명, 평가일자, 평가차수(1~10)를 입력해야 평가이력에 저장할 수 있습니다.');
  if (items.some(item => !item.grade || !item.comment.trim())) throw new Error('이력에 저장할 항목의 판정과 기재 문장을 확인해 주세요.');
  return items.map((item,index) => ({ type: '내부 현장평가', year: Number(meta.eval_date.slice(0,4)), date: meta.eval_date,
    round, plant: meta.target.trim(), managementNumber: 'EA-'+id+'-'+(index+1), item: item.code+' '+item.item,
    judgment: item.grade, nonconformance: item.comment, improvement: item.improvement??'', actionStatus: item.actionStatus??'' }));
}

type LibraryData = Record<string, unknown>;
type Entry = {name: string; revision: string|null; data: LibraryData|null};
export class AssistantLibrary {
  private entries = new Map<string,Entry>();
  async load() {
    const rows = await request<Entry[]>('/api/assessment/library');
    this.entries = new Map(rows.map(row=>[row.name,row]));
  }
  get(name: string) { return structuredClone(this.entries.get(name)?.data ?? null); }
  hist(key: string) {
    return [...this.entries.values()].filter(row=>row.name.startsWith('hist/') && row.data?.k===key)
      .map(row=>({ ...structuredClone(row.data), id: row.name.slice(5) }));
  }
  async change(values: Map<string,LibraryData|null>) {
    if (!values.size) return;
    const changes = [...values].map(([name,data])=>({name, data, revision:this.entries.get(name)?.revision ?? null}));
    const versions = await request<Record<string,string>>('/api/assessment/library',{method:'POST',body:JSON.stringify(changes)});
    for (const change of changes) {
      if (change.data===null) this.entries.delete(change.name);
      else this.entries.set(change.name,{...change,data:structuredClone(change.data),revision:versions[change.name]!});
    }
  }
  set(name:string,data:LibraryData){ return this.change(new Map([[name,data]])); }
  del(name:string){ return this.change(new Map([[name,null]])); }
}
