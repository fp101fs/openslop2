/** Standalone landing page (landing.html): tabs, the Enter-to-play key and the live "Playing now" numbers from the relay's /api/players. */
const BASE: string = (import.meta as any).env?.VITE_PRESENCE_URL ?? '';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// touch devices hide the key hints, like the original
try { if (matchMedia('(pointer: coarse)').matches) document.documentElement.setAttribute('data-touch', ''); } catch { /* */ }

// tabs: every .tabs group controls the sibling panes of its section
for (const group of document.querySelectorAll<HTMLElement>('.tabs.big')) {
  const root = group.parentElement!;
  const tabs = [...group.querySelectorAll<HTMLButtonElement>('.tab')];
  const select = (name: string) => {
    for (const t of tabs) { const on = t.dataset.tab === name; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; }
    for (const p of root.querySelectorAll<HTMLElement>(':scope > .pane')) p.hidden = p.dataset.tab !== name;
  };
  for (const t of tabs) t.addEventListener('click', () => select(t.dataset.tab!));
  group.addEventListener('keydown', e => {
    const i = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
    const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1;
    if (j < 0) return;
    const t = tabs[(j + tabs.length) % tabs.length]; select(t.dataset.tab!); t.focus();
  });
  select(tabs[0].dataset.tab!);
}

window.addEventListener('keydown', e => { if (e.key === 'Enter' && !(e.target as HTMLElement)?.closest?.('a,button,input,select,textarea')) $<HTMLAnchorElement>('play').click(); });

// live numbers
const fmt = (n: number) => n.toLocaleString('en-US');
async function refresh() {
  const note = $('players-note');
  try {
    const r = await fetch(`${BASE}/api/players`, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const d = await r.json() as { total: number; single: number; multi: number };
    $('players-all').textContent = fmt(d.total);
    $('players-single').textContent = fmt(d.single);
    $('players-multi').textContent = fmt(d.multi);
    note.hidden = true;
  } catch {
    for (const id of ['players-all', 'players-single', 'players-multi']) $(id).textContent = '–';
    note.textContent = 'The server is not answering. Numbers will show again when it is back.'; note.hidden = false;
  }
}
void refresh();
setInterval(() => { if (!document.hidden) void refresh(); }, 10_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
