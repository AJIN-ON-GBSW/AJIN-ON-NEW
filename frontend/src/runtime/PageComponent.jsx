import React from 'react';
import {PageStateStore,loadPageState} from '../services/pageStore';
/** @type {React.Context<any>} */
export const ServiceContext=React.createContext(null);
const cache=new Map();
export function styleObject(style){
 if(!style)return undefined;if(typeof style==='object')return style;
 if(cache.has(style))return cache.get(style);
 const out={};for(const declaration of style.split(';')){const colon=declaration.indexOf(':');if(colon<0)continue;let k=declaration.slice(0,colon).trim(),v=declaration.slice(colon+1).trim();if(!k||!v)continue;k=k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());out[k]=v;}
 if(cache.size>2000)cache.clear();cache.set(style,out);return out;
}
export class PageComponent extends React.Component {
 static contextType=ServiceContext;
 async componentDidMount(){
  this.alive=true;this.store=new PageStateStore(this.props.pageId,this.state);
  this.unsubscribe=this.store.subscribe(s=>this.context?.setStatus(s));
  const state=await this.store.load();if(!this.alive)return;
  if(this.props.pageId==='qstar'){
   try{const [performance,{deriveQstarFromPerformance}]=await Promise.all([loadPageState('performance'),import('../services/quality-summary')]);const patch=deriveQstarFromPerformance({state},performance.state);Object.assign(state,patch);}catch(error){this.context?.notify('실적 집계를 불러오지 못했습니다. 저장된 현황을 표시합니다.');}
  }
  if(!this.alive)return;
  this.setState(state,()=>{this.ready=true;this.unsubscribeState=this.store.subscribeState(state=>{if(this.alive)this.setState(state);});this.context?.setPage(this);});
 }
 componentDidUpdate(){if(this.ready)this.store.update(this.state);}
 componentWillUnmount(){this.alive=false;this.unsubscribe?.();this.unsubscribeState?.();const store=this.store;if(store){void store.flush().catch(()=>{}).finally(()=>store.dispose());}this.context?.clearPage?.(this);}
 async exportWorkbook(){
  try{const {exportEvaluationWorkbook}=await import('../services/export-workbook');await exportEvaluationWorkbook(this);this.setState({exportDone:true});}
  catch(error){this.context?.notify(error.message||'내보내기에 실패했습니다.');}
 }
 async addRecord(record){const records=[...(this.state.records||[]).filter(r=>r.id!==record.id),record];await new Promise(resolve=>this.setState({records},resolve));this.store.update(this.state);await this.store.flush();}
}
