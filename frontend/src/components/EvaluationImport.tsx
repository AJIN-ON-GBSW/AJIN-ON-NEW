import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  EVALUATION_HEADERS, evaluationFieldLabel, evaluationImportIssues, importEvaluations, parseEvaluationWorkbook,
  type EvaluationImportResult, type ImportIssue, type ParsedEvaluationImport,
} from '../services/evaluation-import';
import type { PageSnapshot } from '../services/pageStore';

export interface EvaluationImportProps {
  onClose: () => void;
  onBeforeImport: () => Promise<void>;
  onImported: (snapshot: PageSnapshot, response: EvaluationImportResult) => void | Promise<void>;
}
const button: CSSProperties = { border: '1px solid #d5dbe4', background: '#fff', color: '#141a23', borderRadius: 9, padding: '9px 14px', font: 'inherit', fontSize: 13, cursor: 'pointer' };
const primary: CSSProperties = { ...button, background: '#141a23', color: '#fff', borderColor: '#141a23', fontWeight: 700 };
const cell: CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #edf0f4', textAlign: 'left', verticalAlign: 'top', fontSize: 12, lineHeight: 1.6, minWidth: 90, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };
const fail = (error: unknown) => error instanceof Error ? error.message : '엑셀을 등록하지 못했습니다. 다시 시도해 주세요.';

