import {describe,expect,it} from 'vitest';
import {combinedEvaluationRows} from '../services/imported-evaluations';
import {mean,periodsOf,scoreGroups,summarize,longitudinal} from './report';
import seed from '../../../backend/src/main/resources/seed/eval-history.json';
import {signedHistoryRows} from './source';
import type {EvaluationExportSource} from '../services/export-workbook';

const original:EvaluationExportSource={state:{scope:'all'},ITEMS:{'2-1':'표준','2-10':'안전','3-1':'설비'},J:['b|i|d'],
  EVENTS:[{id:0,plant:'경산',date:'2026.06.26',y:2026,round:1,sort:'2026-06-26',items:{'2-1':1,'3-1':1,'2-10':1}}]};
describe('internal assessment reports',()=>{
  it('restores checklist order after a JSONB round trip before expanding positional judgments',()=>{
    expect(combinedEvaluationRows(original).map(x=>[x.itemCode,x.judgment])).toEqual([['2-1','보완'],['2-10','일부미흡'],['3-1','다수미흡']]);
  });
  it('includes reviewed rows once alongside the source and excludes other evaluation types',()=>{
    const [saved]=signedHistoryRows([{code:'3-1',item:'설비',grade:'양호',comment:'점검 기록을 확인함'}],{round:'2차',target:'경산',eval_date:'2026-11-01'},'test');
    const rows=combinedEvaluationRows({...original,state:{scope:'all',importedRows:[saved,{...saved,type:'SQ평가',plant:'협력사'}]}});
    expect(periodsOf(rows)).toEqual(['2026-2','2026-1']);
    const report=summarize(rows,'2026-2','2026-1');
    expect(report.current).toHaveLength(1);
    expect(report.plants[0]?.prior).toBe(3);
    expect(report.current[0]?.nonconformance).toBe('점검 기록을 확인함');
    expect(report.byGrade).toEqual([['양호',1]]);
  });
  it('reproduces the planning deck annual judged totals and its five-year item ranking from source rows',()=>{
    const rows=combinedEvaluationRows({...seed.referenceData,state:{scope:'all'}} as EvaluationExportSource);
    const trend=longitudinal(rows,2026);
    expect(trend.annual.map(y=>y.grades.reduce((n,g)=>n+g,0))).toEqual([1691,956,1162,664,288]);
    expect(trend.counts.slice(0,5).map(([item,n])=>[item.split(' ')[0],n])).toEqual([['1-4',268],['2-8',260],['2-4',255],['3-3',240],['2-1',236]]);
  });
  it('leaves missing comparisons empty and separates the groups of scored plants',()=>{
    expect(mean([])).toBeNull();expect(mean([undefined,0,2])).toBe(1);
    const groups=scoreGroups({A:{score:0},B:{career:10},C:{score:10},D:{score:7}});
    expect(groups.high.map(([plant])=>plant)).toEqual(['C']);expect(groups.low.map(([plant])=>plant)).toEqual(['A']);
    expect(summarize(combinedEvaluationRows(original),'2026-1','').plants[0]?.prior).toBeUndefined();
  });
});
