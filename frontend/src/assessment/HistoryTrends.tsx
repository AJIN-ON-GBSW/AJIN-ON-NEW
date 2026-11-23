import {useMemo} from 'react';
import type {EvaluationExportRow} from '../services/export-workbook';
import {findingGrades,fmt,longitudinal} from './report';
export default function HistoryTrends({rows,year}:{rows:EvaluationExportRow[];year:number}){
  const {annual,counts,cells,plants}=useMemo(()=>longitudinal(rows,year),[rows,year]);
  const peak=Math.max(1,...annual.map(a=>a.grades.reduce((a,b)=>a+b,0)));
  const maxCell=Math.max(1,...cells.values());
  return <section className="report-panel trend-panel"><div className="panel-heading"><h2>5개년 지적 추이</h2><span>{year-4}–{year}년</span></div>
    <div className="trend-columns"><div><h3>연도별 판정 건수</h3><div className="trend-legend">{findingGrades.map((g,i)=><span key={g}><i className={'grade-'+i}/>{g}</span>)}</div>
    {annual.map(a=><div className="annual-row" key={a.year}><span>{a.year}</span><div>{a.grades.map((n,i)=><i key={i} className={'grade-'+i} style={{width:100*n/peak+'%'}} title={findingGrades[i]+' '+fmt(n)+'건'}/>)}</div><b>{fmt(a.grades.reduce((x,y)=>x+y,0))}건</b></div>)}
    <p className="report-note">보완·일부미흡·다수미흡을 집계합니다.</p></div>
    <div><h3>많이 기록된 평가항목 TOP 5</h3><ol className="top-items">{counts.slice(0,5).map(([item,n])=><li key={item}><span>{item}</span><b>{fmt(n)}건</b></li>)}</ol>
      <p className="report-note">판정과 관계없이 해당 평가항목으로 기록된 모든 행을 집계합니다.</p></div></div>
    <details><summary>공장 × 평가항목 히트맵</summary><div className="report-scroll"><table><thead><tr><th>공장</th>{counts.map(([item])=><th key={item} title={item}>{item}</th>)}</tr></thead><tbody>{plants.map(plant=><tr key={plant}><th>{plant}</th>{counts.map(([item])=>{const n=cells.get(JSON.stringify([plant,item]))??0;return <td key={item} style={{backgroundColor:'rgba(77,137,198,'+(n/maxCell*.55)+')'}}>{n}</td>;})}</tr>)}</tbody></table></div></details>
  </section>;
}
