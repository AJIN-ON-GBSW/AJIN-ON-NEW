import { describe, expect, it } from 'vitest';
import { deriveQstarFromPerformance } from './quality-summary';

const seed = () => ({ state: { est: { ajin: { incoming: 8.874, claim: 33.862, qm: 10, out: 14.416, audit: 21.904 }, ajincar: { audit: 25 } } } });

describe('quality score derivation between actual screens', () => {
  it('preserves the exact supplied seed when no performance inputs were edited', () => {
    const source = seed();
    expect(deriveQstarFromPerformance(source, { data: {}, refs: {}, scores: {} })).toEqual({});
    expect(source.state.est.ajin.incoming).toBe(8.874);
  });

  it('maps direct scores including zero and preserves every unrelated score and company', () => {
    const source = seed();
    const before = structuredClone(source);
    const patch = deriveQstarFromPerformance(source, { scores: { 'ajin|qm': '0', 'ajin|outsourcing': '12.5', 'ajincar|qm': 7 } });
    expect(patch.est?.ajin).toEqual({ incoming: 8.874, claim: 33.862, qm: 0, out: 12.5, audit: 21.904 });
    expect(patch.est?.ajincar).toEqual({ audit: 25, qm: 7 });
    expect(source).toEqual(before);
  });

  it('removes an outdated sample score when monthly data exists but the official formula is unknown', () => {
    const patch = deriveQstarFromPerformance(seed(), { data: { 'ajin|incoming|receipts|0': '100' } });
    expect(patch.est?.ajin).toEqual({ claim: 33.862, qm: 10, out: 14.416, audit: 21.904 });
  });

  it('treats zero monthly values as edited data instead of keeping an unrelated sample claim score', () => {
    const patch = deriveQstarFromPerformance(seed(), { data: { 'ajin|claim|receipts|0': '0' } });
    expect(patch.est?.ajin).toEqual({ incoming: 8.874, qm: 10, out: 14.416, audit: 21.904 });
  });

  it('does not keep a stale score for explicitly cleared or invalid direct inputs', () => {
    const patch = deriveQstarFromPerformance(seed(), { scores: { 'ajin|qm': '', 'ajin|outsourcing': '99' } });
    expect(patch.est?.ajin).toEqual({ incoming: 8.874, claim: 33.862, audit: 21.904 });
  });

  it('does not mistake the demonstration raw value or an unscaled generic registration for a final score', () => {
    expect(deriveQstarFromPerformance(seed(), {}, { raw: 850, records: [{ entity: '아진산업', score: 100 }] })).toEqual({});
  });
});
