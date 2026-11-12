import React from 'react';
import type { MissionData, PerDiff, Diff } from '../../../src/campaign/data/MissionData';
import { DIFFS } from '../../../src/campaign/data/MissionData';
import type { Pt } from '../../../src/levels/LevelTypes';
import type { Field, FieldType } from './forms';
import { refOptions } from './refs';

/** Small form controls shared by the Mission Builder panels. `pick` asks the map for a point (click to place). */
export type Pick = (label: string, done: (p: Pt) => void) => void;

export function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="row" title={hint}><span className="row-l">{label}</span><span className="row-v">{children}</span></label>;
}

export function Num({ value, onChange, step = 0.5, min }: { value: number | undefined; onChange: (v: number | undefined) => void; step?: number; min?: number }) {
  return <input type="number" step={step} min={min} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? undefined : +e.target.value)} />;
}

export function Text({ value, onChange, long, placeholder }: { value: string | undefined; onChange: (v: string) => void; long?: boolean; placeholder?: string }) {
  return long ? <textarea rows={3} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    : <input value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />;
}

export function Select({ value, options, onChange, allowEmpty }: { value: string | undefined; options: string[]; onChange: (v: string | undefined) => void; allowEmpty?: boolean }) {
  const opts = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value || undefined)}>
      {(allowEmpty || !value) && <option value="">—</option>}
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export function PointInput({ value, onChange, pick, label }: { value: Pt | undefined; onChange: (p: Pt | undefined) => void; pick: Pick; label: string }) {
  const v = value ?? [0, 0];
  return (
    <span className="pt">
      <Num value={value?.[0]} onChange={x => onChange([x ?? 0, v[1]])} />
      <Num value={value?.[1]} onChange={y => onChange([v[0], y ?? 0])} />
      <button type="button" title="Click the map to set" onClick={() => pick(label, onChange)}>⌖</button>
    </span>
  );
}

/** Per-difficulty value: one number for all, or Casual / Normal / Hard / Brutal. */
export function PerDiffNum({ value, onChange }: { value: PerDiff<number>; onChange: (v: PerDiff<number>) => void }) {
  const split = typeof value === 'object';
  const m = (split ? value : {}) as Partial<Record<Diff, number>>;
  return (
    <span className="perdiff">
      <label className="chk"><input type="checkbox" checked={split} onChange={e => onChange(e.target.checked ? { casual: value as number, normal: value as number, hard: value as number, brutal: value as number } : (m.normal ?? 1))} />per difficulty</label>
      {!split ? <Num value={value as number} step={1} min={0} onChange={v => onChange(v ?? 0)} />
        : DIFFS.map(k => <span key={k} className="pd"><small>{k[0]!.toUpperCase()}</small><Num value={m[k]} step={1} min={0} onChange={v => onChange({ ...m, [k]: v })} /></span>)}
    </span>
  );
}

/** One field of a condition / action form. */
export function FieldInput({ field, value, onChange, doc, pick }: { field: Field; value: any; onChange: (v: any) => void; doc: MissionData; pick: Pick }) {
  const o = refOptions(doc);
  const t: FieldType = field.type;
  if (typeof t === 'object') return <Select value={value} options={t.enum} onChange={onChange} allowEmpty={field.optional} />;
  switch (t) {
    case 'num': return <Num value={value} onChange={onChange} />;
    case 'text': return <Text value={value} onChange={onChange} />;
    case 'longtext': return <Text value={value} onChange={onChange} long />;
    case 'bool': return <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />;
    case 'pt': return <PointInput value={value} onChange={onChange} pick={pick} label={field.label} />;
    case 'json': return <Text value={value === undefined ? '' : JSON.stringify(value)} onChange={s => { try { onChange(s ? JSON.parse(s) : undefined); } catch { /* keep typing */ } }} />;
    case 'group': return <Select value={value} options={o.group} onChange={onChange} allowEmpty={field.optional} />;
    case 'unit': return <UnitRef value={value} groups={o.group} onChange={onChange} />;
    case 'who': return <Select value={value} options={['player', 'enemy', ...o.group]} onChange={onChange} allowEmpty />;
    case 'region': return <Select value={value} options={o.region} onChange={onChange} allowEmpty={field.optional} />;
    case 'path': return <Select value={value} options={o.path} onChange={onChange} allowEmpty={field.optional} />;
    case 'line': return <Select value={value} options={o.line} onChange={onChange} />;
    case 'objective': return <Select value={value} options={o.objective} onChange={onChange} />;
    case 'trigger': return <Select value={value} options={o.trigger} onChange={onChange} />;
    case 'stat': return <Select value={value} options={o.stat} onChange={onChange} />;
    case 'hook': return <Select value={value} options={o.hook} onChange={onChange} />;
    case 'lines': return <LineList value={value ?? []} options={o.line} onChange={onChange} doc={doc} />;
    case 'steps': return <Steps value={value ?? []} onChange={onChange} doc={doc} pick={pick} />;
  }
}

