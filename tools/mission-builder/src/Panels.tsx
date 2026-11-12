import React, { useMemo, useState } from 'react';
import type { MissionData, Trigger, Cond, Action, GroupDef, Behavior, DialogueLine } from '../../../src/campaign/data/MissionData';
import { COND_KINDS, ACTION_KINDS } from '../../../src/campaign/data/MissionData';
import { UNIT_CONFIGS, BUILDING_CONFIGS } from '../../../src/config';
import { entityIconUrl } from '../../../src/ui/IconImages';
import { kitIds } from '../../../src/levels/PropKits';
import '../../../src/levels/CampaignProps';
import { lineKey } from '../../../src/campaign/voiceKey';
import type { Issue } from '../../../src/campaign/data/validate';
import type { Shape } from '../../../src/levels/LevelTypes';
import { CONDS, ACTIONS, summary } from './forms';
import { FieldInput, Num, PerDiffNum, PointInput, Row, Select, Text, clean, type Pick } from './Fields';
import { renameRefs, lineOwners } from './refs';
import type { MissionStore } from './store';
import type { Tool } from './MapView';

// ---------------------------------------------------------------- palette + tools
const RACES = ['terran', 'zerg', 'protoss'] as const;

export function Palette({ store, tool, setTool }: { store: MissionStore; tool: Tool; setTool: (t: Tool) => void }) {
  const [tab, setTab] = useState<'units' | 'buildings' | 'props' | 'markers'>('units');
  const [owner, setOwner] = useState<'enemy' | 'player'>('enemy');
  const [race, setRace] = useState<(typeof RACES)[number]>('terran');
  const [tier, setTier] = useState(1);
  const dragItem = (e: React.DragEvent, item: object) => e.dataTransfer.setData('application/x-mission-item', JSON.stringify(item));
  const items = tab === 'units' ? Object.entries(UNIT_CONFIGS).filter(([, s]: any) => s.race === race).map(([k, s]: any) => ({ k, name: s.name }))
    : tab === 'buildings' ? Object.entries(BUILDING_CONFIGS).filter(([, s]: any) => s.race === race).map(([k, s]: any) => ({ k, name: s.name }))
    : tab === 'props' ? kitIds().map(k => ({ k, name: k.replace(/_/g, ' ') })) : [];
  const toolBtn = (label: string, t: Tool, title?: string) => (
    <button type="button" title={title} className={JSON.stringify(tool) === JSON.stringify(t) ? 'on' : ''} onClick={() => setTool(t)}>{label}</button>
  );
  return (
    <div className="palette">
      <h3>Tools</h3>
      <div className="tools">
        {toolBtn('Select', { t: 'select' }, 'Select / move (drag empty map to pan)')}
        {toolBtn('▭ Region', { t: 'region', shape: 'rect' })}{toolBtn('◯ Region', { t: 'region', shape: 'ell' })}{toolBtn('⬠ Region', { t: 'region', shape: 'poly' })}
        {toolBtn('Path', { t: 'path' }, 'Click points, double-click to finish')}
      </div>
      <h3>Terrain <small>tier <input className="tiny" type="number" min={0} max={4} value={tier} onChange={e => setTier(+e.target.value)} /></small></h3>
      <div className="tools">
        {toolBtn('▭ Ground', { t: 'terrain', op: 'tier', shape: 'rect', tier })}{toolBtn('◯ Ground', { t: 'terrain', op: 'tier', shape: 'ell', tier })}{toolBtn('⬠ Ground', { t: 'terrain', op: 'tier', shape: 'poly', tier })}
        {toolBtn('⬠ Plaza', { t: 'terrain', op: 'tier', shape: 'poly', tier, plaza: true })}
        {toolBtn('◯ Rock', { t: 'terrain', op: 'massif', shape: 'ell', tier: Math.max(tier, 3) })}{toolBtn('◯ Chasm', { t: 'terrain', op: 'pit', shape: 'ell', tier: 3 })}{toolBtn('◯ Water', { t: 'terrain', op: 'pit', shape: 'ell', tier: 1, liquid: true })}
        {toolBtn('Road', { t: 'road', width: 6, tier }, 'Paved road at this tier (a trench where the ground is higher)')}
        {toolBtn('Ramp', { t: 'ramp', width: 7, t0: Math.max(0, tier - 1), t1: tier }, `Ramp from tier ${Math.max(0, tier - 1)} up to ${tier}`)}
      </div>
      <h3>Palette</h3>
      <div className="tabs small">{(['units', 'buildings', 'props', 'markers'] as const).map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
      {(tab === 'units' || tab === 'buildings') && (
        <div className="pal-opts">
          <Select value={race} options={[...RACES]} onChange={v => v && setRace(v as any)} />
          <Select value={owner} options={['enemy', 'player']} onChange={v => v && setOwner(v as any)} />
        </div>
      )}
      <div className="pal-grid">
        {items.map(it => {
          const url = tab === 'props' ? null : entityIconUrl(it.k);
          return (
            <div key={it.k} className="pal-item" draggable={!store.readOnly} title={`${it.name} (${it.k}) - drag onto the map`}
              onDragStart={e => dragItem(e, { kind: tab === 'units' ? 'unit' : tab === 'buildings' ? 'building' : 'prop', type: it.k, owner })}>
              {url ? <img src={url} alt="" /> : <span className="pal-txt">{it.name.slice(0, 2)}</span>}
              <span>{it.name}</span>
            </div>
          );
        })}
        {tab === 'markers' && <div className="pal-item" draggable onDragStart={e => dragItem(e, { kind: 'pickup', type: 'pallet' })}><span className="pal-txt">▣</span><span>resource pallet</span></div>}
        {tab === 'markers' && (['player', 'enemy'] as const).map(o => (
          <div key={o} className="pal-item" draggable onDragStart={e => dragItem(e, { kind: 'start', type: 'start', owner: o })}>
            <span className={`pal-txt ${o}`}>★</span><span>{o} start point</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- inspector
export function Inspector({ store, pick }: { store: MissionStore; pick: Pick }) {
  const d = store.doc, s = store.sel;
  if (!s) return <div className="muted pad">Select something on the map, or drag a unit, building or prop from the palette.</div>;
  const del = (fn: (m: MissionData) => void) => <button type="button" className="danger" onClick={() => { store.edit(fn); store.select(null); }}>Delete</button>;
  if (s.kind === 'group') {
    const g = d.groups.find(x => x.id === s.id); if (!g) return null;
    const up = (fn: (x: GroupDef) => void) => store.edit(m => fn(m.groups.find(x => x.id === g.id)!));
    return (
      <div className="pad">
        <h3>Group</h3>
        <IdRow store={store} id={g.id} onRename={(m, id) => { m.groups.find(x => x.id === g.id)!.id = id; }} />
        <Row label="Owner"><Select value={g.owner} options={['enemy', 'player']} onChange={v => up(x => { x.owner = v as any; })} /></Row>
        <Row label="Spawn" hint="start = placed when the mission begins; trigger = only by a Spawn / Drop pods action"><Select value={g.spawn} options={['start', 'trigger']} onChange={v => up(x => { x.spawn = v as any; })} /></Row>
        <Row label="At"><PointInput value={g.at} onChange={v => v && up(x => { x.at = v; })} pick={pick} label="group position" /></Row>
        <Row label="Spread"><Num value={g.spread} onChange={v => up(x => { x.spread = v; clean(x); })} /></Row>
        {g.units.map((u, i) => (
          <div className="unit-row" key={i}>
            <div className="unit-head">
              {entityIconUrl(u.type) && <img src={entityIconUrl(u.type)!} alt="" />}
              <Select value={u.type} options={[...Object.keys(UNIT_CONFIGS), ...Object.keys(BUILDING_CONFIGS)]} onChange={v => v && up(x => { x.units[i]!.type = v as any; })} />
              <button type="button" onClick={() => up(x => { x.units.splice(i, 1); })}>×</button>
            </div>
            <Row label="Count"><PerDiffNum value={u.count} onChange={v => up(x => { x.units[i]!.count = v; })} /></Row>
            <Row label="Hit points"><Num value={u.hp} step={10} onChange={v => up(x => { x.units[i]!.hp = v; clean(x.units[i]!); })} /></Row>
            <Row label="Hero name"><Text value={u.hero} onChange={v => up(x => { x.units[i]!.hero = v || undefined; clean(x.units[i]!); })} /></Row>
          </div>
        ))}
        <button type="button" onClick={() => up(x => { x.units.push({ type: 'marine', count: 1 }); })}>+ unit type</button>
        <BehaviorEditor g={g} doc={d} onChange={b => up(x => { x.behavior = b; clean(x); })} />
        <Row label="Not selectable"><input type="checkbox" checked={!!g.scripted} onChange={e => up(x => { x.scripted = e.target.checked || undefined; clean(x); })} /></Row>
        <Row label="Untargetable" hint="Nobody auto-attacks it (cutscene actors)"><input type="checkbox" checked={!!g.untargetable} onChange={e => up(x => { x.untargetable = e.target.checked || undefined; clean(x); })} /></Row>
        <Row label="Deaths counter"><Select value={g.deathStat} options={(d.stats ?? []).map(x => x.id)} allowEmpty onChange={v => up(x => { x.deathStat = v; clean(x); })} /></Row>
        <Row label="Note"><Text value={g.note} long onChange={v => up(x => { x.note = v || undefined; clean(x); })} /></Row>
        {del(m => { m.groups = m.groups.filter(x => x.id !== g.id); })}
      </div>
    );
  }
  if (s.kind === 'region') {
    const r = d.regions.find(x => x.id === s.id); if (!r) return null;
    return (
      <div className="pad">
        <h3>Region</h3>
        <IdRow store={store} id={r.id} onRename={(m, id) => { m.regions.find(x => x.id === r.id)!.id = id; }} />
        <Row label="Name"><Text value={r.name} onChange={v => store.edit(m => { const x = m.regions.find(q => q.id === r.id)!; x.name = v || undefined; clean(x); })} /></Row>
        <ShapeEditor shape={r.shape} onChange={sh => store.edit(m => { m.regions.find(q => q.id === r.id)!.shape = sh; })} />
        {del(m => { m.regions = m.regions.filter(x => x.id !== r.id); })}
      </div>
    );
  }
  if (s.kind === 'path') {
    const p = d.paths.find(x => x.id === s.id); if (!p) return null;
    return (
      <div className="pad">
        <h3>Path</h3>
        <IdRow store={store} id={p.id} onRename={(m, id) => { m.paths.find(x => x.id === p.id)!.id = id; }} />
        <Row label="Test route"><input type="checkbox" checked={d.testRoute === p.id} onChange={e => store.edit(m => { m.testRoute = e.target.checked ? p.id : undefined; clean(m); })} /></Row>
        <div className="muted">{p.pts.length} points. Drag points on the map; select a point list below to edit.</div>
        <div className="list">{p.pts.map((q, i) => (
          <div key={i} className="list-row"><small>{i + 1}</small>
            <PointInput value={q} pick={pick} label={`path point ${i + 1}`} onChange={v => v && store.edit(m => { m.paths.find(x => x.id === p.id)!.pts[i] = v; })} />
            <button type="button" onClick={() => store.edit(m => { m.paths.find(x => x.id === p.id)!.pts.splice(i, 1); })}>×</button>
          </div>))}
          <button type="button" onClick={() => pick('new path point', v => store.edit(m => { m.paths.find(x => x.id === p.id)!.pts.push(v); }))}>+ point</button>
        </div>
        {del(m => { m.paths = m.paths.filter(x => x.id !== p.id); })}
      </div>
    );
  }
  if (s.kind === 'decor') {
    const p = (d.map.decor ?? []).find(x => x.id === s.id); if (!p) return null;
    const up = (fn: (x: any) => void) => store.edit(m => { const x = m.map.decor!.find(q => q.id === p.id)!; fn(x); clean(x); });
    return (
      <div className="pad">
        <h3>Prop</h3>
        <IdRow store={store} id={p.id} onRename={(m, id) => { m.map.decor!.find(x => x.id === p.id)!.id = id; }} />
        <Row label="Kit"><Select value={p.kit} options={kitIds()} onChange={v => v && up(x => { x.kit = v; })} /></Row>
        <Row label="At"><PointInput value={p.at} onChange={v => v && up(x => { x.at = v; })} pick={pick} label="prop position" /></Row>
        <Row label="Turn (rad)"><Num value={p.rot} step={0.1} onChange={v => up(x => { x.rot = v; })} /></Row>
        <Row label="Scale"><Num value={p.scale} step={0.1} onChange={v => up(x => { x.scale = v; })} /></Row>
        <Row label="Variant"><Num value={p.variant} step={1} min={0} onChange={v => up(x => { x.variant = v; })} /></Row>
        <Row label="Blocks (radius)" hint="Unwalkable footprint under the prop"><Num value={p.block} onChange={v => up(x => { x.block = v; })} /></Row>
        <Row label="Note"><Text value={p.note} long onChange={v => up(x => { x.note = v || undefined; })} /></Row>
        {del(m => { m.map.decor = m.map.decor!.filter(x => x.id !== p.id); })}
      </div>
    );
  }
  if (s.kind === 'pickup') {
    const p = (d.pickups ?? []).find(x => x.id === s.id); if (!p) return null;
    const up = (fn: (x: any) => void) => store.edit(m => { const x = m.pickups!.find(q => q.id === p.id)!; fn(x); clean(x); });
    return (
      <div className="pad">
        <h3>Resource pallet</h3>
        <IdRow store={store} id={p.id} onRename={(m, id) => { m.pickups!.find(x => x.id === p.id)!.id = id; }} />
        <Row label="At"><PointInput value={p.at} onChange={v => v && up(x => { x.at = v; })} pick={pick} label="pallet position" /></Row>
        <Row label="Minerals"><Num value={p.minerals} step={25} onChange={v => up(x => { x.minerals = v; })} /></Row>
        <Row label="Gas"><Num value={p.gas} step={25} onChange={v => up(x => { x.gas = v; })} /></Row>
        <Row label="Note"><Text value={p.note} long onChange={v => up(x => { x.note = v || undefined; })} /></Row>
        {del(m => { m.pickups = m.pickups!.filter(x => x.id !== p.id); })}
      </div>
    );
  }
  // terrain pieces (by index)
  const i = s.id as number;
  const key = { tier: 'tiers', massif: 'massifs', pit: 'pits', road: 'roads', ramp: 'ramps', base: 'bases' }[s.kind as 'tier'];
  const item = key ? (d.map as any)[key]?.[i] : undefined;
  if (!item) return null;
  const up = (fn: (x: any) => void) => store.edit(m => fn((m.map as any)[key!][i]));
  return (
    <div className="pad">
      <h3>{s.kind[0]!.toUpperCase() + s.kind.slice(1)} #{i + 1}</h3>
      {(s.kind === 'tier' || s.kind === 'massif' || s.kind === 'pit') && <>
        <Row label={s.kind === 'pit' ? 'Depth' : 'Tier'}><Num value={item[1]} step={1} onChange={v => up(x => { x[1] = v ?? 0; })} /></Row>
        {s.kind === 'tier' && <Row label="Plaza tiles"><input type="checkbox" checked={!!item[2]} onChange={e => up(x => { x[2] = e.target.checked || undefined; if (x[2] === undefined) x.length = 2; })} /></Row>}
        {s.kind === 'pit' && <Row label="Liquid"><input type="checkbox" checked={!!item[2]} onChange={e => up(x => { x[2] = e.target.checked || undefined; if (x[2] === undefined) x.length = 2; })} /></Row>}
        <ShapeEditor shape={item[0]} onChange={sh => up(x => { x[0] = sh; })} />
      </>}
      {s.kind === 'road' && <>
        <Row label="Width"><Num value={item.width} onChange={v => up(x => { x.width = v ?? 6; })} /></Row>
        <Row label="Tier" hint="Blank = paint only"><Num value={item.tier} step={1} onChange={v => up(x => { x.tier = v; clean(x); })} /></Row>
        <Row label="Shoulder" hint="Flat verge each side (needs a tier)"><Num value={item.shoulder} onChange={v => up(x => { x.shoulder = v; clean(x); })} /></Row>
        <div className="muted">{item.pts.length} points (drag them on the map).</div>
      </>}
      {s.kind === 'ramp' && <>
        <Row label="Low end"><PointInput value={item[0]} pick={pick} label="ramp low end" onChange={v => v && up(x => { x[0] = v; })} /></Row>
        <Row label="High end"><PointInput value={item[1]} pick={pick} label="ramp high end" onChange={v => v && up(x => { x[1] = v; })} /></Row>
        <Row label="Width"><Num value={item[2]} onChange={v => up(x => { x[2] = v ?? 6; })} /></Row>
        <Row label="From tier"><Num value={item[3]} step={1} onChange={v => up(x => { x[3] = v ?? 0; })} /></Row>
        <Row label="To tier"><Num value={item[4]} step={1} onChange={v => up(x => { x[4] = v ?? 1; })} /></Row>
      </>}
      <button type="button" className="danger" onClick={() => { store.edit(m => { (m.map as any)[key!].splice(i, 1); }); store.select(null); }}>Delete</button>
    </div>
  );
}

function IdRow({ store, id, onRename }: { store: MissionStore; id: string; onRename: (m: MissionData, id: string) => void }) {
  const [v, setV] = useState(id);
  React.useEffect(() => setV(id), [id]);
  const commit = () => {
    const nid = v.trim().replace(/[^A-Za-z0-9_]/g, '_');
    if (!nid || nid === id) { setV(id); return; }
    store.edit(m => { onRename(m, nid); renameRefs(m, id, nid); });
    store.select({ ...store.sel!, id: nid });
  };
  return <Row label="Id" hint="Renaming updates every trigger that refers to it"><input value={v} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && commit()} /></Row>;
}

function ShapeEditor({ shape, onChange }: { shape: Shape; onChange: (s: Shape) => void }) {
  if (shape.k === 'poly') return <div className="muted">Polygon, {shape.pts.length} points (drag them on the map when selected).</div>;
  const set = (k: string, v: number | undefined) => onChange(clean({ ...shape, [k]: v } as any));
  return <>
    <Row label="Centre"><span className="pt"><Num value={shape.x} onChange={v => set('x', v ?? 0)} /><Num value={shape.y} onChange={v => set('y', v ?? 0)} /></span></Row>
    {shape.k === 'ell' ? <Row label="Radius x / y"><span className="pt"><Num value={shape.rx} onChange={v => set('rx', v ?? 1)} /><Num value={shape.ry} onChange={v => set('ry', v ?? 1)} /></span></Row>
      : <Row label="Width / height"><span className="pt"><Num value={shape.w} onChange={v => set('w', v ?? 1)} /><Num value={shape.h} onChange={v => set('h', v ?? 1)} /></span></Row>}
    <Row label="Turn (rad)"><Num value={shape.rot} step={0.05} onChange={v => set('rot', v)} /></Row>
  </>;
}

function BehaviorEditor({ g, doc, onChange }: { g: GroupDef; doc: MissionData; onChange: (b: Behavior | undefined) => void }) {
  const b = g.behavior;
  return <>
    <Row label="Behaviour"><Select value={b?.kind ?? 'none'} options={['none', 'hold', 'guard', 'patrol', 'attackMove', 'follow']} onChange={k => onChange(
      k === 'hold' ? { kind: 'hold' } : k === 'guard' ? { kind: 'guard', region: doc.regions[0]?.id ?? '' } : k === 'patrol' || k === 'attackMove' ? { kind: k, path: doc.paths[0]?.id ?? '' }
        : k === 'follow' ? { kind: 'follow', leader: doc.groups[0]?.id ?? '', scripted: true } : undefined)} /></Row>
    {b?.kind === 'guard' && <Row label="Region"><Select value={b.region} options={doc.regions.map(r => r.id)} onChange={v => onChange({ ...b, region: v ?? '' })} /></Row>}
    {(b?.kind === 'patrol' || b?.kind === 'attackMove') && <Row label="Path"><Select value={b.path} options={doc.paths.map(r => r.id)} onChange={v => onChange({ ...b, path: v ?? '' })} /></Row>}
    {b?.kind === 'follow' && <>
      <Row label="Leader"><Select value={b.leader} options={doc.groups.map(r => r.id)} onChange={v => onChange({ ...b, leader: v ?? '' })} /></Row>
      <Row label="Not selectable"><input type="checkbox" checked={!!b.scripted} onChange={e => onChange({ ...b, scripted: e.target.checked })} /></Row>
    </>}
  </>;
}

// ---------------------------------------------------------------- triggers
export function Triggers({ store, pick }: { store: MissionStore; pick: Pick }) {
  const d = store.doc;
  const selId = store.sel?.kind === 'trigger' ? store.sel.id as string : null;
  const t = d.triggers.find(x => x.id === selId);
  const up = (fn: (x: Trigger) => void) => store.edit(m => { const x = m.triggers.find(q => q.id === selId)!; fn(x); clean(x); });
  const add = () => store.edit(m => { const id = store.freshId('trigger'); m.triggers.push({ id, when: { k: 'enter', region: m.regions[0]?.id ?? '', who: 'player' }, do: [] }); store.sel = { kind: 'trigger', id }; });
  return (
    <div className="split">
      <div className="trig-list">
        {d.triggers.map((x, i) => (
          <div key={x.id} className={`trig ${x.id === selId ? 'on' : ''}`} onClick={() => store.select({ kind: 'trigger', id: x.id })}>
            <div className="trig-id">{i + 1}. {x.id}{x.delay ? <small> +{x.delay}s</small> : null}{x.once === false ? <small> ↻</small> : null}</div>
            <div className="muted ellipsis">when {summary(x.when)}</div>
            <div className="muted ellipsis">→ {x.do.map(a => ACTIONS[a.a].label).join(', ') || 'nothing'}</div>
          </div>
        ))}
        <button type="button" onClick={add}>+ trigger</button>
      </div>
      {t ? (
        <div className="trig-form pad">
          <IdRow store={store} id={t.id} onRename={(m, id) => { m.triggers.find(x => x.id === t.id)!.id = id; }} />
          <h4>When</h4>
          <CondEditor c={t.when} doc={d} pick={pick} onChange={c => up(x => { x.when = c; })} />
          <h4>Only if <button type="button" onClick={() => up(x => { (x.if ??= []).push({ k: 'objective', id: d.objectives[0]?.id ?? '', status: 'active' }); })}>+</button></h4>
          {(t.if ?? []).map((c, i) => <div key={i} className="boxed"><CondEditor c={c} doc={d} pick={pick} onChange={c2 => up(x => { x.if![i] = c2; })} /><button type="button" onClick={() => up(x => { x.if!.splice(i, 1); if (!x.if!.length) x.if = undefined; })}>remove</button></div>)}
          <Row label="Delay (s)"><Num value={t.delay} onChange={v => up(x => { x.delay = v; })} /></Row>
          <Row label="Repeat" hint="Fire every time the condition becomes true again"><input type="checkbox" checked={t.once === false} onChange={e => up(x => { x.once = e.target.checked ? false : undefined; })} /></Row>
          <h4>Do</h4>
          {t.do.map((a, i) => (
            <div key={i} className="boxed">
              <div className="act-head">
                <Select value={a.a} options={[...ACTION_KINDS]} onChange={k => k && up(x => { x.do[i] = ACTIONS[k as Action['a']].make(); })} />
                <span className="grow" />
                <button type="button" disabled={i === 0} onClick={() => up(x => { [x.do[i - 1], x.do[i]] = [x.do[i]!, x.do[i - 1]!]; })}>↑</button>
                <button type="button" disabled={i === t.do.length - 1} onClick={() => up(x => { [x.do[i + 1], x.do[i]] = [x.do[i]!, x.do[i + 1]!]; })}>↓</button>
                <button type="button" onClick={() => up(x => { x.do.splice(i, 1); })}>×</button>
              </div>
              {ACTIONS[a.a].help && <div className="muted">{ACTIONS[a.a].help}</div>}
              {ACTIONS[a.a].fields.map(fl => <Row key={fl.key} label={fl.label}><FieldInput field={fl} value={(a as any)[fl.key]} doc={d} pick={pick} onChange={v => up(x => { (x.do[i] as any)[fl.key] = v; clean(x.do[i] as any); })} /></Row>)}
            </div>
          ))}
          <Select value={undefined} options={[...ACTION_KINDS]} onChange={k => k && up(x => { x.do.push(ACTIONS[k as Action['a']].make()); })} />
          <Row label="Note"><Text value={t.note} long onChange={v => up(x => { x.note = v || undefined; })} /></Row>
          <button type="button" className="danger" onClick={() => { store.edit(m => { m.triggers = m.triggers.filter(x => x.id !== t.id); }); store.select(null); }}>Delete trigger</button>
        </div>
      ) : <div className="muted pad">Pick a trigger on the left, or add one. A trigger = when (a condition) → do (actions).</div>}
    </div>
  );
}

function CondEditor({ c, doc, pick, onChange }: { c: Cond; doc: MissionData; pick: Pick; onChange: (c: Cond) => void }) {
  return <>
    <Row label="Condition"><Select value={c.k} options={[...COND_KINDS]} onChange={k => k && onChange(CONDS[k as Cond['k']].make())} /></Row>
    <div className="muted">{CONDS[c.k].help}</div>
    {CONDS[c.k].fields.map(fl => <Row key={fl.key} label={fl.label}><FieldInput field={fl} value={(c as any)[fl.key]} doc={doc} pick={pick} onChange={v => onChange(clean({ ...c, [fl.key]: v } as any))} /></Row>)}
  </>;
}

// ---------------------------------------------------------------- dialogue timeline
const SPEAKER_COLS = ['#5cc8ff', '#7ee07e', '#ff8f6b', '#d9a3ff', '#ffd54a', '#6bf0d0', '#ff6bb5', '#b0b8c0'];
export const lineSec = (l: { text: string; sec?: number }) => l.sec ?? Math.min(8, Math.max(2.5, l.text.length / 14));

export function Dialogue({ store }: { store: MissionStore }) {
  const d = store.doc;
  const owners = useMemo(() => lineOwners(d), [d]);
  const speakers = Object.keys(d.speakers ?? {});
  const col = (sp: string) => SPEAKER_COLS[speakers.indexOf(sp) % SPEAKER_COLS.length] ?? '#999';
  const up = (id: string, fn: (l: DialogueLine) => void) => store.edit(m => { const l = m.dialogue.find(x => x.id === id)!; fn(l); clean(l); });
  const play = async (l: DialogueLine) => {
    const a = new Audio(`/audio/voices/campaign/${lineKey(l.text)}.mp3`);
    try { await a.play(); } catch { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(l.text)); }
  };
  // lines in trigger order (the order the mission plays them), then lines nothing says
  const byTrigger = d.triggers.map(t => ({ t, lines: d.dialogue.filter(l => owners.get(l.id) === t.id) })).filter(x => x.lines.length);
  const orphan = d.dialogue.filter(l => !owners.has(l.id));
  const lineRow = (l: DialogueLine) => (
    <div key={l.id} className="line" style={{ borderLeftColor: col(l.speaker) }}>
      <div className="line-head">
        <Select value={l.speaker} options={speakers} onChange={v => v && up(l.id, x => { x.speaker = v; })} />
        <code>{l.id}</code>
        <span className="bar" style={{ width: `${lineSec(l) * 12}px`, background: col(l.speaker) }} title={`${lineSec(l).toFixed(1)} s on screen`} />
        <small className="muted">{lineSec(l).toFixed(1)}s</small>
        <span className="grow" />
        <Select value={l.source} options={['paraphrase', 'exact', 'UNVERIFIED']} allowEmpty onChange={v => up(l.id, x => { x.source = v as any; })} />
        <button type="button" title="Play (generated clip, else browser speech)" onClick={() => play(l)}>▶</button>
        <button type="button" onClick={() => store.edit(m => { m.dialogue = m.dialogue.filter(x => x.id !== l.id); })}>×</button>
      </div>
      <Text value={l.text} long onChange={v => up(l.id, x => { x.text = v; })} />
    </div>
  );
  return (
    <div className="pad dialogue">
      <h3>Speakers</h3>
      <div className="speakers">
        {speakers.map(sp => {
          const s = d.speakers[sp]!;
          const set = (patch: object) => store.edit(m => { m.speakers[sp] = clean({ ...m.speakers[sp]!, ...patch } as any); });
          return (
            <div key={sp} className="speaker" style={{ borderColor: col(sp) }}>
              <code>{sp}</code>
              <Text value={s.name} onChange={v => set({ name: v })} placeholder="Name" />
              <Text value={s.voice} onChange={v => set({ voice: v })} placeholder="Kokoro voice" />
              <Select value={s.unit} options={Object.keys(UNIT_CONFIGS)} allowEmpty onChange={v => set({ unit: v })} />
              <Text value={s.portrait} onChange={v => set({ portrait: v || undefined })} placeholder="portrait (public/...)" />
              <Select value={s.team} options={['player', 'enemy']} allowEmpty onChange={v => set({ team: v })} />
            </div>
          );
        })}
        <button type="button" onClick={() => store.edit(m => { const id = `speaker${Object.keys(m.speakers).length + 1}`; m.speakers[id] = { name: 'New speaker', voice: 'am_adam' }; })}>+ speaker</button>
      </div>
      <h3>Timeline <small className="muted">(in trigger order; bars = time on screen)</small></h3>
      {byTrigger.map(({ t, lines }) => (
        <div key={t.id} className="tl-group">
          <div className="tl-trig" onClick={() => store.select({ kind: 'trigger', id: t.id })}>{t.id} <span className="muted">when {summary(t.when)}{t.delay ? ` +${t.delay}s` : ''}</span></div>
          {lines.map(lineRow)}
        </div>
      ))}
      {orphan.length > 0 && <div className="tl-group"><div className="tl-trig warn">Not spoken by any trigger</div>{orphan.map(lineRow)}</div>}
      <button type="button" onClick={() => store.edit(m => { const id = store.freshId('line'); m.dialogue.push({ id, speaker: speakers[0] ?? 'speaker1', text: '' }); })}>+ line</button>
    </div>
  );
}

// ---------------------------------------------------------------- objectives
export function Objectives({ store }: { store: MissionStore }) {
  const d = store.doc;
  const up = (i: number, fn: (o: any) => void) => store.edit(m => { fn(m.objectives[i]); clean(m.objectives[i] as any); });
  const vis = (k: string) => d.objectives.filter(o => o.kind === k);
  return (
    <div className="pad">
      <div className="obj-preview">
        {(['primary', 'bonus'] as const).map(k => vis(k).length ? <div key={k}><div className={`o-head ${k}`}>▸ {k === 'primary' ? 'Main Objectives' : 'Bonus Objectives'}</div>
          {vis(k).map(o => <div key={o.id} className={`o-row ${o.hidden ? 'hidden' : ''}`}><span className="o-box" />{o.text}{o.target ? ` (0/${o.target})` : ''}{o.hidden ? <small> hidden at start</small> : null}</div>)}</div> : null)}
      </div>
      {d.objectives.map((o, i) => (
        <div key={i} className="boxed">
          <Row label="Id" hint="Renaming updates every trigger that refers to it"><Text value={o.id} onChange={v => store.edit(m => { renameRefs(m, m.objectives[i]!.id, v); m.objectives[i]!.id = v; })} /></Row>
          <Row label="Text"><Text value={o.text} onChange={v => up(i, x => { x.text = v; })} /></Row>
          <Row label="Kind"><Select value={o.kind} options={['primary', 'bonus']} onChange={v => up(i, x => { x.kind = v; })} /></Row>
          <Row label="Count to"><Num value={o.target} step={1} onChange={v => up(i, x => { x.target = v; })} /></Row>
          <Row label="Passive" hint="Done when the other primaries are (e.g. 'Raynor must survive')"><input type="checkbox" checked={!!o.passive} onChange={e => up(i, x => { x.passive = e.target.checked || undefined; })} /></Row>
          <Row label="Hidden at start"><input type="checkbox" checked={!!o.hidden} onChange={e => up(i, x => { x.hidden = e.target.checked || undefined; })} /></Row>
          <button type="button" className="danger" onClick={() => store.edit(m => { m.objectives.splice(i, 1); })}>Delete</button>
        </div>
      ))}
      <button type="button" onClick={() => store.edit(m => { m.objectives.push({ id: store.freshId('objective'), text: 'New objective', kind: 'primary' }); })}>+ objective</button>
    </div>
  );
}

// ---------------------------------------------------------------- problems
export function Problems({ issues, onJump }: { issues: Issue[]; onJump: (i: Issue) => void }) {
  if (!issues.length) return <div className="pad ok">✓ No problems found.</div>;
  return (
    <div className="pad problems">
      {issues.map((i, k) => (
        <div key={k} className={`issue ${i.level}`} onClick={() => onJump(i)}>
          <b>{i.level === 'error' ? '✗' : '!'}</b> <code>{i.where}</code> {i.msg}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- mission settings
export function MissionPanel({ store }: { store: MissionStore }) {
  const d = store.doc;
  const set = (fn: (m: MissionData) => void) => store.edit(m => { fn(m); clean(m); clean(m.map); });
  const ri = d.map.refImage;
  const listEdit = (label: string, v: string[] | undefined, fn: (m: MissionData, v: string[] | undefined) => void) => (
    <Row label={label}><Text long value={(v ?? []).join('\n')} onChange={s => set(m => fn(m, s.trim() ? s.split('\n') : undefined))} /></Row>
  );
  return (
    <div className="pad">
      <h3>Mission</h3>
      <Row label="Title"><Text value={d.title} onChange={v => set(m => { m.title = v; })} /></Row>
      <Row label="Subtitle"><Text value={d.subtitle} onChange={v => set(m => { m.subtitle = v; })} /></Row>
      <Row label="Chapter"><Text value={d.chapter} onChange={v => set(m => { m.chapter = v; })} /></Row>
      <Row label="Order"><Num value={d.order} step={1} onChange={v => set(m => { m.order = v ?? 1; })} /></Row>
      <Row label="Briefing"><Text long value={d.briefing} onChange={v => set(m => { m.briefing = v; })} /></Row>
      <Row label="Research doc"><Text value={d.spec} onChange={v => set(m => { m.spec = v; })} /></Row>
      <Row label="Player / enemy"><span className="pt"><Select value={d.playerFaction} options={[...RACES]} onChange={v => set(m => { m.playerFaction = v as any; })} /><Select value={d.enemyFaction} options={[...RACES]} onChange={v => set(m => { m.enemyFaction = v as any; })} /></span></Row>
      <Row label="No player base"><input type="checkbox" checked={!!d.noPlayerBase} onChange={e => set(m => { m.noPlayerBase = e.target.checked || undefined; })} /></Row>
      <Row label="Minerals / gas"><span className="pt"><Num value={d.startingMinerals} step={50} onChange={v => set(m => { m.startingMinerals = v ?? 0; })} /><Num value={d.startingGas} step={25} onChange={v => set(m => { m.startingGas = v ?? 0; })} /></span></Row>
      <h3>Map</h3>
      <Row label="Size"><Num value={d.map.size} step={8} onChange={v => set(m => { m.map.size = v ?? 128; })} /></Row>
      <Row label="Theme"><Select value={d.map.theme} options={['alien', 'sandstone', 'marsara', 'canyon', 'meadow', 'frost', 'moss', 'swamp']} onChange={v => set(m => { m.map.theme = v as any; })} /></Row>
      <Row label="Base tier"><Num value={d.map.baseTier} step={1} onChange={v => set(m => { m.map.baseTier = v; })} /></Row>
      <h3>Reference image (tracing)</h3>
      <Row label="File"><Text value={ri?.src} placeholder="docs/.../map.jpg" onChange={v => set(m => { m.map.refImage = v ? { x: 0, y: 0, w: m.map.size, h: m.map.size, ...m.map.refImage, src: v } : undefined; })} /></Row>
      {ri && <>
        <Row label="x / y"><span className="pt"><Num value={ri.x} onChange={v => set(m => { m.map.refImage!.x = v ?? 0; })} /><Num value={ri.y} onChange={v => set(m => { m.map.refImage!.y = v ?? 0; })} /></span></Row>
        <Row label="w / h"><span className="pt"><Num value={ri.w} onChange={v => set(m => { m.map.refImage!.w = v ?? 1; })} /><Num value={ri.h} onChange={v => set(m => { m.map.refImage!.h = v ?? 1; })} /></span></Row>
        <Row label="Opacity"><input type="range" min={0} max={1} step={0.05} value={ri.opacity ?? 0.5} onChange={e => set(m => { m.map.refImage!.opacity = +e.target.value; })} /></Row>
      </>}
      <h3>Enemy upgrades</h3>
      {(['casual', 'normal', 'hard', 'brutal'] as const).map(k => {
        const u = (typeof d.enemyUpgrades === 'object' && d.enemyUpgrades && k in d.enemyUpgrades ? (d.enemyUpgrades as any)[k] : {}) ?? {};
        const put = (patch: object) => set(m => { const all = { ...(m.enemyUpgrades as any) }; all[k] = clean({ ...u, ...patch }); if (!Object.keys(all[k]).length) delete all[k]; m.enemyUpgrades = Object.keys(all).length ? all : undefined; });
        return <Row key={k} label={k}><span className="pt" title="infantry armour / weapons, HP scale">
          <Num value={u.infantryArmor} step={1} onChange={v => put({ infantryArmor: v })} /><Num value={u.infantryWeapons} step={1} onChange={v => put({ infantryWeapons: v })} /><Num value={u.hpScale} step={0.1} onChange={v => put({ hpScale: v })} /></span></Row>;
      })}
      <h3>Counters</h3>
      {(d.stats ?? []).map((s, i) => (
        <div key={i} className="list-row">
          <Text value={s.id} onChange={v => set(m => { m.stats![i]!.id = v; })} />
          <Text value={s.label} onChange={v => set(m => { m.stats![i]!.label = v; })} />
          <label className="chk"><input type="checkbox" checked={!!s.showOnVictory} onChange={e => set(m => { m.stats![i]!.showOnVictory = e.target.checked || undefined; clean(m.stats![i]!); })} />on victory</label>
          <Num value={s.of} step={1} onChange={v => set(m => { m.stats![i]!.of = v; clean(m.stats![i]!); })} />
        </div>
      ))}
      <button type="button" onClick={() => set(m => { (m.stats ??= []).push({ id: `stat${(m.stats?.length ?? 0) + 1}`, label: 'Counter' }); })}>+ counter</button>
      <h3>Notes</h3>
      {listEdit('Code hooks', d.hooks, (m, v) => { m.hooks = v; })}
      {listEdit('Gaps', d.gaps, (m, v) => { m.gaps = v; })}
      {listEdit('UNVERIFIED', d.unverified, (m, v) => { m.unverified = v; })}
    </div>
  );
}