export default function EvaluationImport({ onClose, onBeforeImport, onImported }: EvaluationImportProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const sequence = useRef(0);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filename, setFilename] = useState('');
  const [parsed, setParsed] = useState<ParsedEvaluationImport | null>(null);
  const [error, setError] = useState('');
  const [serverIssues, setServerIssues] = useState<ImportIssue[]>([]);
  const [result, setResult] = useState<EvaluationImportResult | null>(null);
  const issues = [...(parsed?.errors ?? []), ...serverIssues];

  useEffect(() => {
    alive.current = true;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab') return;
      const elements = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]');
      if (!elements?.length) { event.preventDefault(); return; }
      const first = elements[0]!; const last = elements[elements.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { alive.current = false; document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previousFocus?.focus(); };
  }, [onClose, busy]);

  async function select(file: File | undefined) {
    const token = ++sequence.current;
    setParsed(null); setResult(null); setError(''); setServerIssues([]); setFilename(file?.name ?? '');
    if (!file) return;
    setReading(true);
    try {
      const data = await parseEvaluationWorkbook(file);
      if (alive.current && token === sequence.current) setParsed(data);
    } catch (reason) { if (alive.current && token === sequence.current) setError(fail(reason)); }
    finally { if (alive.current && token === sequence.current) setReading(false); }
  }
  async function save() {
    if (!parsed || parsed.errors.length || !parsed.rows.length || busy || result) return;
    setBusy(true); setError(''); setServerIssues([]);
    try {
      await onBeforeImport();
      const response = await importEvaluations(parsed.rows);
      await onImported(response.snapshot, response);
      if (alive.current) setResult(response);
    } catch (reason) {
      if (alive.current) { setError(fail(reason)); setServerIssues(evaluationImportIssues(reason, parsed.rowNumbers)); }
    } finally { if (alive.current) setBusy(false); }
  }
  async function template() {
    try { await (await import('../services/export-workbook')).exportEvaluationTemplate(); }
    catch (reason) { setError(fail(reason)); }
  }

  return <div onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#141a2366', display: 'grid', placeItems: 'center', padding: 20, boxSizing: 'border-box' }}>
    <div role="dialog" aria-modal="true" aria-label="엑셀 평가 결과 등록" ref={dialog} tabIndex={-1} style={{ background: '#fff', color: '#141a23', width: 'min(1120px, 100%)', maxHeight: '90dvh', overflowY: 'auto', borderRadius: 18, boxShadow: '0 16px 80px #141a2333', padding: 26, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}><h2 style={{ margin: 0, fontSize: 22 }}>엑셀 평가 결과 등록</h2><button type="button" style={button} disabled={busy} onClick={onClose}>닫기</button></div>
      <div style={{ display: 'grid', gap: 17 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#66758a', lineHeight: 1.8 }}>입력 양식의 열 11개를 그대로 사용해 주세요. 첫 번째 시트에서 최대 1000개 행을 읽습니다. 오류가 있으면 전체 등록을 멈추고, 이미 등록한 동일 평가는 중복으로 추가하지 않습니다.</p>
        <div><button type="button" style={button} disabled={busy} onClick={() => void template()}>입력 양식 내려받기</button></div>
        <label style={{ display: 'grid', gap: 8, fontSize: 13, fontWeight: 600 }}>엑셀 파일 (.xlsx)<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy || reading} onChange={(event) => void select(event.target.files?.[0])} style={{ border: '1px solid #d5dbe4', borderRadius: 9, padding: 12, font: 'inherit', fontSize: 13, fontWeight: 400 }} /></label>
        {reading && <p role="status" style={{ margin: 0, color: '#66758a', fontSize: 13 }}>엑셀 내용을 확인하는 중…</p>}
        {error && <p role="alert" style={{ margin: 0, padding: 12, borderRadius: 9, background: '#fff7ea', color: '#a35f12', fontSize: 13, lineHeight: 1.7 }}>{error}</p>}
        {issues.length > 0 && <section aria-label="엑셀 입력 오류" style={{ border: '1px solid #f3dcb5', background: '#fff7ea', borderRadius: 10, padding: 14 }}>
          <strong style={{ fontSize: 13, color: '#a35f12' }}>입력 오류 {issues.length}건 · 파일을 수정한 뒤 다시 선택해 주세요.</strong>
          <ul style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 12, color: '#885319', lineHeight: 1.8 }}>{issues.slice(0, 100).map((issue, index) => <li key={`${issue.row}-${issue.field}-${index}`}>{issue.row}행 · {evaluationFieldLabel(issue.field)}: {issue.message}</li>)}</ul>
          {issues.length > 100 && <p style={{ fontSize: 12, marginBottom: 0 }}>처음 100건을 표시했습니다. 전체 오류는 {issues.length}건입니다.</p>}
        </section>}
        {parsed && <section aria-label="등록 미리보기" style={{ display: 'grid', gap: 10 }}>
          <strong style={{ fontSize: 14 }}>{filename} · 데이터 {parsed.rowCount}행</strong>
          <span style={{ fontSize: 12, color: '#66758a' }}>처음 {parsed.preview.length}행 미리보기 · 빈 행은 제외합니다. 날짜와 차수는 등록 전에 표준 형식으로 정리합니다.</span>
          <div style={{ overflowX: 'auto', maxHeight: 390, border: '1px solid #e3e8ef', borderRadius: 10 }}><table style={{ borderCollapse: 'collapse', minWidth: 1400, width: '100%' }}><thead><tr><th scope="col" style={{ ...cell, minWidth: 46, background: '#f7f9fc', position: 'sticky', top: 0 }}>행</th>{EVALUATION_HEADERS.map((label) => <th key={label} scope="col" style={{ ...cell, background: '#f7f9fc', position: 'sticky', top: 0 }}>{label}</th>)}</tr></thead><tbody>{parsed.preview.map((row) => <tr key={row.row}><th scope="row" style={{ ...cell, minWidth: 46 }}>{row.row}</th>{row.values.map((value, index) => <td key={index} style={cell}>{value}</td>)}</tr>)}</tbody></table></div>
        </section>}
        {result && <p role="status" style={{ margin: 0, padding: 12, borderRadius: 9, background: '#edf7f0', color: '#1f7a55', fontSize: 14 }}>{result.imported > 0 ? `${result.imported}건을 등록했습니다.` : '새로 등록한 행이 없습니다.'} 이미 등록된 중복 {result.skipped}건은 건너뛰었습니다.</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}><button type="button" style={button} disabled={busy} onClick={onClose}>{result ? '닫기' : '취소'}</button><button type="button" style={primary} disabled={busy || reading || !parsed || parsed.errors.length > 0 || !parsed.rows.length || !!result} onClick={() => void save()}>{busy ? '등록 중…' : `${parsed?.rowCount ?? 0}행 등록`}</button></div>
      </div>
    </div>
  </div>;
}
