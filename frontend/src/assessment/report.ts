import type { EvaluationExportRow } from '../services/export-workbook';
import { areas } from './source';

export const periodKey = (row: Pick<EvaluationExportRow,'year'|'round'>) => row.year + '-' + row.round;
export function periodsOf(rows:EvaluationExportRow[]) {
  return [...new Set(rows.filter(r=>r.type==='내부 현장평가').map(periodKey))].sort((a,b)=>b.localeCompare(a,'en',{numeric:true}));
}
export const periodLabel = (key:string) => key ? key.split('-').join('년 ')+'차' : '비교 이력 없음';
export const fmt = (value:number) => value.toLocaleString('ko-KR',{maximumFractionDigits:2});
export const metricFields = [
  ['score','종합점수'],['site','현장평가 점수'],['practiceBonus','현장이행 가점'],['improvementBonus','개선활동 가점'],['career','PL 경력(년)'],['practice','현장 이행률(%)'],
  ...Object.entries(areas).map(([code,label])=>['area'+code,label+'(100점)']),
] as [string,string][];
export type Metrics = Record<string,Record<string,number>>;
export const mean = (values:(number|undefined)[]) => {
  const present = values.filter((x):x is number=>typeof x==='number' && Number.isFinite(x));
  return present.length ? present.reduce((sum,v)=>sum+v,0)/present.length : null;
};
export function scoreGroups(metrics:Metrics) {
  const entries = Object.entries(metrics).filter(([,row])=>Number.isFinite(row.score)).sort(([a,x],[b,y])=>y.score!-x.score! || a.localeCompare(b,'ko'));
  const n = Math.min(5, Math.floor(entries.length/2));
  return {entries, n, high:entries.slice(0,n), low:n ? entries.slice(-n) : []};
}
export function countBy(rows:EvaluationExportRow[],field:(row:EvaluationExportRow)=>string) {
  const counts = new Map<string,number>();
  for (const row of rows) {
    const key = field(row);
    counts.set(key,(counts.get(key) || 0)+1);
  }
  return [...counts].sort(([a,x],[b,y])=>y-x || a.localeCompare(b,'ko',{numeric:true}));
}
export const areaOf = (row:EvaluationExportRow) => areas[row.itemCode.split(/[._-]/)[0]!] || '기타 항목';
export function summarize(rows:EvaluationExportRow[],period:string,prior:string) {
  const current = rows.filter(r=>r.type==='내부 현장평가' && periodKey(r)===period);
  const previous = rows.filter(r=>r.type==='내부 현장평가' && periodKey(r)===prior);
  const plantCounts = countBy(current,r=>r.plant);
  const byArea = countBy(current,areaOf), byGrade = countBy(current,r=>r.judgment);
  const oldPlants = new Map(countBy(previous,r=>r.plant));
  const plants = plantCounts.map(([plant,count])=>{
    const records=current.filter(r=>r.plant===plant);
    return {plant,count,prior:oldPlants.get(plant),grades:new Map(countBy(records,r=>r.judgment))};
  });
  const top = countBy(current,r=>r.item)[0];
  const facts = current.length ? [
    periodLabel(period)+'에 '+plants.length+'개 공장에서 평가이력 '+fmt(current.length)+'건이 기록되었습니다.',
    '가장 많이 기록된 항목은 '+top![0]+'이며 '+fmt(top![1])+'건입니다.',
    byArea[0]![0]+' 영역이 '+fmt(byArea[0]![1])+'건으로 전체 기록의 '+fmt(100*byArea[0]![1]/current.length)+'%를 차지합니다.',
  ] : [];
  if (previous.length) facts.push(periodLabel(prior)+'의 기록은 '+fmt(previous.length)+'건이며 이번 차수는 '+fmt(current.length)+'건입니다.');
  return {current,previous,plants,byGrade,byArea,facts};
}

export const findingGrades=['보완','일부미흡','다수미흡'];
export function longitudinal(rows:EvaluationExportRow[],endYear:number) {
  const years=Array.from({length:5},(_,i)=>endYear-4+i);
  const window=rows.filter(row=>row.type==='내부 현장평가' && years.includes(row.year));
  const annual=years.map(year=>{
    const data=window.filter(row=>row.year===year);
    return {year,grades:findingGrades.map(g=>data.filter(r=>r.judgment===g).length),missing:data.filter(r=>r.judgment==='미기재').length};
  });
  // The planning deck counts missing-judgment rows in its item-frequency table, but not the judgment bars.
  const counts=countBy(window,r=>r.item);
  const cells=new Map<string,number>();
  for(const row of window){
    const key=JSON.stringify([row.plant,row.item]);
    cells.set(key,(cells.get(key)??0)+1);
  }
  return {annual,counts,cells,plants:[...new Set(window.map(r=>r.plant))].sort((a,b)=>a.localeCompare(b,'ko'))};
}

export type RoundPlan={plants:string[];kind:string};
export function roundPlans(state:Record<string,unknown>) {
  const names:Record<string,string>={hq:'본사',gyeongsan:'경산',gueo:'구어',ipsil:'입실',juntek:'준텍',geoncheon:'건천',mohwa:'모화',ajajin:'AJ아진',wooshin:'우신',ajinelec:'아진전자부품',ajinusa:'아진USA',wooshinusa:'우신USA',jungeorgia:'준조지아'};
  const plans:Record<string,RoundPlan>={};
  for(const [i,key] of ['first','second'].entries()){
    const dates=(state.dates as Record<string,Record<string,string>>|undefined)?.[key];
    const order=(state.order as Record<string,string[]>|undefined)?.[key];
    if(!dates||!Array.isArray(order)||!order.length)continue;
    const years=new Set(Object.values(dates).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date)).map(date=>date.slice(0,4)));
    if(years.size===1)plans[[...years][0]+'-'+(i+1)]={plants:order.map(id=>names[id]??id),kind:(state.roundKind as Record<string,string>|undefined)?.[key]??''};
  }
  return plans;
}
