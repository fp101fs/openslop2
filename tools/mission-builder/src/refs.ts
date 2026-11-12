/** Id helpers for the Mission Builder: rename an id everywhere it is referenced, and list what can be referenced. Pure. */
import type { MissionData } from '../../../src/campaign/data/MissionData';

/** Replace references to `from` (exact, or `from#n` for one unit of a group) with `to` in triggers, behaviours and the test route. */
export function renameRefs(d: MissionData, from: string, to: string) {
  const swap = (v: unknown): unknown => {
    if (typeof v === 'string') return v === from ? to : v.startsWith(from + '#') ? to + v.slice(from.length) : v;
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) if (k !== 'id' || 'k' in (v as object) || 'a' in (v as object)) (v as any)[k] = swap((v as any)[k]); return v; }
    return v;
  };
  // a trigger's own `id` is a definition, but `{ k: 'trigger', id }` / `{ a: 'objective', id }` are references: swap() keeps
  // `id` only inside condition / action objects
  for (const t of d.triggers) { t.when = swap(t.when) as any; if (t.if) t.if = swap(t.if) as any; t.do = swap(t.do) as any; }
  for (const g of d.groups) if (g.behavior) g.behavior = swap(g.behavior) as any;
  if (d.testRoute === from) d.testRoute = to;
}

export function refOptions(d: MissionData) {
  return {
    group: d.groups.map(g => g.id),
    region: d.regions.map(r => r.id),
    path: d.paths.map(p => p.id),
    line: d.dialogue.map(l => l.id),
    objective: d.objectives.map(o => o.id),
    trigger: d.triggers.map(t => t.id),
    stat: (d.stats ?? []).map(s => s.id),
    hook: d.hooks ?? [],
    speaker: Object.keys(d.speakers ?? {}),
  };
}

/** Which trigger first says each line (dialogue timeline order). */
export function lineOwners(d: MissionData): Map<string, string> {
  const out = new Map<string, string>();
  const take = (line: string | undefined, t: string) => { if (line && !out.has(line)) out.set(line, t); };
  for (const t of d.triggers) for (const a of t.do) {
    if (a.a === 'say') take(a.line, t.id);
    if (a.a === 'sayAll') a.lines.forEach(l => take(l, t.id));
    if (a.a === 'cutscene') a.steps.forEach(s => take(s.say, t.id));
  }
  return out;
}
