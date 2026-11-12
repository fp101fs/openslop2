import { listSaves, deleteSave, exportSave, importSave, cleanSaveName, saveLocation, type SaveEntry } from '../save/SaveFiles';
import { defaultSaveName } from '../save/SaveState';

type Mode = 'save' | 'load';
type Cat = 'recent' | 'Campaign' | 'Skirmish';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number) => String(n).padStart(2, '0');
/** SC2 list date: `28 Feb 2010 01:47:02`. */
const fmtDate = (ms: number) => { const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };
const fmtClock = (s: number) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return h ? `${h}:${p2(m)}:${p2(s % 60)}` : `${m}:${p2(s % 60)}`; };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * SC2-style SAVE GAME / LOAD GAME screens inside the game menu: category tabs on the left (Recent / Campaign / Skirmish), a NAME / DATE
 * list (click a header to sort), and the action buttons below. Saving asks before overwriting; deleting asks first.
 * Double-click a save to load it (or to save over it). Arrow keys move the selection, Enter confirms, Delete deletes.
 */
export class SaveLoadDialog {
  public readonly el: HTMLDivElement;
  private mode: Mode = 'load';
  private cat: Cat = 'recent';
  private sort: { by: 'name' | 'date'; desc: boolean } = { by: 'date', desc: true };
  private entries: SaveEntry[] = [];
  private selected: string | null = null;
  private busy = false;
  private confirmYes: (() => void) | null = null;

