import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
const Screens={Main:React.lazy(()=>import('./pages/Main.jsx')),Qstar:React.lazy(()=>import('./pages/Qstar.jsx')),Performance:React.lazy(()=>import('./pages/Performance.jsx')),FieldAudit:React.lazy(()=>import('./pages/FieldAudit.jsx')),Internal:React.lazy(()=>import('./pages/Internal.jsx')),EvalHistory:React.lazy(()=>import('./pages/EvalHistory.jsx')),SQ:React.lazy(()=>import('./pages/SQ.jsx')),IATF:React.lazy(()=>import('./pages/IATF.jsx'))};
import {ServiceContext} from './runtime/PageComponent.jsx';
import ServiceTools,{SaveIndicator,type ServiceToolsProps,type RegistrationRecord} from './components/ServiceTools';
import EvaluationImport from './components/EvaluationImport';
import EvaluationDetail from './components/EvaluationDetail';
import type {SaveStatus} from './services/pageStore';
const names=['Main','Qstar','Performance','FieldAudit','Internal','EvalHistory','SQ','IATF'] as const;
const paths=['main','qstar','performance','field-audit','internal','eval-history','sq','iatf'];
const titles=['홈','품질5스타','실적 관리','품질5스타 현장평가','내부 현장평가','평가 이력','SQ평가','IATF 16949'];
function current(){const p=location.pathname.split('/').filter(Boolean)[0]||'main';let i=paths.indexOf(p);if(i<0)i=names.findIndex(n=>n===p.replace('.dc.html',''));if(i<0&&names.includes(location.hash.slice(1) as typeof names[number]))i=names.indexOf(location.hash.slice(1) as typeof names[number]);return i<0?0:i;}
class ScreenBoundary extends React.Component<{children:React.ReactNode;reset:number},{error:string}>{state={error:''};static getDerivedStateFromError(e:Error){return{error:e.message};}componentDidUpdate(p:{reset:number}){if(p.reset!==this.props.reset&&this.state.error)this.setState({error:''});}render(){return this.state.error?<main className="screen-error"><h1>화면을 불러오지 못했습니다.</h1><p>{this.state.error}</p><button onClick={()=>location.reload()}>다시 불러오기</button></main>:this.props.children;}}
export default function App(){
 const[index,setIndex]=useState(current),[status,setStatus]=useState<SaveStatus|null>(null),[tool,setTool]=useState<Omit<ServiceToolsProps,'onClose'|'onRegistered'|'onNavigate'>|null>(null),[toast,setToast]=useState(''),[records,setRecords]=useState<RegistrationRecord[]>([]),[hydrated,setHydrated]=useState(false);
 const [importOpen,setImportOpen]=useState(false);
 const page=useRef<any>(null);const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const notify=useCallback((s:string)=>{setToast(s);clearTimeout(timer.current);timer.current=setTimeout(()=>setToast(''),5000);},[]);
 const setPage=useCallback((instance:any)=>{page.current=instance;setHydrated(!!instance);setRecords(instance?.state?.records||[]);},[]);
 const clearPage=useCallback((instance:any)=>{if(page.current===instance){page.current=null;setHydrated(false);setRecords([]);}},[]);
 const context=useMemo(()=>({setStatus,setPage,clearPage,notify}),[setPage,clearPage,notify]);
 useEffect(()=>{const pop=()=>{const next=current();if(next!==index){setHydrated(false);setStatus(null);}setIndex(next);setTool(null);setImportOpen(false);};window.addEventListener('popstate',pop);return()=>{window.removeEventListener('popstate',pop);};},[index]);
 useEffect(()=>{document.title=`AJIN ON · ${titles[index]}`;if(location.hash&&!names.includes(location.hash.slice(1) as typeof names[number])){requestAnimationFrame(()=>document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView());}else window.scrollTo(0,0);},[index]);
 const navigate=useCallback(async(target:string)=>{const m=target.match(/^(?:\.\/|\/)?([A-Za-z-]+)(?:\.dc\.html)?(#[\w-]+)?$/);if(!m)return;let i=names.findIndex(n=>n===m[1]);if(i<0)i=paths.indexOf(m[1]!);if(i<0)return;try{await page.current?.store?.flush();}catch{notify('저장되지 않은 변경은 이 브라우저에 임시 보관했습니다.');}const changed=i!==current();if(changed){setHydrated(false);setStatus(null);}history.pushState({},'',(i===0?'/':'/'+paths[i])+(m[2]||''));setIndex(i);setTool(null);setImportOpen(false);if(!changed&&m[2])document.getElementById(m[2].slice(1))?.scrollIntoView();},[notify]);
 function open(mode:ServiceToolsProps['mode'],title:string,initialQuery?:string){setTool({page:paths[index]!,mode,title,initialQuery,maxScore:[3,6].includes(index)?1000:[1,2].includes(index)?100:undefined});}
 function capture(e:React.MouseEvent){const el=e.target instanceof Element?e.target.closest<HTMLElement>('a,button'):null;if(!el)return;const a=el instanceof HTMLAnchorElement?el:null;const href=a?.getAttribute('href');const text=el.textContent?.trim()||el.getAttribute('aria-label')||'';
  if(href&&/\.dc\.html/.test(href)){e.preventDefault();void navigate(href);return;}
  if(el.dataset.bound==='1')return;
  if(href&&href.startsWith('#')&&href.length>1){e.preventDefault();document.getElementById(href.slice(1))?.scrollIntoView({behavior:'smooth'});return;}
  if(a&&href&&href!=='#')return;
  if(el.getAttribute('aria-label')==='검색'){e.preventDefault();const q=document.querySelector<HTMLInputElement>('#homeSearch')?.value||'';open('search','통합 검색',q);return;}
  if(index===0&&a&&['운영안','평가기준','지적사항','개선대책서','3개년 추이','평가원','IATF 매뉴얼','회의록'].includes(text)){e.preventDefault();open('search','통합 검색',text);return;}
  if(/내려받기|다운로드/.test(text)&&!/엑셀/.test(text)){e.preventDefault();if(index===5&&/양식/.test(text)){void import('./services/export-workbook').then(x=>x.exportEvaluationTemplate()).catch(()=>notify('입력 양식을 내려받지 못했습니다.'));}else open('documents',text);return;}
  if(index===1&&/이 시점 집계 저장/.test(text)){e.preventDefault();void import('./services/screen-actions').then(x=>x.snapshotQstar(page.current)).then(()=>{notify('현재 법인의 집계 기록을 저장했습니다.');setRecords(page.current.state.records||[]);}).catch(()=>notify('집계 기록을 저장하지 못했습니다. 저장 상태를 확인해 주세요.'));return;}
  if(/엑셀/.test(text)&&/내려받기|다운로드|내보내기/.test(text)){e.preventDefault();void import('./services/screen-actions').then(x=>x.downloadScreenWorkbook(paths[index]!,page.current)).then(r=>notify(`${r.filename} 내려받기를 시작했습니다.`)).catch(()=>notify('엑셀을 내려받지 못했습니다.'));return;}
  if(/PDF 보기/.test(text)){e.preventDefault();open('documents','통보서 자료');return;}
  if(index===5&&/엑셀/.test(text)&&/등록/.test(text)){e.preventDefault();setImportOpen(true);return;}
  if(/저장/.test(text)){e.preventDefault();void page.current?.store?.flush().then(()=>notify('변경 내용을 저장했습니다.')).catch(()=>notify('저장하지 못했습니다. 저장 상태를 확인해 주세요.'));return;}
  if(/등록|작성|수정|입력|추가/.test(text)){e.preventDefault();open('registration',text);return;}
  if(/첨부|자료|매뉴얼|운영안|기준서|평가서|통보서|대외문/.test(text)){e.preventDefault();open('documents',text||'자료');return;}
  if(index===0&&a&&el.closest('main')&&!/준비|전체|접기/.test(text)&&text.length<30){e.preventDefault();if(['운영안','평가기준','지적사항','개선대책서','3개년 추이','평가원','IATF 매뉴얼','회의록'].includes(text))open('search','통합 검색',text);else notify('준비 중인 메뉴입니다.');return;}
  if(href==='#'){e.preventDefault();notify('준비 중인 메뉴입니다.');}
 }
 async function registered(record:RegistrationRecord){if(!page.current)throw new Error('화면을 불러온 후 다시 등록해 주세요.');try{await page.current.addRecord(record);notify('등록 내용과 첨부 자료를 저장했습니다.');}finally{setRecords(page.current.state.records);}}
 async function retry(overwrite?:boolean){try{await page.current?.store?.retry(overwrite);page.current?.setState(page.current.store.currentState);}catch(e){notify(e instanceof Error?e.message:'저장을 다시 시도해 주세요.');}}
 const Screen=Screens[names[index]!] as React.ComponentType<any>;
 return <ServiceContext.Provider value={context}><div inert={!hydrated} aria-busy={!hydrated} onClickCapture={capture} onSubmitCapture={e=>{if((e.target as HTMLFormElement).getAttribute('role')==='search'){e.preventDefault();open('search','통합 검색',document.querySelector<HTMLInputElement>('#homeSearch')?.value||'');}}}><ScreenBoundary reset={index}><React.Suspense fallback={<p className="loading-page" role="status">화면을 불러오는 중입니다.</p>}><Screen key={index} pageId={paths[index]}/></React.Suspense></ScreenBoundary></div>
 {index===1&&page.current?.state?.snapshots?.length>0&&<section className="registered-records"><h2>중간 집계 기록</h2>{page.current.state.snapshots.map((s:any)=><article key={s.id}><strong>{s.entityName} · {new Date(s.at).toLocaleString('ko-KR')} · {s.total}점</strong><p>{s.values.map((v:any)=>`${v.name} ${v.value}`).join(' / ')}</p></article>)}</section>}
 {records.length>0&&<section className="registered-records"><h2>등록 내역 <span>{records.length}건</span></h2><div>{records.map(r=><article key={r.id}><div><strong>{r.title}</strong><span>{r.entity} · {r.date}{r.score!==null?` · ${r.score}점`:''}</span></div><p>{r.note}</p>{r.documentIds.map(id=><a key={id} href={`/api/documents/${id}/download`}>첨부 자료 다운로드</a>)}</article>)}</div></section>}
 {status&&<aside className="save-status"><SaveIndicator status={status} onRetry={retry}/></aside>}{toast&&<div className="toast" role="status">{toast}</div>}{tool&&<ServiceTools {...tool} onClose={()=>setTool(null)} onRegistered={registered} onNavigate={p=>void navigate(p)}/>}
 {importOpen&&<EvaluationImport onClose={()=>setImportOpen(false)} onBeforeImport={async()=>{await page.current?.store?.flush();}} onImported={async(_snapshot,result)=>{const instance=page.current;if(instance?.props.pageId==='eval-history'){const state=await instance.store.load();await new Promise<void>(resolve=>instance.setState(state,resolve));}notify(`${result.imported}건 등록 · 중복 ${result.skipped}건 제외`);}}/>}
 {index===5&&page.current?.state?.importedDetail&&<EvaluationDetail row={page.current.state.importedDetail} onClose={()=>page.current?.setState({importedDetail:null})}/>}
 </ServiceContext.Provider>;
}
