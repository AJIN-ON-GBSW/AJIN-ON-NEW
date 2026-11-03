import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  deleteDocument, documentDownloadUrl, listDocuments, searchService, uploadDocument,
  type DocumentMetadata, type SearchResult,
} from '../services/documents';
import type { SaveStatus } from '../services/pageStore';

export interface RegistrationRecord {
  id: string;
  title: string;
  date: string;
  entity: string;
  score: number | null;
  note: string;
  documentIds: string[];
  createdAt: string;
}
export interface ServiceToolsProps {
  page: string;
  mode: 'documents' | 'search' | 'registration';
  title: string;
  initialQuery?: string;
  maxScore?: number;
  onClose: () => void;
  onNavigate?: (page: string) => void;
  onRegistered?: (record: RegistrationRecord) => void | Promise<void>;
}

const palette = { ink: '#141a23', muted: '#66758a', border: '#d5dbe4', green: '#1f7a55' };
const button: CSSProperties = { border: `1px solid ${palette.border}`, background: '#fff', color: palette.ink, borderRadius: 9, padding: '9px 14px', font: 'inherit', fontSize: 13, cursor: 'pointer' };
const primary: CSSProperties = { ...button, background: palette.ink, color: '#fff', borderColor: palette.ink, fontWeight: 700 };
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', border: `1px solid ${palette.border}`, background: '#fff', color: palette.ink, borderRadius: 9, padding: '10px 12px', font: 'inherit', fontSize: 14 };
const field: CSSProperties = { display: 'grid', gap: 7, fontSize: 13, fontWeight: 600 };
const feedback: CSSProperties = { margin: 0, padding: '10px 12px', borderRadius: 9, background: '#fff7ea', color: '#885319', fontSize: 13, lineHeight: 1.6 };
const failure = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다. 다시 시도해 주세요.';
function localDate() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function sizeLabel(size: number) { return size < 1024 ? `${size} B` : size < 1024 ** 2 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 ** 2).toFixed(1)} MB`; }

/** Visible persistence feedback for class or function components. Retry(true) requires this explicit user action. */
export function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: (overwrite?: boolean) => void }) {
  const issue = ['offline', 'conflict', 'error'].includes(status.phase);
  return <div role={issue ? 'alert' : 'status'} aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: issue ? '#a35f12' : palette.muted }}>
    <span>{status.message}</span>
    {issue && <button type="button" style={{ ...button, fontSize: 12, padding: '4px 8px' }} onClick={() => onRetry(false)}>다시 저장</button>}
    {status.phase === 'conflict' && <button type="button" style={{ ...button, fontSize: 12, padding: '4px 8px' }} onClick={() => onRetry(true)}>내 변경 내용 저장</button>}
  </div>;
}

export default function ServiceTools(props: ServiceToolsProps) {
  const { page, mode, title, onClose } = props;
  const dialog = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState(props.initialQuery ?? '');
  const [documents, setDocuments] = useState<DocumentMetadata[]>([]);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploaded, setUploaded] = useState<DocumentMetadata[]>([]);
  const [recordTitle, setRecordTitle] = useState('');
  const [date, setDate] = useState(localDate);
  const [entity, setEntity] = useState('');
  const [score, setScore] = useState('');
  const [note, setNote] = useState('');
  const [recordId] = useState(() => crypto.randomUUID());
  const [createdAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab') return;
      const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]');
      if (!nodes?.length) { event.preventDefault(); return; }
      const first = nodes[0]!; const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, [onClose, busy]);

  useEffect(() => {
    if (mode === 'registration') return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setBusy(true); setError('');
      const task = mode === 'search'
        ? query.trim() ? searchService(query, controller.signal).then(setSearch) : Promise.resolve(setSearch(null))
        : listDocuments(page, query, controller.signal).then(setDocuments);
      void task.catch((reason: unknown) => { if (!controller.signal.aborted) setError(failure(reason)); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [mode, page, query]);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!files.length || busy) return;
    setBusy(true); setError(''); setNotice('');
    const remaining = [...files];
    try {
      for (const file of files) {
        await uploadDocument(file, page, { category: title });
        remaining.shift();
        setFiles([...remaining]);
      }
      setDocuments(await listDocuments(page, query));
      setNotice('첨부 파일을 저장했습니다. 목록에서 내려받을 수 있습니다.');
    } catch (reason) { setError(failure(reason)); }
    finally { setBusy(false); }
  }
  async function remove(document: DocumentMetadata) {
    if (busy) return;
    if (!window.confirm(`“${document.filename}” 첨부 파일을 삭제할까요?`)) return;
    setBusy(true); setError('');
    try { await deleteDocument(document.id); setDocuments((current) => current.filter((item) => item.id !== document.id)); setNotice('첨부 파일을 삭제했습니다.'); }
    catch (reason) { setError(failure(reason)); }
    finally { setBusy(false); }
  }
  async function register(event: FormEvent) {
    event.preventDefault();
    if (busy || !props.onRegistered) return;
    setBusy(true); setError('');
    const attached = [...uploaded];
    try {
      const remaining = [...files];
      for (const file of files) {
        attached.push(await uploadDocument(file, page, { category: title, title: recordTitle }));
        remaining.shift(); setFiles([...remaining]); setUploaded([...attached]);
      }
      await props.onRegistered({ id: recordId, title: recordTitle.trim(), date, entity: entity.trim(),
        score: score === '' ? null : Number(score), note: note.trim(), documentIds: attached.map((item) => item.id), createdAt });
      onClose();
    } catch (reason) { setError(failure(reason)); }
    finally { setBusy(false); }
  }

  function documentRows(items: DocumentMetadata[], allowDelete = false) {
    return <div style={{ display: 'grid', gap: 9 }}>{items.map((item) => <div key={item.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '13px 14px', border: `1px solid ${palette.border}`, borderRadius: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}><a href={documentDownloadUrl(item.id)} style={{ color: palette.ink, fontWeight: 600, fontSize: 14, overflowWrap: 'anywhere' }}>{item.title || item.filename}</a>
        <div style={{ marginTop: 5, fontSize: 12, color: palette.muted }}>{item.filename} · {sizeLabel(item.size)} · {new Date(item.createdAt).toLocaleDateString('ko-KR')}</div></div>
      <a href={documentDownloadUrl(item.id)} style={{ ...button, textDecoration: 'none', whiteSpace: 'nowrap' }}>내려받기</a>
      {allowDelete && <button type="button" style={{ ...button, color: '#b13d3d' }} disabled={busy} onClick={() => void remove(item)}>삭제</button>}
    </div>)}</div>;
  }
  const fileInput = <label style={field}>첨부 파일<input type="file" multiple disabled={busy} style={{ ...input, fontWeight: 400 }} onChange={(event) => { setFiles(Array.from(event.currentTarget.files ?? [])); setError(''); }} />
    {files.length > 0 && <span style={{ fontWeight: 400, color: palette.muted }}>{files.map((item) => item.name).join(', ')}</span>}</label>;

  return <div onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#141a2366', display: 'grid', placeItems: 'center', padding: 20, boxSizing: 'border-box' }}>
    <div role="dialog" aria-modal="true" aria-label={title} ref={dialog} tabIndex={-1} style={{ background: '#fff', color: palette.ink, width: 'min(760px, 100%)', maxHeight: '90dvh', overflowY: 'auto', borderRadius: 18, boxShadow: '0 16px 80px #141a2333', padding: 26, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 22 }}><h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2><button type="button" aria-label="닫기" disabled={busy} style={button} onClick={onClose}>닫기</button></div>
      <div style={{ display: 'grid', gap: 18 }}>
        {error && <p role="alert" style={feedback}>{error}</p>}
        {notice && <p role="status" style={{ ...feedback, color: palette.green, background: '#edf7f0' }}>{notice}</p>}
        {mode === 'registration' ? <form onSubmit={(event) => void register(event)} style={{ display: 'grid', gap: 17 }}>
          <label style={field}>제목<input required maxLength={200} value={recordTitle} onChange={(event) => setRecordTitle(event.target.value)} style={input} disabled={busy} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <label style={field}>일자<input type="date" required value={date} onChange={(event) => setDate(event.target.value)} style={input} disabled={busy} /></label>
            <label style={field}>법인 · 공장<input maxLength={150} value={entity} onChange={(event) => setEntity(event.target.value)} style={input} disabled={busy} /></label>
            {props.maxScore !== undefined && <label style={field}>점수 (0–{props.maxScore})<input type="number" min={0} max={props.maxScore} step="0.01" value={score} onChange={(event) => setScore(event.target.value)} style={input} disabled={busy} /></label>}
          </div>
          <label style={field}>내용<textarea rows={5} maxLength={20_000} value={note} onChange={(event) => setNote(event.target.value)} style={{ ...input, resize: 'vertical' }} disabled={busy} /></label>
          {fileInput}
          {uploaded.length > 0 && <div><p style={{ fontSize: 12, color: palette.muted }}>저장한 첨부 파일</p>{documentRows(uploaded)}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9 }}><button type="button" style={button} onClick={onClose} disabled={busy}>취소</button><button type="submit" style={primary} disabled={busy || !props.onRegistered}>{busy ? '저장 중…' : '등록'}</button></div>
        </form> : <>
          <label style={field}>{mode === 'search' ? '통합 검색' : '첨부 파일 검색'}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={mode === 'search' ? '검색어를 입력하세요' : '파일명 또는 제목'} style={input} /></label>
          {busy && <p role="status" style={{ margin: 0, color: palette.muted, fontSize: 13 }}>불러오는 중…</p>}
          {mode === 'documents' ? <>
            <form onSubmit={(event) => void upload(event)} style={{ display: 'grid', gap: 12, padding: 16, border: `1px dashed ${palette.border}`, borderRadius: 12 }}>{fileInput}<div><button type="submit" style={primary} disabled={busy || !files.length}>{busy ? '처리 중…' : '파일 첨부'}</button></div></form>
            {!busy && documents.length === 0 ? <p style={{ color: palette.muted, fontSize: 14 }}>등록된 첨부 파일이 없습니다.</p> : documentRows(documents, true)}
          </> : <>
            {search && <><h3 style={{ margin: 0, fontSize: 15 }}>화면 ({search.pages.length})</h3>{search.pages.map((item) => <button type="button" key={item.page} style={{ ...button, textAlign: 'left', display: 'grid', gap: 7 }} onClick={() => { props.onNavigate?.(item.page); onClose(); }}><strong>{item.title}</strong><span style={{ fontSize: 13, fontWeight: 400, color: palette.muted, lineHeight: 1.6 }}>{item.excerpt}</span></button>)}
              <h3 style={{ margin: 0, fontSize: 15 }}>첨부 파일 ({search.documents.length})</h3>{documentRows(search.documents)}
              {!search.pages.length && !search.documents.length && <p style={{ color: palette.muted, fontSize: 14 }}>검색 결과가 없습니다.</p>}</>}
            {!search && !busy && <p style={{ color: palette.muted, fontSize: 14 }}>저장된 화면 내용과 첨부 파일을 검색합니다.</p>}
          </>}
        </>}
      </div>
    </div>
  </div>;
}