  constructor(host: HTMLElement, private app: () => any, private onBack: () => void) {
    this.el = document.createElement('div');
    this.el.id = 'sc2m-saveload';
    this.el.className = 'sc2o sc2sl';
    this.el.style.display = 'none';
    this.el.innerHTML = `
      <div class="oh"></div>
      <div class="obody">
        <div class="otabs">
          <button class="otab" data-cat="recent">Recent</button>
          <button class="otab" data-cat="Campaign">Campaign</button>
          <button class="otab" data-cat="Skirmish">Skirmish</button>
          <span class="otab-sp"></span>
          <div class="slwhere"></div>
        </div>
        <div class="slpanel">
          <div class="slhead"><button class="slh" data-sort="name">Name</button><button class="slh" data-sort="date">Date</button></div>
          <div class="sllist" tabindex="0"></div>
          <div class="slinfo"></div>
          <div class="slname"><label for="sl-name-input">Name:</label><input id="sl-name-input" type="text" maxlength="80" spellcheck="false" autocomplete="off" /></div>
        </div>
      </div>
      <div class="ofoot">
        <button class="obig" data-act="import">Import</button>
        <button class="obig" data-act="export">Export</button>
        <button class="obig" data-act="delete">Delete</button>
        <button class="obig gold" data-act="ok"></button>
        <button class="obig" data-act="cancel">Cancel</button>
      </div>
      <div class="slconfirm" style="display:none"><div class="slcbox"><p></p><div class="slcbtns"><button class="obig gold" data-act="yes">Yes</button><button class="obig" data-act="no">No</button></div></div></div>
      <input class="slfile" type="file" accept=".openslop2save,.opensc2save" style="display:none" />`;
    host.appendChild(this.el);

    this.el.addEventListener('click', e => {
      e.stopPropagation();
      const t = e.target as HTMLElement;
      const cat = t.closest<HTMLElement>('[data-cat]')?.dataset.cat as Cat | undefined;
      if (cat) { this.cat = cat; this.render(); return; }
      const sort = t.closest<HTMLElement>('[data-sort]')?.dataset.sort as 'name' | 'date' | undefined;
      if (sort) { this.sort = this.sort.by === sort ? { by: sort, desc: !this.sort.desc } : { by: sort, desc: sort === 'date' }; this.render(); return; }
      const row = t.closest<HTMLElement>('.slrow');
      if (row) { this.select(row.dataset.name!); return; }
      const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act) this.action(act);
    });
    this.el.addEventListener('dblclick', e => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.slrow');
      if (row) { this.select(row.dataset.name!); this.action('ok'); }
    });
    // typing a name must not trigger game hotkeys; Enter / Esc / arrows / Delete drive the dialog
    this.el.addEventListener('keydown', e => {
      e.stopPropagation();
      const inInput = (e.target as HTMLElement).tagName === 'INPUT';
      if (this.confirmYes) {
        if (e.key === 'Enter') { e.preventDefault(); this.action('yes'); } else if (e.key === 'Escape') { e.preventDefault(); this.action('no'); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); this.action('cancel'); }
      else if (e.key === 'Enter') { e.preventDefault(); this.action('ok'); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.step(e.key === 'ArrowDown' ? 1 : -1); }
      else if ((e.key === 'Delete' || (e.key === 'Backspace' && !inInput)) && this.mode === 'load') { e.preventDefault(); this.action('delete'); }
    });
    this.el.addEventListener('keyup', e => e.stopPropagation());
    this.nameInput.addEventListener('input', () => {
      const clean = cleanSaveName(this.nameInput.value.replace(/\s/g, '_'));
      if (clean !== this.nameInput.value) this.nameInput.value = clean;
      this.selected = this.entries.some(x => x.name === clean) ? clean : null;
      this.renderSelection();
    });
    this.fileInput.addEventListener('change', () => void this.doImport());
  }

  private get nameInput() { return this.el.querySelector('#sl-name-input') as HTMLInputElement; }
  private get fileInput() { return this.el.querySelector('.slfile') as HTMLInputElement; }

  /** Show the screen (the game menu decides when). */
  public open(mode: Mode) {
    this.mode = mode;
    this.closeConfirm();
    const cfg = this.app()?.world?.matchConfig;
    this.cat = 'recent';
    this.selected = null;
    (this.el.querySelector('.oh') as HTMLElement).textContent = mode === 'save' ? 'Save Game' : 'Load Game';
    (this.el.querySelector('[data-act="ok"]') as HTMLElement).textContent = mode === 'save' ? 'Save' : 'Load';
    this.el.classList.toggle('saving', mode === 'save');
    if (mode === 'save' && cfg) this.nameInput.value = defaultSaveName(cfg);
    void saveLocation().then(w => { (this.el.querySelector('.slwhere') as HTMLElement).textContent = `Files: ${w}`; });
    void this.refresh().then(() => {
      if (mode === 'save') { this.nameInput.focus(); this.nameInput.select(); }
      else (this.el.querySelector('.sllist') as HTMLElement).focus();
    });
    this.render();
  }

  private async refresh() {
    try { this.entries = await listSaves(); }
    catch (e) { this.entries = []; this.toast(`Could not read saved games: ${(e as Error).message}`, true); }
    if (this.mode === 'load' && !this.selected) this.selected = this.visible()[0]?.name ?? null;
    this.render();
  }

  private visible(): SaveEntry[] {
    const list = this.entries.filter(e => this.cat === 'recent' || e.meta.gameType === this.cat);
    const k = this.sort.desc ? -1 : 1;
    return list.sort((a, b) => k * (this.sort.by === 'name' ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.meta.savedAt - b.meta.savedAt));
  }

  private render() {
    this.el.querySelectorAll<HTMLElement>('[data-cat]').forEach(b => b.classList.toggle('on', b.dataset.cat === this.cat));
    this.el.querySelectorAll<HTMLElement>('[data-sort]').forEach(b => {
      b.classList.toggle('on', b.dataset.sort === this.sort.by);
      b.dataset.dir = b.dataset.sort === this.sort.by ? (this.sort.desc ? 'desc' : 'asc') : '';
    });
    this.renderList();
  }

  private renderList() {
    const list = this.visible();
    const box = this.el.querySelector('.sllist') as HTMLElement;
    box.innerHTML = list.length
      ? list.map(e => `<div class="slrow${e.name === this.selected ? ' on' : ''}" data-name="${esc(e.name)}"><span>${esc(e.name)}</span><span>${fmtDate(e.meta.savedAt)}</span></div>`).join('')
      : `<div class="slempty">No saved games</div>`;
    this.renderSelection();
  }

  /** Selection highlight, details line and button states (rows are left in place so a double-click lands on the same row). */
  private renderSelection() {
    const box = this.el.querySelector('.sllist') as HTMLElement;
    box.querySelectorAll<HTMLElement>('.slrow').forEach(r => r.classList.toggle('on', r.dataset.name === this.selected));
    box.querySelector('.slrow.on')?.scrollIntoView({ block: 'nearest' });
    const sel = this.entries.find(e => e.name === this.selected);
    const m = sel?.meta;
    (this.el.querySelector('.slinfo') as HTMLElement).innerHTML = m
      ? `<b>${esc(m.title)}</b><span>${esc(m.gameType)}</span><span>${esc(m.race)} vs ${esc(m.enemyRace)}</span><span>${esc(cap(m.difficulty))}</span><span>Game time ${fmtClock(m.gameTime)}</span>`
      : '';
    const hasSel = !!sel;
    (this.el.querySelector('[data-act="delete"]') as HTMLButtonElement).disabled = !hasSel || this.busy;
    (this.el.querySelector('[data-act="export"]') as HTMLButtonElement).disabled = !hasSel || this.busy;
    (this.el.querySelector('[data-act="ok"]') as HTMLButtonElement).disabled = this.busy || (this.mode === 'load' ? !hasSel : !cleanSaveName(this.nameInput.value));
  }

  private select(name: string) {
    this.selected = name;
    if (this.mode === 'save') this.nameInput.value = name;
    this.renderSelection();
  }

  private step(d: number) {
    const list = this.visible();
    if (!list.length) return;
    const i = list.findIndex(e => e.name === this.selected);
    this.select(list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + d))]!.name);
  }

  private toast(msg: string, err = false) { this.app()?.ui?.showToast(msg, err); }

  private confirm(msg: string, yes: () => void) {
    const c = this.el.querySelector('.slconfirm') as HTMLElement;
    (c.querySelector('p') as HTMLElement).textContent = msg;
    c.style.display = 'flex';
    this.confirmYes = yes;
    (c.querySelector('[data-act="no"]') as HTMLElement).focus();
  }
  private closeConfirm() {
    (this.el.querySelector('.slconfirm') as HTMLElement).style.display = 'none';
    this.confirmYes = null;
  }

  private action(act: string) {
    if (this.busy) return;
    switch (act) {
      case 'yes': { const f = this.confirmYes; this.closeConfirm(); f?.(); break; }
      case 'no': this.closeConfirm(); break;
      case 'cancel': this.onBack(); break;
      case 'import': this.fileInput.value = ''; this.fileInput.click(); break;
      case 'export': if (this.selected) void exportSave(this.selected).catch(e => this.toast(`Export failed: ${(e as Error).message}`, true)); break;
      case 'delete': {
        const name = this.selected;
        if (!name) break;
        this.confirm(`Delete the saved game "${name}"?`, () => void this.run(async () => {
          await deleteSave(name);
          this.selected = null;
          await this.refresh();
        }));
        break;
      }
      case 'ok':
        if (this.mode === 'load') this.doLoad(); else this.doSave();
        break;
    }
  }

  private async run(fn: () => Promise<void>) {
    this.busy = true; this.renderSelection();
    try { await fn(); } catch (e) { this.toast((e as Error).message, true); }
    finally { this.busy = false; this.renderSelection(); }
  }

  private doSave() {
    const name = cleanSaveName(this.nameInput.value);
    if (!name) { this.toast('Enter a name for the saved game', true); return; }
    const go = () => void this.run(async () => {
      const app = this.app();
      const saved = await app.saveGame(name);
      this.onBack();
      if (app.ui.isMenuOpen) app.togglePauseMenu();
      this.toast(`Game saved: ${saved}`);
    });
    if (this.entries.some(e => e.name === name)) this.confirm(`A saved game named "${name}" already exists. Overwrite it?`, go);
    else go();
  }

  private doLoad() {
    const name = this.selected;
    if (!name) return;
    const app = this.app();
    if (app.ui.isMenuOverlayStandalone()) app.ui.closeMenuOverlay();
    app.loadSavedGame(name);
  }

  private async doImport() {
    const files = [...(this.fileInput.files ?? [])];
    if (!files.length) return;
    await this.run(async () => {
      let last = '';
      for (const f of files) last = await importSave(f);
      this.cat = 'recent';
      await this.refresh();
      this.select(last);
      this.toast(files.length > 1 ? `Imported ${files.length} saved games` : `Imported ${last}`);
    });
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
