import { useState } from 'react';
import { AssistantLibrary } from './source';
import { metricFields, periodLabel, type Metrics } from './report';

export default function ScoreEditor({period,plants,initial,library,onClose,onSave}:{period:string;plants:string[];initial:Metrics;library:AssistantLibrary;onClose:()=>void;onSave:(values:Metrics)=>void}) {
  const [draft,setDraft]=useState<Metrics>(()=>structuredClone(initial));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <dialog open className="score-dialog" aria-labelledby="score-heading" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
    <form onSubmit={async e=>{
      e.preventDefault();setBusy(true);setError('');
      try {await library.set('metrics/'+period,{plants:draft});onSave(draft);}
      catch(e){setError(e instanceof Error?e.message:'저장에 실패했습니다.');}
      finally{setBusy(false);}
    }}>
      <h2 id="score-heading">{periodLabel(period)} 점수 자료</h2>
      <p>공식 평가서의 값을 입력하세요. 빈칸은 평균과 비교에서 제외합니다.</p>
      <div className="report-scroll"><table><thead><tr><th>공장</th>{metricFields.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead>
      <tbody>{plants.map(plant=><tr key={plant}><th>{plant}</th>{metricFields.map(([key,label])=><td key={key}>
        <input type="number" step="any" min={key.endsWith('Bonus')?undefined:0} max={key==='practice'||key.startsWith('area')?100:undefined} aria-label={plant+' '+label}
          value={draft[plant]?.[key]??''} onChange={e=>{const text=e.target.value;setDraft(old=>{const row={...old[plant]};if(text==='')delete row[key];else row[key]=Number(text);return {...old,[plant]:row};});}}/>
      </td>)}</tr>)}</tbody></table></div>
      {error&&<p role="alert">{error}</p>}
      <footer><button type="button" onClick={onClose} disabled={busy}>닫기</button><button className="report-primary" disabled={busy}>{busy?'저장 중…':'점수 자료 저장'}</button></footer>
    </form>
  </dialog>;
}
