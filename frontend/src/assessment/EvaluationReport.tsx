import {useEffect,useMemo,useRef,useState} from 'react';
import type {EvaluationExportRow} from '../services/export-workbook';
import {aiStatus,generateJson} from './ai';
import {AssistantLibrary,areas,loadAssessmentSource} from './source';
import {fmt,mean,periodLabel,periodsOf,scoreGroups,summarize,type Metrics} from './report';
import ScoreEditor from './ScoreEditor';
import HistoryTrends from './HistoryTrends';
import {publishedScores,publishedFactors,publishedAreas} from './published-report';
import {loadPageState} from '../services/pageStore';
import {roundPlans,type RoundPlan} from './report';
import './report.css';

const display = (n:number|null|undefined,unit='')=>n==null?'—':fmt(n)+unit;
const delta = (a:number|undefined,b:number|undefined)=>a==null||b==null?'—':(a>b?'+':'')+fmt(a-b);
function Bars({values,unit='건'}:{values:[string,number|null][];unit?:string}) {
  const max=Math.max(1,...values.map(([,n])=>n??0));
  return <div className="report-bars">{values.map(([label,n])=><div className="report-bar" key={label}><span>{label}</span><div><i style={{width:((n??0)/max*100)+'%'}}/></div><b>{display(n,unit)}</b></div>)}</div>;
}
function ReportBody({rows,library,model,admin,plans}:{plans:Record<string,RoundPlan>;admin:boolean;rows:EvaluationExportRow[];library:AssistantLibrary;model:string}) {
  const actualPeriods=useMemo(()=>periodsOf(rows),[rows]);
  const periods=useMemo(()=>[...new Set([...actualPeriods,...Object.keys(plans)])].sort((a,b)=>b.localeCompare(a,'en',{numeric:true})),[actualPeriods,plans]);
  const [period,setPeriod]=useState(actualPeriods[0]??periods[0]??'');
  const prior=periods.slice(periods.indexOf(period)+1).find(key=>actualPeriods.includes(key))??'';
  const data=useMemo(()=>summarize(rows,period,prior),[rows,period,prior]);
  const scores = (key:string)=>(library.get('metrics/'+key)?.plants ?? publishedScores[key] ?? {}) as Metrics;
  const published = period==='2026-1' && !library.get('metrics/'+period);
  const scorePrior = periods.slice(periods.indexOf(period)+1).find(key=>scoreGroups(scores(key)).entries.length)??'';
  const [metrics,setMetrics]=useState(()=>scores(period));
  const previousMetrics=scores(scorePrior);
  const groups=scoreGroups(metrics);
  const [mode,setMode]=useState<'history'|'score'>(()=>groups.entries.length?'score':'history');
  const [editing,setEditing]=useState(false),[plant,setPlant]=useState(''),[query,setQuery]=useState(''),[limit,setLimit]=useState(30),[details,setDetails]=useState(false);
  const [analysis,setAnalysis]=useState<{fact:string;question:string}[]>([]),[analysisError,setAnalysisError]=useState(''),[working,setWorking]=useState(false);
  const pending=useRef<AbortController|null>(null);
  const source=useRef<HTMLDetailsElement>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);
  const stopAnalysis=()=>{pending.current?.abort();pending.current=null;setWorking(false);setAnalysis([]);setAnalysisError('');};
  function changePeriod(key:string){
    const next=scores(key);setPeriod(key);setMetrics(next);setMode(scoreGroups(next).entries.length?'score':'history');
    setPlant('');setQuery('');setLimit(30);setDetails(false);stopAnalysis();
  }
  function drill(plantName:string){
    setPlant(plantName);setQuery('');setLimit(30);setDetails(true);
    requestAnimationFrame(()=>source.current?.scrollIntoView({behavior:'smooth',block:'start'}));
  }
  const scoreMode=mode==='score';
  const factor = (key:string):[number|null,number|null]=>published && publishedFactors[key] ? publishedFactors[key]!
    : [mean(groups.high.map(([,row])=>row[key])),mean(groups.low.map(([,row])=>row[key]))];
  const plan=plans[period];
  const complete=plan?.plants.filter(name=>data.plants.some(p=>p.plant===name)).length;
  const facts=[...data.facts];
  if (scoreMode && groups.entries.length) {
    const [name,row]=groups.entries[0]!;
    facts.push('종합점수가 입력된 '+groups.entries.length+'개 공장의 최고점은 '+name+' '+fmt(row.score!)+'점입니다.');
    for(const [key,label,unit] of [['career','PL 경력','년'],['practice','현장 이행률','%']] as const){
      const [high,low]=factor(key);
      if(high!==null && low!==null) facts.push('종합점수 상위 '+groups.n+'곳과 하위 '+groups.n+'곳 중 입력된 '+label+' 평균은 각각 '+fmt(high)+unit+', '+fmt(low)+unit+'입니다.');
    }
  }
  async function analyze(){
    stopAnalysis();
    const controller=new AbortController();pending.current=controller;setWorking(true);
    try {
      const prompt='다음 집계에서 평가원이 우선 검토할 사실을 최대 3개 선택하고 각각 현장 확인 질문 한 문장을 적으세요. 원인을 단정하거나 없는 수치를 쓰지 마세요. JSON {"items":[{"id":1,"question":"...?"}]} 형식입니다. 자료 '+JSON.stringify(facts.map((fact,i)=>({id:i+1,fact})));
      const result=await generateJson('report',prompt,controller.signal);
      if(controller.signal.aborted)return;
      if(!Array.isArray(result.items))throw new Error('AI 총평 형식을 읽지 못했습니다.');
      const seen=new Set<number>();
      const insights=result.items.flatMap(item=>{
        if(!item || !Number.isInteger(item.id)||!facts[item.id-1]||seen.has(item.id)||typeof item.question!=='string'||!item.question.trim())return [];
        seen.add(item.id);return [{fact:facts[item.id-1]!,question:item.question.slice(0,350)}];
      }).slice(0,3);
      if(!insights.length)throw new Error('현재 집계와 연결된 AI 답변을 확인할 수 없습니다.');
      setAnalysis(insights);
    } catch(e){if(!controller.signal.aborted)setAnalysisError(e instanceof Error?e.message:'AI 분석에 실패했습니다.');}
    finally{if(pending.current===controller)setWorking(false);}
  }
  const visiblePlants = [...data.plants];
  if (scoreMode) for (const name of new Set([...Object.keys(metrics),...(plan?.plants??[])])) {
    if (!visiblePlants.some(p=>p.plant===name)) visiblePlants.push({plant:name,count:0,prior:undefined,grades:new Map()});
  }
  const detailRows=data.current.filter(row=>(!plant || row.plant===plant) && (!query || [row.managementNumber,row.item,row.judgment,row.nonconformance,row.improvement].join(' ').includes(query)));
  const gradeColumns=[...new Set(['보완','일부미흡','다수미흡',...data.byGrade.map(([label])=>label)])];
  return <>
    <div className="report-nav"><div><a className="report-brand" href="/"><b>AJ</b> AJIN ON</a><span>내부 현장평가</span><a href="/eval-history">평가이력</a><strong>결과보고</strong><a className="right" href="/assistant/">평가 작성 도우미 ↗</a></div></div>
    <main className="eval-report">
      <div className="report-heading"><div><p>품질경영체제 · 내부 현장평가</p><h1>내부 현장평가 결과보고</h1></div>
        <div className="report-controls"><label>평가 차수 <select value={period} onChange={e=>changePeriod(e.target.value)}>{periods.map(key=><option key={key} value={key}>{periodLabel(key)}</option>)}</select></label>
        <button onClick={()=>window.print()}>인쇄</button></div></div>
      {!period ? <p>등록된 내부 현장평가 이력이 없습니다. <a href="/eval-history">평가이력 등록</a></p> : <>
      <section className="report-strip" aria-label="차수 요약">
        <div><span>평가 차수</span><strong>{periodLabel(period)}</strong></div><div><span>이력 등록 공장</span><strong>{data.plants.length}<small>곳</small></strong></div>
        <div><span>평가이력</span><strong>{fmt(data.current.length)}<small>건</small></strong></div><div><span>비교 차수</span><strong>{periodLabel(scoreMode?scorePrior:prior)}</strong></div>
      </section>
      {plan&&<p className="report-progress">{plan.kind} 평가 결과 등록률 <b>{complete} / {plan.plants.length}개 공장 · {fmt(100*(complete??0)/plan.plants.length)}%</b></p>}
      <div className="report-toolbar"><div className="report-switch" aria-label="결과 보기">
        {(['history','score'] as const).map(key=><button key={key} aria-pressed={mode===key} onClick={()=>{setMode(key);stopAnalysis();}}>{key==='history'?'평가이력 분석':'평가점수 분석'}</button>)}</div>
        {admin&&<button onClick={()=>setEditing(true)}>점수 자료 입력</button>}</div>
      <div className="report-grid"><section className="report-panel"><div className="panel-heading"><h2>공장별 평가 결과</h2><span>{scoreMode?'종합점수 기준':'기록 건수 기준'}</span></div>
        <div className="report-scroll"><table><thead><tr><th>공장</th>{(scoreMode?['순위','비교 종합점수','종합점수','증감','현장평가','현장이행 가점','개선활동 가점']:['직전 이력','이번 이력','증감',...gradeColumns]).map(c=><th key={c}>{c}</th>)}</tr></thead>
        <tbody>{visiblePlants.sort((a,b)=>scoreMode?(metrics[b.plant]?.score??-Infinity)-(metrics[a.plant]?.score??-Infinity):b.count-a.count).map(p=>{
          const row=metrics[p.plant],prev=previousMetrics[p.plant];
          return <tr key={p.plant}><th><button className="plant-link" onClick={()=>drill(p.plant)}>{p.plant}</button></th>{scoreMode?<><td>{row?.score==null?"—":1+groups.entries.filter(([,r])=>r.score!>row.score!).length}</td><td>{display(prev?.score)}</td><td className="strong">{display(row?.score)}</td><td>{delta(row?.score,prev?.score)}</td><td>{display(row?.site)}</td><td>{display(row?.practiceBonus)}</td><td>{display(row?.improvementBonus)}</td></>:<><td>{display(p.prior)}</td><td className="strong">{fmt(p.count)}</td><td>{delta(p.count,p.prior)}</td>{gradeColumns.map(g=><td key={g}>{p.grades.get(g)??0}</td>)}</>}</tr>;
        })}</tbody></table></div>
        <p className="report-note">{scoreMode?(publishedScores[period]&&!library.get('metrics/'+period)?'출처 · 품질경영팀 기획서 23쪽 수록 내부 현장평가 결과보고.':'등록한 공장별 평가점수입니다. 빈 값은 —로 표시합니다.'):'평가이력의 행 수를 집계했습니다. 공장명을 누르면 해당 기록을 확인할 수 있습니다.'}</p>
      </section>
      <section className="report-panel"><div className="panel-heading"><h2>주요 요인 분석</h2></div>
        {scoreMode?<>{([['career','PL 경력','년'],['practice','현장 이행률','%']] as const).map(([key,label,unit])=><div className="report-factor" key={key}><h3>{label}</h3>{groups.n?<Bars values={[[`상위 ${groups.n}곳`,factor(key)[0]],[`하위 ${groups.n}곳`,factor(key)[1]]]} unit={unit}/>:<p>종합점수를 2개 공장 이상 입력하면 비교할 수 있습니다.</p>}</div>)}</>:
        <><div className="report-factor"><h3>판정별 기록</h3><Bars values={data.byGrade}/></div><div className="report-factor"><h3>차수별 기록</h3><Bars values={[[periodLabel(period),data.current.length],[periodLabel(prior),prior?data.previous.length:null]]}/></div></>}
      </section>
      <section className="report-panel"><div className="panel-heading"><h2>평가 항목별 분석</h2><span>{scoreMode?'백분율 환산 점수':'영역별 기록 건수'}</span></div>
      {scoreMode?<div className="report-scroll"><table><thead><tr><th>평가영역</th><th>공장 평균</th><th>상위 − 하위</th></tr></thead><tbody>{Object.entries(areas).map(([key,name])=>{
        const base=published?publishedAreas[key]:null;
        const field='area'+key,hi=mean(groups.high.map(([,v])=>v[field])),lo=mean(groups.low.map(([,v])=>v[field]));
        return <tr key={key}><th>{name}</th><td>{display(base?.[0]??mean(Object.values(metrics).map(v=>v[field])),'점')}</td><td>{display(base?.[1]??(hi===null||lo===null?null:hi-lo),'점')}</td></tr>;
      })}</tbody></table></div>:<Bars values={data.byArea}/>}</section>
      <section className="report-panel"><div className="panel-heading"><h2>종합 의견</h2><button disabled={!model||working} onClick={analyze}>{working?'AI 분석 중…':'AI 분석'}</button></div>
        {analysis.length?<ol className="report-insights">{analysis.map(a=><li key={a.fact}><b>{a.fact}</b><span>{a.question}</span></li>)}</ol>:<ul className="report-insights">{(scoreMode?facts.slice(3).concat(facts.slice(0,1)):facts.slice(0,3)).map(f=><li key={f}>{f}</li>)}</ul>}
        <p className="report-note">{analysis.length?'AI 검토 질문 · '+model:model?'집계 요약 · '+model+'로 추가 분석 가능':'집계 요약 · 로컬 AI 미연결'}</p>
        {analysisError&&<p role="alert">{analysisError}</p>}
      </section></div>
      {published&&scoreMode&&<p className="report-note">2026년 1차 불시평가와 2025년 2차 불시평가를 비교합니다. PL 경력·현장 이행률과 영역 점수는 보고서에 기재된 집계값입니다.</p>}
      <HistoryTrends rows={rows} year={Number(period.split('-')[0])}/>
      <details open={details} className="report-panel report-evidence" ref={source} onToggle={e=>setDetails(e.currentTarget.open)}><summary>근거 평가이력 <span>{fmt(data.current.length)}건</span></summary>
        <div className="evidence-filters"><select aria-label="근거 공장" value={plant} onChange={e=>{setPlant(e.target.value);setLimit(30);}}><option value="">전체 공장</option>{visiblePlants.map(p=><option key={p.plant}>{p.plant}</option>)}</select>
        <input aria-label="근거 이력 검색" placeholder="관리번호, 평가항목, 지적 내용 검색" value={query} onChange={e=>{setQuery(e.target.value);setLimit(30);}}/></div>
        {plant&&<section className="plant-report"><h3>{plant} · {periodLabel(period)} 공장 결과보고</h3>
          <p>평가항목 {new Set(data.current.filter(r=>r.plant===plant).map(r=>r.item)).size}개 · 종합점수 {display(metrics[plant]?.score,'점')}</p>
          <details><summary>차수별 평점 추이 · 전체 공장 평균</summary><div className="report-scroll"><table><thead><tr><th>평가 차수</th><th>{plant}</th><th>입력 공장 평균</th></tr></thead><tbody>{periods.slice(periods.indexOf(period)).filter(k=>scores(k)[plant]?.score!=null).reverse().map(k=><tr key={k}><th>{periodLabel(k)}</th><td>{display(scores(k)[plant]?.score)}</td><td>{display(mean(Object.values(scores(k)).map(v=>v.score)))}</td></tr>)}</tbody></table></div></details></section>}
        <div className="report-scroll"><table><thead><tr>{['점검일','공장','평가원','심사구분','관리번호','평가항목','판정','부적합 사항','개선대책','조치 상태'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{detailRows.slice(0,limit).map((r,i)=><tr key={i}><td>{r.date}</td><td>{r.plant}</td><td>{r.evaluator||'—'}</td><td>{r.auditType||'—'}</td><td>{r.managementNumber}</td><td>{r.item}</td><td>{r.judgment}</td><td>{r.nonconformance||'원문 미등록'}</td><td>{r.improvement||'—'}</td><td>{r.actionStatus||'—'}</td></tr>)}</tbody></table></div>
        {!detailRows.length&&<p>조건에 맞는 이력이 없습니다.</p>}{detailRows.length>limit&&<button onClick={()=>setLimit(limit+50)}>더 보기 ({limit} / {fmt(detailRows.length)})</button>}
      </details></>}
    </main>
    {editing&&<div className="score-backdrop"><ScoreEditor period={period} plants={[...new Set([...data.plants.map(p=>p.plant),...(plan?.plants??[])])]} initial={metrics} library={library} onClose={()=>setEditing(false)} onSave={values=>{setMetrics(values);setEditing(false);setMode('score');stopAnalysis();}}/></div>}
  </>;
}
export default function EvaluationReport(){
  const [value,setValue]=useState<{plans:Record<string,RoundPlan>;admin:boolean;rows:EvaluationExportRow[];library:AssistantLibrary;model:string}|null>(null);
  const [error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;const library=new AssistantLibrary();
    document.title='AJIN ON · 내부 현장평가 결과보고';
    Promise.all([loadAssessmentSource(),library.load(),aiStatus().catch(()=>({available:false,model:''})),loadPageState('internal')])
      .then(([data,,ai,internal])=>{if(active)setValue({plans:roundPlans(internal.state),admin:data.admin,rows:data.rows,library,model:ai.available?ai.model:''});})
      .catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[retry]);
  if(!value)return <main className="eval-report">{error?<><h1>결과보고를 불러오지 못했습니다</h1><p role="alert">{error}</p><button onClick={()=>{setError('');setRetry(retry+1);}}>다시 시도</button> <a href="/eval-history">평가이력으로</a></>:<p role="status">평가이력을 집계하고 있습니다.</p>}</main>;
  return <ReportBody {...value}/>;
}
