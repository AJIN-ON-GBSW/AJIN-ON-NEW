import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseDocument} from 'htmlparser2';
const input=process.argv[2]||'/Users/han-yejun/Downloads/AJIN_ON_화면설계.html';
const html=await readFile(input,'utf8');
const pages=JSON.parse(html.match(/<script id="pages" type="application\/json">([\s\S]*?)<\/script>/)[1]).pages;
const paths={Main:'main',Qstar:'qstar',Performance:'performance',FieldAudit:'field-audit',Internal:'internal',EvalHistory:'eval-history',SQ:'sq',IATF:'iatf'};
await mkdir('frontend/src/pages',{recursive:true});
function expr(s,locals){s=s.trim();if(s==='true'||s==='false')return s; if(!/^[a-zA-Z_$][\w$]*(?:\.[\w$]+)*$/.test(s))throw Error('Unsupported binding '+s);return locals.has(s.split('.')[0])?s:'v.'+s;}
function val(s,locals){const exact=s.match(/^{{([^{}]*)}}$/s);if(exact)return expr(exact[1],locals);const chunks=s.split(/({{.*?}})/s).filter(Boolean);return chunks.map(x=>x.startsWith('{{')?'String('+expr(x.slice(2,-2),locals)+' ?? "")':JSON.stringify(x)).join('+')||'""';}
const attrs={class:'className',for:'htmlFor',colspan:'colSpan',rowspan:'rowSpan',tabindex:'tabIndex',readonly:'readOnly',maxlength:'maxLength','stroke-width':'strokeWidth','stroke-linecap':'strokeLinecap','stroke-linejoin':'strokeLinejoin','fill-rule':'fillRule','clip-rule':'clipRule'};
let seq=0;
function node(n,locals){
 if(n.type==='text'){
  let parent=n.parent;while(parent?.name?.startsWith('sc-'))parent=parent.parent;
  if(!n.data.trim()&&['table','thead','tbody','tfoot','tr','colgroup'].includes(parent?.name))return null;
  return val(n.data,locals);
 }
 if(n.type==='comment')return null;
 if(!n.name)return null;
 if(n.name==='script')return null;
 if(n.name==='link'&&/fonts\.google/.test(n.attribs.href||''))return null;
 if(n.name==='sc-for'){
  const name=n.attribs.as;const next=new Set(locals);next.add(name);const idx='i'+seq++;
  return '('+val(n.attribs.list,locals)+' ?? []).map(('+name+','+idx+')=>React.createElement(React.Fragment,{key:'+idx+'},'+children(n,next)+'))';
 }
 if(n.name==='sc-if')return '('+val(n.attribs.value,locals)+' ? React.createElement(React.Fragment,null,'+children(n,locals)+') : null)';
 if(['x-dc','helmet'].includes(n.name))return 'React.createElement(React.Fragment,null,'+children(n,locals)+')';
 const ps=[];
 for(const [key,value] of Object.entries(n.attribs)){
  if(key.startsWith('hint-'))continue;
  let v=val(value,locals);
  if(key==='style')v='styleObject('+v+')';
  if(['disabled','checked','selected','multiple','readOnly'].includes(key)&&value==='')v='true';
  ps.push(JSON.stringify(attrs[key]||key)+':'+v);
 }
 if(n.name==='button'||n.name==='a')ps.push('"data-bound":'+(n.attribs.onClick?'(typeof '+val(n.attribs.onClick,locals)+' === "function" ? "1" : "")':'""'));
 const cs=children(n,locals);
 const element='React.createElement('+JSON.stringify(n.name)+',{'+ps.join(',')+'}'+(cs?', '+cs:'')+')';
 if(n.name==='span'&&locals.has('r')&&n.children?.some(c=>c.type==='text'&&c.data==='[부적합 사항 원문] · 개선대책 [원문]'))return '(r.imported ? React.createElement("button",{"type":"button","data-bound":"1","onClick":r.open,"style":{border:0,background:"none",padding:0,font:"inherit",textAlign:"left",color:"#1d4ed8",cursor:"pointer",whiteSpace:"pre-wrap"}},r.nonconformance||"지적 내용 보기") : '+element+')';
 return element;
}
function children(n,locals){return (n.children||[]).map(c=>node(c,locals)).filter(x=>x!==null).join(',');}
for(const [name,source] of Object.entries(pages)){
 let template=source.match(/<x-dc>([\s\S]*?)<\/x-dc>/)[1];
 if(name==='EvalHistory'){
  template=template.replace('✓ 파일을 만들었습니다 (시제품에서는 실제 파일 대신 이 안내만 표시)','✓ 엑셀 파일을 만들었습니다.');
  const yearRow='<span style="font-size: 12px; font-weight: 700; color: #66758a; width: 40px">연도</span>';
  const typeRow='<sc-if value="{{showImportedTypes}}"><span style="font-size: 12px; font-weight: 700; color: #66758a; width: 40px">종류</span><sc-for list="{{typeChips}}" as="c"><button type="button" onClick="{{c.pick}}" style="{{c.style}}">{{c.label}}</button></sc-for><span style="flex-basis: 100%; height: 4px"></span></sc-if>';
  template=template.replace(yearRow,typeRow+yearRow);
 }
 if(name==='Performance')template=template.replace('<textarea ','<textarea value="{{memoValue}}" onChange="{{setMemo}}" ');
 const script=source.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
 const dom=parseDocument(template,{decodeEntities:true,lowerCaseAttributeNames:false,lowerCaseTags:false});
 let logic=script.replace('class Component extends DCLogic','export default class '+name+' extends PageComponent');
 // The design used truthiness, which makes the number zero disappear from numeric fields.
 if(name==='Performance')logic=logic.replaceAll("st.data[key(rd[0], c.i)] || ''","st.data[key(rd[0], c.i)] ?? ''").replaceAll("st.scores[refKey] || ''","st.scores[refKey] ?? ''");
 if(name==='EvalHistory'){logic=logic.replace('self.setState({ exportDone: true });','void self.exportWorkbook();');logic=logic.replace('render(){ const v=this.renderVals();','render(){ const v=this.renderVals();');}
 const pos=logic.lastIndexOf('}');
 logic=logic.slice(0,pos)+'\n  render(){ const v=this.renderVals(); '+(name==='Performance'?'const memoKey=this.state.entity+\"|\"+this.state.item;v.memoValue=this.state.memos?.[memoKey]??\"\";v.setMemo=e=>this.setState({memos:{...(this.state.memos||{}),[memoKey]:e.target.value}});':'')+(name==='EvalHistory'?'Object.assign(v,enhanceEvaluationValues(this,v));const plan=planEvaluationWorkbook(this); v.exportName=plan.filename; v.exportSummary=`총 ${plan.rows.length.toLocaleString(\"ko-KR\")}행 · 시트 ${plan.sheets.length}개`;':'')+' return React.createElement(React.Fragment,null,'+children(dom,new Set())+'); }\n'+logic.slice(pos);
 const imports='// React implementation of the supplied AJIN ON screen; source layout and business calculations preserved.\nimport React from "react";\nimport {PageComponent,styleObject} from "../runtime/PageComponent.jsx";\n'+(name==='EvalHistory'?'import {planEvaluationWorkbook} from "../services/export-workbook";\nimport {enhanceEvaluationValues} from "../services/imported-evaluations";\n':'');
 await writeFile('frontend/src/pages/'+name+'.jsx',imports+logic);
}
await writeFile('frontend/src/pages/index.js',Object.entries(paths).map(([n,p])=>'export {default as '+n+'} from "./'+n+'.jsx";').join('\n')+'\n');
console.log('Generated '+Object.keys(pages).length+' native React page components.');
