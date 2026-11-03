import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EvaluationDetail from './EvaluationDetail';
import type { EvaluationExportRow } from '../services/export-workbook';

const row: EvaluationExportRow = {
  type: 'IATF 16949', year: 2026, date: '2026-11-03', round: 2, plant: '건천', managementNumber: 'AUDIT-001',
  itemCode: '8.7.1.3', item: '8.7.1.3 의심품 관리', judgmentCode: 'major', judgment: 'Major',
  nonconformance: '태그 사유 누락\n<img src="x" onerror="alert(1)">', improvement: '격리장소 지정\n담당자 교육', actionStatus: '조치 중',
};

describe('evaluation detail modal', () => {
  it('shows all actual imported fields as literal text with preserved line breaks', () => {
    const screen = render(<EvaluationDetail row={row} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: '지적 내용' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    for (const value of ['IATF 16949', '2026년 · 2차', '2026.11.03', '건천', 'AUDIT-001', row.item, 'Major', row.nonconformance, row.improvement, '조치 중']) {
      expect(dialog.textContent).toContain(value);
    }
    const description = screen.getByRole('region', { name: '부적합 사항' }).querySelector('p')!;
    expect(description.style.whiteSpace).toBe('pre-wrap');
    expect(description.textContent).toBe(row.nonconformance);
    expect(dialog.querySelector('img')).toBeNull();
  });

  it('traps keyboard focus, closes on Escape and restores previous focus and scroll state', () => {
    const trigger = document.createElement('button');
    trigger.textContent = '지적 열기'; document.body.appendChild(trigger); trigger.focus();
    const onClose = vi.fn();
    const screen = render(<EvaluationDetail row={row} onClose={onClose} />);
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '상세 닫기' }));
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^닫기$/ }));
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '상세 닫기' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    screen.unmount();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe('');
    trigger.remove();
  });

  it('displays unregistered fields explicitly and connects both close buttons', () => {
    const onClose = vi.fn();
    const screen = render(<EvaluationDetail row={{ ...row, nonconformance: '', improvement: '', actionStatus: '' }} onClose={onClose} />);
    expect(screen.getAllByText('등록된 내용이 없습니다.')).toHaveLength(2);
    expect(screen.getByText('미기재')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
    fireEvent.click(screen.getByRole('button', { name: /^닫기$/ }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
