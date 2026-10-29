// Studio's rules for what Piagent sends, from docs/studio-contract.md (sections 3.4 and 5), written as checks.
// Each returns a list of problems; empty means the body would be accepted.
const KEYS = {
  1: ['version', 'policy', 'changed', 'plan_steps', 'plan_done', 'checks', 'checks_failed', 'verified', 'reviews', 'reviewed', 'blocking', 'blocking_open', 'fix_loops', 'outcome'],
  2: ['plan_skipped', 'unknown_tools'],
  3: ['objections', 'objections_answered', 'disputes'],
};
const FLAGS = new Set(['changed', 'verified', 'reviewed', 'plan_skipped']);
const MODES = ['off', 'suggest', 'require'];
const OUTCOMES = ['no_change', 'interrupted', 'blocking_open', 'unverified', 'review_unavailable', 'unreviewed', 'clean'];

export function processProblems(report) {
  const problems = [], version = report?.version;
  if (![1, 2, 3].includes(version)) return ['version'];
  const want = new Set(Object.entries(KEYS).filter(([v]) => Number(v) <= version).flatMap(([, keys]) => keys)), have = new Set(Object.keys(report));
  for (const key of want) if (!have.has(key)) problems.push(`missing:${key}`);
  for (const key of have) if (!want.has(key)) problems.push(`extra:${key}`);
  if (typeof report.policy !== 'object' || Object.keys(report.policy ?? {}).sort().join() !== 'plan,review,verify' || Object.values(report.policy).some(m => !MODES.includes(m))) problems.push('policy');
  for (const key of want) {
    if (key === 'policy' || key === 'outcome' || !have.has(key)) continue;
    if (FLAGS.has(key)) { if (typeof report[key] !== 'boolean') problems.push(`bool:${key}`); }
    else if (key !== 'version' && !(Number.isInteger(report[key]) && report[key] >= 0 && report[key] <= 1000)) problems.push(`int:${key}`);
  }
  if (!(version === 3 ? [...OUTCOMES, 'disputed'] : OUTCOMES).includes(report.outcome)) problems.push('outcome');
  if (report.plan_done > report.plan_steps) problems.push('plan_done>plan_steps');
  if (report.checks_failed > report.checks) problems.push('checks_failed>checks');
  if (report.blocking_open > report.blocking) problems.push('blocking_open>blocking');
  if (report.fix_loops > 3) problems.push('fix_loops>3');
  if (version === 3 && report.objections_answered > report.objections) problems.push('objections_answered>objections');
  if (version === 3 && report.outcome === 'disputed' && !(report.disputes > 0)) problems.push('disputed-without-disputes');
  if (!report.changed && !['no_change', 'interrupted', 'disputed'].includes(report.outcome)) problems.push('unchanged-outcome');
  return problems;
}

export function settleProblems(body) {
  const problems = [], cap = (value, max, name) => { if (typeof value !== 'string' || value.length > max) problems.push(name); };
  if (!['succeeded', 'failed', 'cancelled', 'unverifiable'].includes(body?.outcome)) problems.push('outcome');
  if (typeof body?.summary !== 'string' || !body.summary.trim() || body.summary.length > 600) problems.push('summary');
  if (!Array.isArray(body?.evidence) || body.evidence.length > 8) problems.push('evidence'); else body.evidence.forEach(e => cap(e, 300, 'evidence-item'));
  if (!Array.isArray(body?.files) || body.files.length > 50) problems.push('files'); else body.files.forEach(f => cap(f, 300, 'file'));
  if (body?.spec !== undefined) for (const [k, v] of Object.entries(body.spec)) { if (!['target', 'change', 'constraints', 'ownership', 'acceptance'].includes(k)) problems.push(`spec:${k}`); cap(v, 1000, `spec:${k}`); }
  for (const key of Object.keys(body ?? {})) if (!['outcome', 'summary', 'evidence', 'files', 'spec'].includes(key)) problems.push(`extra:${key}`);
  return problems;
}
