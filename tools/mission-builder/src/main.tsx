import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { MissionData } from '../../../src/campaign/data/MissionData';
import { validateMission, type Issue } from '../../../src/campaign/data/validate';
import { dataLevel } from '../../../src/campaign/data/level';
import { MissionStore, blankMission } from './store';
import { TOOL_VERSIONS } from '../../../src/version';
import { MapView, type Tool } from './MapView';
import { Palette, Inspector, Triggers, Dialogue, Objectives, Problems, MissionPanel } from './Panels';
import type { Pick } from './Fields';

interface MissionInfo { campaign: string; key: string; title: string; order: number; data: boolean; file?: string }
const DIFFICULTIES = [['easy', 'Casual'], ['normal', 'Normal'], ['hard', 'Hard'], ['insane', 'Brutal']] as const;

function useStore(store: MissionStore | null) {
  useSyncExternalStore(store?.subscribe ?? (() => () => {}), store?.getVersion ?? (() => 0));
}

function App() {
  const [list, setList] = useState<MissionInfo[]>([]);
  const [gameUrl, setGameUrl] = useState('http://localhost:5200');
  const [store, setStore] = useState<MissionStore | null>(null);
  const [tool, setTool] = useState<Tool>({ t: 'select' });
  const [center, setCenter] = useState<'map' | '3d'>('map');
  const [side, setSide] = useState<'inspector' | 'triggers' | 'dialogue' | 'objectives' | 'problems' | 'mission'>('inspector');
  const [layers, setLayers] = useState<Record<string, boolean>>({ terrain: true, reference: true, grid: false, regions: true, paths: true, units: true, props: true, terrainShapes: false });
  const [diff, setDiff] = useState('normal');
  const [status, setStatus] = useState('');
  const [issues, setIssues] = useState<Issue[] | null>(null); // null = not checked yet
  const [frame, setFrame] = useState(0);
  useStore(store);

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(c => setGameUrl(c.gameUrl)).catch(() => {});
    fetch('/api/missions').then(r => r.json()).then(setList);
  }, []);

  const open = async (m: MissionInfo) => {
    if (store?.dirty && !confirm('Discard unsaved changes?')) return;
    if (!m.data) { setStatus(`${m.title} is still hand-coded (no .openslop2mission yet): read-only`); }
    const d: MissionData = m.data ? await (await fetch(`/api/mission/${m.campaign}/${m.key}`)).json() : codeMissionShell(m);
    const st = new MissionStore(d, !m.data);
    if (!m.data) { // show the hand-coded mission's real map from the game's level list
      const [{ missionOf }, { LEVELS }] = await Promise.all([import('../../../src/campaign/registry'), import('../../../src/levels')]);
      const lv = LEVELS[missionOf(m.campaign, m.key)?.mapId ?? ''];
      if (lv) { st.level = lv; d.map.size = lv.size; d.map.theme = lv.theme as any; }
    }
    setStore(st);
    setTool({ t: 'select' });
    history.replaceState(null, '', `?m=${m.campaign}/${m.key}`);
  };
  useEffect(() => {
    if (store || !list.length) return;
    const want = new URLSearchParams(location.search).get('m') ?? 'wol/liberation_day';
    const m = list.find(x => `${x.campaign}/${x.key}` === want) ?? list.find(x => x.data);
    if (m) open(m);
  }, [list]);

  // validation (debounced) on every change: the same checks as tools/campaign/mapcheck.ts
  useEffect(() => {
    if (!store) return;
    setIssues(null);
    const h = setTimeout(() => {
      try { setIssues(validateMission(store.doc, dataLevel(store.doc))); } catch (e) { setIssues([{ level: 'error', where: 'map', msg: String(e) }]); }
    }, 300);
    return () => clearTimeout(h);
  }, [store, store?.version]);

  const save = async () => {
    if (!store || store.readOnly) return;
    const d = store.doc;
    const r = await fetch(`/api/mission/${d.campaign}/${d.key}`, { method: 'PUT', body: JSON.stringify(d) });
    const j = await r.json();
    if (r.ok) { store.markSaved(); setStatus(`Saved ${j.file} (${(j.bytes / 1024).toFixed(1)} KB)`); setFrame(f => f + 1); fetch('/api/missions').then(x => x.json()).then(setList); }
    else setStatus(`Save failed: ${j.error}`);
    return r.ok;
  };
  const playtest = async () => {
    if (!store) return;
    if (store.dirty && !(await save())) return;
    const d = store.doc;
    window.open(`${gameUrl}/?mission=${d.campaign}/${d.key}&diff=${diff}`, 'sc2-playtest');
  };
  const newMission = () => {
    const campaign = prompt('Campaign id (e.g. wol)', store?.doc.campaign ?? 'wol'); if (!campaign) return;
    const key = prompt('Mission key (lowercase_with_underscores)', 'new_mission'); if (!key || !/^[a-z0-9_]+$/.test(key)) return;
    const title = prompt('Title', 'New Mission') ?? 'New Mission';
    setStore(new MissionStore(blankMission(campaign, key, title)));
    setStatus('New mission: Save writes it next to the other missions. Register it in the campaign index to play it.');
  };
  const exportFile = () => {
    if (!store) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([store.text()], { type: 'application/json' }));
    a.download = `${store.doc.key}.openslop2mission`; a.click(); URL.revokeObjectURL(a.href);
  };
  const importFile = async (f: File) => {
    try { const d = JSON.parse(await f.text()) as MissionData; if (d.version !== 1) throw new Error('not a version 1 mission'); setStore(new MissionStore(d)); setStatus(`Imported ${f.name}: Save writes it to ${d.campaign}/${d.key}`); }
    catch (e) { setStatus(`Import failed: ${(e as Error).message}`); }
  };

  // keyboard: undo / redo / save / delete
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!store) return;
      const mod = e.metaKey || e.ctrlKey;
      const typing = (e.target as HTMLElement).closest('input,textarea,select');
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
      if (typing) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && store.sel) { e.preventDefault(); deleteSelection(store); }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  });
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (store?.dirty) { e.preventDefault(); e.returnValue = ''; } };
    addEventListener('beforeunload', warn); return () => removeEventListener('beforeunload', warn);
  }, [store]);

  const pick: Pick = (label, done) => { setCenter('map'); setTool({ t: 'pick', label, done: p => done(p) }); };
  const jump = (i: Issue) => {
    if (!store) return;
    const m = i.where.match(/^(groups|regions|paths|triggers|dialogue|objectives)\[(\d+)\]/);
    if (!m) return;
    const idx = +m[2]!, d = store.doc;
    if (m[1] === 'groups') { store.select({ kind: 'group', id: d.groups[idx]!.id }); setSide('inspector'); }
    if (m[1] === 'regions') { store.select({ kind: 'region', id: d.regions[idx]!.id }); setSide('inspector'); }
    if (m[1] === 'paths') { store.select({ kind: 'path', id: d.paths[idx]!.id }); setSide('inspector'); }
    if (m[1] === 'triggers') { store.select({ kind: 'trigger', id: d.triggers[idx]!.id }); setSide('triggers'); }
    if (m[1] === 'dialogue') setSide('dialogue');
    if (m[1] === 'objectives') setSide('objectives');
  };
  // selecting on the map shows the inspector; picking a trigger shows triggers
  useEffect(() => { const s = store?.sel; if (s && s.kind !== 'trigger' && side !== 'inspector' && side !== 'problems') setSide('inspector'); }, [store?.sel]);

  const errors = issues?.filter(i => i.level === 'error').length ?? 0, warns = (issues?.length ?? 0) - errors;
  const d = store?.doc;
  const iframeSrc = useMemo(() => d ? `${gameUrl}/?mission=${d.campaign}/${d.key}&diff=${diff}&preview=1&v=${frame}` : '', [d?.campaign, d?.key, gameUrl, diff, frame]);
  return (
    <div className="app">
      <header>
        <b className="brand" title={`OpenSlop II Mission Builder v${TOOL_VERSIONS.missionBuilder}`}>Mission Builder <small style={{ opacity: 0.6, fontWeight: 400 }}>v{TOOL_VERSIONS.missionBuilder}</small></b>
        <select value={d ? `${d.campaign}/${d.key}` : ''} onChange={e => { const m = list.find(x => `${x.campaign}/${x.key}` === e.target.value); if (m) open(m); }}>
          {!d && <option value="">Open a mission…</option>}
          {d && !list.some(x => `${x.campaign}/${x.key}` === `${d.campaign}/${d.key}`) && <option value={`${d.campaign}/${d.key}`}>{d.title} (unsaved)</option>}
          {list.map(m => <option key={`${m.campaign}/${m.key}`} value={`${m.campaign}/${m.key}`}>{m.campaign.toUpperCase()} {m.order}. {m.title}{m.data ? '' : ' (code, read-only)'}</option>)}
        </select>
        <button onClick={newMission}>New</button>
        <label className="btn">Import<input type="file" accept=".openslop2mission,application/json" hidden onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} /></label>
        <button onClick={exportFile} disabled={!store}>Export</button>
        <span className="sep" />
        <button onClick={() => store?.undo()} disabled={!store?.canUndo} title="Ctrl/Cmd+Z">↶ Undo</button>
        <button onClick={() => store?.redo()} disabled={!store?.canRedo} title="Ctrl/Cmd+Shift+Z">↷ Redo</button>
        <button className={store?.dirty ? 'primary' : ''} onClick={save} disabled={!store || store.readOnly} title="Ctrl/Cmd+S">Save{store?.dirty ? ' •' : ''}</button>
        <span className="sep" />
        <select value={diff} onChange={e => setDiff(e.target.value)} title="Difficulty for Playtest and the 3D preview">{DIFFICULTIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className="play" onClick={playtest} disabled={!store || store.readOnly}>▶ Playtest</button>
        <span className="grow" />
        <button className={`issues ${!issues ? '' : errors ? 'bad' : warns ? 'warn' : 'good'}`} onClick={() => setSide('problems')}>{!issues ? 'checking…' : errors ? `✗ ${errors} error${errors > 1 ? 's' : ''}` : '✓ valid'}{warns ? ` · ${warns} warning${warns > 1 ? 's' : ''}` : ''}</button>
      </header>
      {store ? (
        <main>
          <aside className="left"><Palette store={store} tool={tool} setTool={setTool} />
            <h3>Layers</h3>
            <div className="layers">{Object.keys(layers).map(k => <label key={k} className="chk"><input type="checkbox" checked={layers[k]} onChange={e => setLayers({ ...layers, [k]: e.target.checked })} />{k}</label>)}</div>
          </aside>
          <section className="center">
            <div className="tabs"><button className={center === 'map' ? 'on' : ''} onClick={() => setCenter('map')}>Top-down</button><button className={center === '3d' ? 'on' : ''} onClick={() => setCenter('3d')}>3D (game)</button>
              {center === '3d' && <><button onClick={() => setFrame(f => f + 1)}>Reload</button><span className="muted"> Shows the saved file, paused, low graphics. Save to update.</span></>}</div>
            {center === 'map' ? <MapView store={store} tool={tool} setTool={setTool} layers={layers} /> : <iframe className="game" src={iframeSrc} title="3D preview" />}
          </section>
          <aside className="right">
            <div className="tabs">{(['inspector', 'triggers', 'dialogue', 'objectives', 'problems', 'mission'] as const).map(t => <button key={t} className={side === t ? 'on' : ''} onClick={() => setSide(t)}>{t}{t === 'problems' && errors ? ` (${errors})` : ''}</button>)}</div>
            <div className="scroll">
              {side === 'inspector' && <Inspector store={store} pick={pick} />}
              {side === 'triggers' && <Triggers store={store} pick={pick} />}
              {side === 'dialogue' && <Dialogue store={store} />}
              {side === 'objectives' && <Objectives store={store} />}
              {side === 'problems' && (issues ? <Problems issues={issues} onJump={jump} /> : <div className="pad muted">Checking…</div>)}
              {side === 'mission' && <MissionPanel store={store} />}
            </div>
          </aside>
        </main>
      ) : <main className="empty">Loading missions…</main>}
      <footer>{store?.readOnly ? 'Read-only (hand-coded mission). ' : ''}{status}</footer>
    </div>
  );
}

