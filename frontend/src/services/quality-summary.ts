/** Field names used by the supplied two screens differ for outsourcing (`out` vs `outsourcing`). */
const ENTITIES = ['ajin', 'ajincar', 'ajajin', 'ajinelec'] as const;
const DIRECT_SCORES = [
  { input: 'qm', estimate: 'qm', maximum: 10 },
  { input: 'outsourcing', estimate: 'out', maximum: 15 },
] as const;
const MONTHLY_ROWS: Record<string, readonly string[]> = {
  incoming: ['receipts', 'domestic', 'kd'],
  claim: ['receipts', 'claimTotal', 'w1', 'w2', 'w3'],
};

type ObjectValue = Record<string, unknown>;
export interface QstarEstimatePatch { est?: Record<string, ObjectValue> }

function object(value: unknown): ObjectValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
}
function present(value: unknown): boolean {
  return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
}
function score(value: unknown, maximum: number): number | undefined {
  if (!present(value)) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= maximum ? number : undefined;
}

/** Derive only scores whose meaning is established by the supplied screens.
 *
 * - An untouched Performance page leaves the original Qstar seed estimates exactly intact.
 * - Explicit quality-management/outsourcing scores replace their corresponding estimate, including 0.
 * - Edited monthly incoming/claim figures cannot yield a score without the missing official bands,
 *   rounding rules and historical denominators. Their previous sample estimate becomes 미입력.
 * - FieldAudit.raw is a demonstration value. Generic registered scores have no declared scale, so
 *   neither is treated as an actual customer final score. A later typed final-score model may add it.
 *
 * Returns a minimal React setState patch and never mutates either supplied page state.
 */
export function deriveQstarFromPerformance(
  qstarInstance: { state: ObjectValue },
  performanceState: ObjectValue,
  _fieldAuditState?: ObjectValue,
): QstarEstimatePatch {
  const initial = object(qstarInstance.state.est) as Record<string, ObjectValue>;
  let estimates = initial;
  const copied = new Set<string>();
  const change = (entity: string, item: string, value: number | undefined) => {
    const previous = object(estimates[entity]);
    if (value === undefined ? !Object.hasOwn(previous, item) : previous[item] === value) return;
    if (estimates === initial) estimates = { ...initial };
    if (!copied.has(entity)) {
      estimates[entity] = { ...previous };
      copied.add(entity);
    }
    if (value === undefined) delete estimates[entity]![item];
    else estimates[entity]![item] = value;
  };

  const scores = object(performanceState.scores);
  const monthly = object(performanceState.data);
  const references = object(performanceState.refs);
  for (const entity of ENTITIES) {
    for (const item of DIRECT_SCORES) {
      const key = `${entity}|${item.input}`;
      // A missing key means "no data from this screen", while explicit blank means cleared input.
      if (Object.hasOwn(scores, key)) change(entity, item.estimate, score(scores[key], item.maximum));
    }
    for (const [item, rows] of Object.entries(MONTHLY_ROWS)) {
      const hasMonthlyInput = rows.some((row) => {
        for (let month = 0; month < 12; month += 1) {
          if (present(monthly[`${entity}|${item}|${row}|${month}`])) return true;
        }
        return false;
      });
      if (hasMonthlyInput || present(references[`${entity}|${item}`])) change(entity, item, undefined);
    }
  }
  return estimates === initial ? {} : { est: estimates };
}
