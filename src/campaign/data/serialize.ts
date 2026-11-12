/**
 * The one way a `.openslop2mission` is written (Mission Builder, tools): 2-space JSON with points, number lists and other short
 * leaf arrays / objects on one line, so files stay small and diffs readable. Key order is kept as given.
 */
const INLINE = 110;

export function stringifyMission(value: unknown): string {
  return fmt(value, '') + '\n';
}

function fmt(v: unknown, ind: string): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  const flat = JSON.stringify(v);
  const leaf = Array.isArray(v) ? v.every(x => x === null || typeof x !== 'object' || isPoint(x)) : Object.values(v as object).every(x => x === null || typeof x !== 'object' || isPoint(x));
  if (leaf && flat.length + ind.length <= INLINE) return spaced(v);
  const next = ind + '  ';
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return `[\n${v.map(x => next + fmt(x, next)).join(',\n')}\n${ind}]`;
  }
  const entries = Object.entries(v as object).filter(([, x]) => x !== undefined);
  if (!entries.length) return '{}';
  return `{\n${entries.map(([k, x]) => `${next}${JSON.stringify(k)}: ${fmt(x, next)}`).join(',\n')}\n${ind}}`;
}

const isPoint = (x: unknown) => Array.isArray(x) && x.length <= 3 && x.every(n => typeof n === 'number');

/** Compact one-line form with a space after commas / colons (`{ "k": "ell", "x": 4 }`, `[1, 2]`). */
function spaced(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(spaced).join(', ')}]`;
  const e = Object.entries(v as object).filter(([, x]) => x !== undefined);
  return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${spaced(x)}`).join(', ')} }` : '{}';
}