function deleteSelection(store: MissionStore) {
  const s = store.sel!; const id = s.id;
  store.edit(m => {
    if (s.kind === 'group') m.groups = m.groups.filter(x => x.id !== id);
    else if (s.kind === 'region') m.regions = m.regions.filter(x => x.id !== id);
    else if (s.kind === 'path') m.paths = m.paths.filter(x => x.id !== id);
    else if (s.kind === 'decor') m.map.decor = (m.map.decor ?? []).filter(x => x.id !== id);
    else if (s.kind === 'pickup') m.pickups = (m.pickups ?? []).filter(x => x.id !== id);
    else if (s.kind === 'trigger') m.triggers = m.triggers.filter(x => x.id !== id);
    else { const key = { tier: 'tiers', massif: 'massifs', pit: 'pits', road: 'roads', ramp: 'ramps' }[s.kind as 'tier']; if (key) (m.map as any)[key].splice(id as number, 1); }
  });
  store.select(null);
}

/** A hand-coded mission shown read-only: its map comes from the game's level list; the rest is empty until it is converted. */
function codeMissionShell(m: MissionInfo): MissionData {
  const d = blankMission(m.campaign, m.key, m.title);
  d.order = m.order;
  d.map.description = 'Hand-coded mission: map and logic live in TypeScript (read-only here).';
  return d;
}

createRoot(document.getElementById('root')!).render(<App />);