/** A group, or one unit of it (`group#2`). */
function UnitRef({ value, groups, onChange }: { value: string | undefined; groups: string[]; onChange: (v: string | undefined) => void }) {
  const [g, n] = (value ?? '').split('#');
  return (
    <span className="unitref">
      <Select value={g || undefined} options={groups} onChange={x => onChange(x ? (n ? `${x}#${n}` : x) : undefined)} />
      <input className="idx" placeholder="all" title="Unit number (blank = the whole group)" value={n ?? ''} onChange={e => onChange(e.target.value ? `${g}#${e.target.value}` : g)} />
    </span>
  );
}

function LineList({ value, options, onChange, doc }: { value: string[]; options: string[]; onChange: (v: string[]) => void; doc: MissionData }) {
  return (
    <div className="list">
      {value.map((l, i) => (
        <div key={i} className="list-row">
          <Select value={l} options={options} onChange={x => onChange(value.map((y, j) => (j === i ? x ?? '' : y)))} />
          <span className="muted ellipsis">{doc.dialogue.find(d => d.id === l)?.text}</span>
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <Select value={undefined} options={options} onChange={x => x && onChange([...value, x])} />
    </div>
  );
}

function Steps({ value, onChange, doc, pick }: { value: any[]; onChange: (v: any[]) => void; doc: MissionData; pick: Pick }) {
  const o = refOptions(doc);
  const set = (i: number, patch: any) => onChange(value.map((s, j) => (j === i ? clean({ ...s, ...patch }) : s)));
  return (
    <div className="list steps">
      {value.map((s, i) => (
        <div key={i} className="step">
          <div className="step-head"><b>Step {i + 1}</b><button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button></div>
          <Row label="Wait (s)"><Num value={s.wait} onChange={v => set(i, { wait: v ?? 1 })} /></Row>
          <Row label="Camera"><PointInput value={s.camera} onChange={v => set(i, { camera: v })} pick={pick} label="cutscene camera" /></Row>
          <Row label="Say"><Select value={s.say} options={o.line} onChange={v => set(i, { say: v })} allowEmpty /></Row>
          <Row label="Move unit"><UnitRef value={s.move?.unit} groups={o.group} onChange={v => set(i, { move: v ? { unit: v, to: s.move?.to ?? [64, 64] } : undefined })} /></Row>
          {s.move && <Row label="… to"><PointInput value={s.move.to} onChange={v => set(i, { move: { ...s.move, to: v } })} pick={pick} label="move target" /></Row>}
          <Row label="Kill unit"><UnitRef value={s.kill?.unit} groups={o.group} onChange={v => set(i, { kill: v ? { ...s.kill, unit: v } : undefined })} /></Row>
          {s.kill && <Row label="… shot by"><UnitRef value={s.kill.by} groups={o.group} onChange={v => set(i, { kill: { ...s.kill, by: v } })} /></Row>}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, { wait: 3 }])}>+ step</button>
    </div>
  );
}

/** Drop undefined keys so saved files stay tidy. */
export function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o)) if ((o as any)[k] === undefined) delete (o as any)[k];
  return o;
}
