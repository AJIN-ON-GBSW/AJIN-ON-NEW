import { Fragment, useEffect, useId, useRef, type CSSProperties } from 'react';
import type { EvaluationExportRow } from '../services/export-workbook';

export interface EvaluationDetailProps {
  row: EvaluationExportRow;
  onClose: () => void;
}

const muted = '#66758a';
const judgmentColors: Record<string, [string, string]> = {
  보완: ['#eef3fd', '#3a5f9f'], 일부미흡: ['#e2ebfb', '#1d4ed8'], 다수미흡: ['#fff1dc', '#a35f12'],
  양호: ['#e7f5ee', '#1f7a55'], 미기재: ['#f0f2f5', muted],
  Major: ['#fdecec', '#c23b3b'], Minor: ['#fff1dc', '#a35f12'], OFI: ['#eef3fd', '#3a5f9f'],
};
const closeStyle: CSSProperties = {
  flex: 'none', border: '1px solid #d5dbe4', background: '#ffffff', color: '#2b3644',
  borderRadius: 9, padding: '8px 14px', font: 'inherit', fontSize: 13, cursor: 'pointer',
};
const textStyle: CSSProperties = {
  margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit', fontSize: 14,
  lineHeight: 1.8, color: '#2b3644',
};

/** Read-only detail of a real imported finding; empty fields stay visibly unregistered. */
export default function EvaluationDetail({ row, onClose }: EvaluationDetailProps) {
  const dialog = useRef<HTMLElement>(null);
  const headingId = useId();
  const contextId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter((element) => !element.hidden && !element.closest('[hidden], [aria-hidden="true"]'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) { event.preventDefault(); dialog.current?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  const [judgmentBackground, judgmentColor] = judgmentColors[row.judgment] ?? judgmentColors.미기재!;
  const fields = [
    ['평가 종류', row.type], ['연도 · 차수', `${row.year}년 · ${row.round}차`],
    ['점검일', row.date.replaceAll('-', '.')], ['공장 · 사업장', row.plant],
    ['관리번호', row.managementNumber], ['조치 상태', row.actionStatus || '미기재'],
  ];

  return <div
    style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(11,35,67,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '48px 16px', overflowY: 'auto' }}
    onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={contextId} tabIndex={-1}
      style={{ width: '100%', maxWidth: 1000, boxSizing: 'border-box', background: '#ffffff', color: '#141a23', borderRadius: 18, padding: 24, display: 'flex', flexDirection: 'column', gap: 22, boxShadow: '0 24px 60px rgba(11,35,67,0.3)', outline: 'none' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: muted }}>{row.type} · {row.year}년 {row.round}차</span>
          <h2 id={headingId} style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>지적 내용</h2>
          <p id={contextId} style={{ margin: 0, fontSize: 13, color: muted, overflowWrap: 'anywhere' }}>{row.plant} · {row.managementNumber}</p>
        </div>
        <button type="button" onClick={onClose} style={{ ...closeStyle, marginLeft: 'auto' }} aria-label="상세 닫기">닫기 ×</button>
      </header>

      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px 22px', margin: 0, padding: 18, borderRadius: 12, background: '#f7f9fc', border: '1px solid #e3e8ef' }}>
        {fields.map(([label, value]) => <div key={label} style={{ display: 'grid', gap: 5, minWidth: 0 }}>
          <dt style={{ color: muted, fontSize: 12 }}>{label}</dt>
          <dd style={{ margin: 0, fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>{value}</dd>
        </div>)}
        <div style={{ display: 'grid', gap: 5 }}>
          <dt style={{ color: muted, fontSize: 12 }}>판정</dt>
          <dd style={{ margin: 0 }}><span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: judgmentBackground, color: judgmentColor }}>{row.judgment}</span></dd>
        </div>
      </dl>

      <div style={{ display: 'grid', gap: 18 }}>
        {[
          ['평가항목', row.item], ['부적합 사항', row.nonconformance], ['개선대책', row.improvement],
        ].map(([label, value]) => <Fragment key={label}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 9 }} aria-label={label}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0b2343' }}>{label}</h3>
            <p style={{ ...textStyle, padding: '14px 16px', border: '1px solid #e3e8ef', borderRadius: 10, background: '#ffffff', color: value ? '#2b3644' : muted }}>{value || '등록된 내용이 없습니다.'}</p>
          </section>
        </Fragment>)}
      </div>
      <footer style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
        <button type="button" onClick={onClose} style={closeStyle}>닫기</button>
      </footer>
    </section>
  </div>;
}
