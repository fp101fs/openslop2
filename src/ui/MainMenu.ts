import { StarCraftApp } from '../main';
import { LAYOUT, LAYOUTS, MAP_LAYOUT_OF } from '../maps';
import { drawMapPreview } from './MapPreview';
import { preferredSyncMode } from '../net/syncMode';
import { CAMPAIGNS, campaignById } from '../campaign/registry';
import { doneSet, isUnlocked } from '../campaign/progress';
import { SLOTS, ITEMS, loadout, cycle } from '../campaign/campaigns/nco/equipment';
import { CAMPAIGN_MISSIONS, DIFFICULTY_CONFIGS, FACTION_TECH, MAP_CONFIGS } from '../config';
import { DifficultyLevel, FactionType, GameModeType, MapId, MatchConfig } from '../types';
import { Chat } from '../net/Chat';
import { TitleHero, TITLE_HERO } from './TitleHero';
import { UnitHero } from './UnitHero';
import { creditForKind } from '../credits/ModelCredits';
import type { RigKind } from '../graphics/RiggedModels';
import { NetClient, NetTransport, RoomInfo, fetchRooms } from '../net/NetClient';
import { P2PClient, useP2P } from '../net/P2PClient';
import { roomBrowser, BrowserState } from '../net/RoomBrowser';

type Screen = 'home' | 'play';
type Nav = 'campaign' | 'coop' | 'versus' | 'custom' | 'collection' | 'replays';
type Sub = 'training' | 'ai' | 'teams' | '1v1' | 'tournaments' | 'testing';
type LobbyState =
  | { kind: 'browse' }
  | { kind: 'hosting'; code: string; guestName: string | null }
  | { kind: 'guest'; code: string; hostName: string; config: Partial<MatchConfig> };

const FACTIONS: FactionType[] = ['terran', 'zerg', 'protoss'];
const FACTION_ICON: Record<FactionType, string> = { terran: '🛡️', zerg: '🪱', protoss: '🔺' };
/** The in-game unit that stands for each race on the campaign race-select / 1v1 screens. */
/** Phones skip the 3D tank cinematic on the title screen (too heavy): just heading + menu. */
const isPhone = () => { try { return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600; } catch { return false; } };
/** The campaign hub: the four SC2 episodes / packs. `off` = no missions yet (shown greyed out). */
const HUB: { id: string; ep: string; name: string; hero: RigKind; off?: boolean }[] = [
  { id: 'wol', ep: 'Episode I', name: 'Wings of Liberty', hero: 'marine' },
  { id: 'hots', ep: 'Episode II', name: 'Heart of the Swarm', hero: 'queen', off: true },
  { id: 'lotv', ep: 'Episode III', name: 'Legacy of the Void', hero: 'archon', off: true },
  { id: 'nco', ep: 'Mission Packs', name: 'Nova Covert Ops', hero: 'nova' },
];
/** Pedestal figure tweaks: size multiplier, mirroring (marine faces right) and `dy` = push down onto the pedestal (design px). */
const HUB_FIG: Record<string, { z: number; yaw?: number; dy?: number }> = { wol: { z: 1.73, yaw: 0, dy: 42 }, hots: { z: 1.7, yaw: 0 }, lotv: { z: 1.585, yaw: 0 }, nco: { z: 0.9975, yaw: 0 } };
const isNarrow = () => { try { return matchMedia('(max-aspect-ratio: 1/1), (max-height: 520px), (max-width: 1100px)').matches; } catch { return false; } };
const RACE_HERO: Record<FactionType, RigKind> = { terran: 'marine', zerg: 'hydralisk', protoss: 'zealot' };
/** Campaign hero size multipliers per race. */
const RACE_ZOOM: Record<FactionType, number> = { terran: 1.25, zerg: 1.5, protoss: 1.25 };

interface Commander { id: string; name: string; title: string; faction: FactionType; kind: RigKind; level: number; bullets: string[]; units: string[] }
/** Co-op commander roster: each is shown with an existing in-game 3D model. */
const COMMANDERS: Commander[] = [
  { id: 'raynor', name: 'Raynor', title: 'Renegade Commander', faction: 'terran', kind: 'marine', level: 7, bullets: ['Recommended for players of all skill levels', 'Call down elite infantry and command them directly', 'Lead an infantry army backed by strategic support units'], units: ['Marine', 'Marauder', 'Medic', 'Firebat', 'Siege Tank'] },
  { id: 'kerrigan', name: 'Kerrigan', title: 'Queen of Blades', faction: 'zerg', kind: 'queen', level: 5, bullets: ['Recommended for players who like hands-on play', 'Fight alongside your army with devastating abilities', 'Mutate your swarm as the battle unfolds'], units: ['Queen', 'Hydralisk', 'Mutalisk', 'Ultralisk'] },
  { id: 'artanis', name: 'Artanis', title: 'Hierarch of the Daelaam', faction: 'protoss', kind: 'archon', level: 5, bullets: ['Recommended for players of all skill levels', 'Strike from high orbit using devastating abilities', 'Warp your army instantly into battle'], units: ['Zealot', 'Stalker', 'Archon', 'Void Ray'] },
  { id: 'swann', name: 'Swann', title: 'Chief Engineer', faction: 'terran', kind: 'thor', level: 12, bullets: ['Recommended for experienced players', 'Deploy heavy mechanised units and tune their upgrades', 'Build a fortress of turrets and walkers'], units: ['Hellion', 'Goliath', 'Siege Tank', 'Thor'] },
  { id: 'zagara', name: 'Zagara', title: 'Broodmother', faction: 'zerg', kind: 'roach', level: 1, bullets: ['Recommended for aggressive players', 'Swarm the map with cheap, expendable Zerg', 'Overwhelm opponents with sheer numbers'], units: ['Baneling', 'Roach', 'Hydralisk', 'Mutalisk'] },
  { id: 'vorazun', name: 'Vorazun', title: 'Matriarch of the Nerazim', faction: 'protoss', kind: 'stalker', level: 1, bullets: ['Recommended for players who like stealth', 'Cloak your army and strike from the shadows', 'Time-stop zones that hold the enemy in place'], units: ['Stalker', 'Zealot', 'Void Ray'] },
  { id: 'karax', name: 'Karax', title: 'Chief Architect of the Purifiers', faction: 'protoss', kind: 'void_ray', level: 1, bullets: ['Recommended for defensive players', 'Raise cannon and beam defences anywhere', 'Fly a mighty air fleet'], units: ['Void Ray', 'Stalker', 'Zealot'] },
  { id: 'abathur', name: 'Abathur', title: 'Evolution Master', faction: 'zerg', kind: 'viper', level: 1, bullets: ['Recommended for patient strategists', 'Evolve your swarm with a mutation lab', 'Support your allies with powerful buffs'], units: ['Viper', 'Roach', 'Hydralisk'] },
  { id: 'alarak', name: 'Alarak', title: 'Highlord of Ascension', faction: 'protoss', kind: 'zealot', level: 1, bullets: ['Recommended for aggressive players', 'Fast, deadly Tal\'darim strike forces', 'Sacrifice units for devastating power'], units: ['Zealot', 'Stalker', 'Archon'] },
  { id: 'nova', name: 'Nova', title: 'Covert Ops', faction: 'terran', kind: 'marauder', level: 1, bullets: ['Recommended for players who like precision', 'Take out key targets with covert units', 'Call in tactical strikes from orbit'], units: ['Marauder', 'Marine', 'Banshee'] },
  { id: 'stukov', name: 'Stukov', title: 'Infested Admiral', faction: 'terran', kind: 'firebat', level: 1, bullets: ['Recommended for experienced players', 'Command infested Terran forces', 'Mix infantry and air for combined arms'], units: ['Firebat', 'Banshee', 'Marine'] },
  { id: 'dehaka', name: 'Dehaka', title: 'Primal Pack Leader', faction: 'zerg', kind: 'ultralisk', level: 1, bullets: ['Recommended for hands-on players', 'Gather essence from fallen foes to grow stronger', 'Evolve with every kill'], units: ['Ultralisk', 'Roach', 'Hydralisk'] }
];

/**
 * Full-screen front end: Campaign mission select, Skirmish setup (faction / map / difficulty)
 * and Multiplayer (host / find / quick-match / join-by-code / share invite link).
 */
export class MainMenu {
  private app: StarCraftApp;
  private el: HTMLElement;
  private screen: Screen = 'home';
  private nav: Nav = 'versus';
  private sub: Sub = 'ai';
  private rightTab: 'maps' | 'enemy' = 'maps';
  private selMission = 1;
  /** 'classic' = the three race campaigns; otherwise a pathway campaign id from src/campaign/registry. */
  private campaignPath = 'wol';
  private selPathMission = '';
  /** Desktop: false = the four-episode hub, true = the chosen campaign's mission screen. */
  private campaignPicked = false;
  private pathChapter = '';
  private randomPlayer = false;
  private clockTimer: number | null = null;
  public isOpen = true;

  // Skirmish / host setup state
  private skirmish = {
    playerFaction: 'terran' as FactionType,
    enemyFaction: 'zerg' as FactionType,
    mapId: 'sector_vanguard' as MapId,
    difficulty: 'normal' as DifficultyLevel
  };
  private mp = {
    mode: 'multiplayer_pvp' as GameModeType,
    faction: 'terran' as FactionType,
    enemyFaction: 'zerg' as FactionType,
    mapId: 'sector_vanguard' as MapId,
    difficulty: 'normal' as DifficultyLevel,
    isPublic: true,
    gameName: MainMenu.loadGameName()
  };
  private campaignDifficulty: DifficultyLevel | 'default' = 'default';
  private campaignRace: FactionType = 'terran';
  private cmdr = 'raynor';
  private coopTab: 'info' | 'units' | 'lobby' = 'info';
  private oneRandom = false;
  private oneTab: 'games' | 'code' | 'maps' = 'games';
  private lobby: LobbyState = { kind: 'browse' };
  private rooms: RoomInfo[] = [];
  private roomsPhase: BrowserState['phase'] = 'loading';
  private roomsSource: BrowserState['source'] = 'api';
  private roomUnsub: (() => void) | null = null;
  private refreshUnsub: (() => void) | null = null;
  /** Non-null while a create / join / quick-match request is in flight: drives the spinner row and disables the buttons. */
  private busy: string | null = null;
  private busySeq = 0;
  private busySlow = false;
  private codeOpen = false;
  /** Public game list health for the game being hosted: null = still registering, true = visible, false = retrying. */
  private listingOk: boolean | null = null;
  private rf = MainMenu.loadFilters();
  private roomTimer: number | null = null;
  private client: NetTransport | null = null;
  private status = '';
  private playerName = 'Commander';

  private static loadFilters(): { sort: 'ping' | 'newest'; map: string; openOnly: boolean } {
    const d = { sort: 'ping' as 'ping' | 'newest', map: 'all', openOnly: false };
    try {
      const j = JSON.parse(localStorage.getItem('sc2_room_filters') || '{}');
      return { sort: j.sort === 'newest' ? 'newest' : 'ping', map: typeof j.map === 'string' ? j.map : 'all', openOnly: !!j.openOnly };
    } catch { return d; }
  }
  private saveFilters() { try { localStorage.setItem('sc2_room_filters', JSON.stringify(this.rf)); } catch {} }
  private static loadGameName(): string { try { return localStorage.getItem('sc2_game_name') || ''; } catch { return ''; } }

  constructor(app: StarCraftApp, parent: HTMLElement) {
    this.app = app;
    try {
      this.playerName = localStorage.getItem('sc2_player_name') || 'Commander' + Math.floor(Math.random() * 90 + 10);
    } catch {
      this.playerName = 'Commander';
    }
    // Map layouts are fixed per page load, so picking a map of another size reloads the page; this restores the screen afterwards
    try {
      const r = sessionStorage.getItem('sc2_resume_menu');
      if (r) {
        sessionStorage.removeItem('sc2_resume_menu');
        const o = JSON.parse(r);
        this.screen = 'play'; this.nav = o.nav; this.sub = o.sub;
        this.mp.mapId = o.mapId; this.mp.mode = o.mode; this.mp.faction = o.faction; this.oneRandom = !!o.oneRandom; this.mp.difficulty = o.difficulty ?? 'normal';
        this.oneTab = 'maps';
      }
    } catch { /* ignore */ }
    this.el = document.createElement('div');
    this.el.id = 'main-menu';
    this.el.className = 'main-menu';
    parent.appendChild(this.el);
    this.el.addEventListener('click', e => this.onClick(e));
    this.el.addEventListener('change', e => this.onChange(e));
    this.el.addEventListener('input', e => this.onInput(e));
    this.render();

    // Invite links: ?join=ABCD opens the multiplayer tab and joins right away
    let rejoin: string | null = null;
    try { rejoin = sessionStorage.getItem('sc2_rejoin'); sessionStorage.removeItem('sc2_rejoin'); } catch { /* ignore */ }
    const code = new URLSearchParams(location.search).get('join') || rejoin;
    if (code) {
      this.screen = 'play';
      this.nav = 'versus';
      this.sub = '1v1';
      this.render();
      void this.joinByCode(code);
    }
  }

  // ---------------------------------------------------------------------
  public open() {
    this.isOpen = true;
    this.el.style.display = 'flex';
    this.lobby = { kind: 'browse' };
    this.status = '';
    this.screen = 'home';
    this.render();
    this.app.onMenuOpened();
    this.app.sound.startMenuMusic();
  }

  public close() {
    this.isOpen = false;
    UnitHero.hide();
    this.el.style.display = 'none';
    TitleHero.unmount();
    this.stopRoomPolling();
    this.app.sound.stopMenuMusic();
  }

  /** Called by the app when a match begins so the lobby connection stays open for relaying. */
  public takeClient(): NetTransport | null {
    const c = this.client;
    this.client = null;
    return c;
  }

  // ---------------------------------------------------------------------
  private isMultiplayerView(): boolean {
    return this.screen === 'play' && (this.nav === 'coop' || this.nav === 'custom' || (this.nav === 'versus' && this.sub === '1v1'));
  }

  private static readonly ICONS: Record<string, string> = {
    terran: '<svg viewBox="0 0 64 64"><g fill="rgba(210,235,255,0.16)" stroke="#e6f3ff" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"><path d="M32 5 L39 20 L58 14 L49 33 L32 59 L15 33 L6 14 L25 20 Z"/><path d="M32 15 L32 46 M23 29 L41 29 M27 38 L37 38"/></g></svg>',
    zerg: '<svg viewBox="0 0 64 64"><g fill="none" stroke="#e6f3ff" stroke-width="4.5" stroke-linecap="round"><path d="M34 6 C50 7 58 22 52 36 C46 50 26 52 18 40 C11 29 20 17 31 21 C38 24 38 34 31 35 C27 36 25 32 28 30"/><path d="M14 22 C9 14 13 8 20 7"/></g></svg>',
    protoss: '<svg viewBox="0 0 64 64"><g fill="rgba(210,235,255,0.2)" stroke="#e6f3ff" stroke-width="2.8" stroke-linejoin="round"><path d="M31 4 C27 17 15 20 17 36 C18 46 25 52 32 60 C38 52 46 46 47 36 C49 22 38 18 31 4 Z"/><path d="M31 18 C29 28 23 31 25 40 M33 22 C37 30 40 33 38 42" fill="none"/></g></svg>',
    random: '<svg viewBox="0 0 64 64"><g fill="rgba(210,235,255,0.22)" stroke="#e6f3ff" stroke-width="2.6" stroke-linejoin="round"><path d="M10 20 L32 8 L54 20 L54 44 L32 56 L10 44 Z"/><path d="M10 20 L32 32 L54 20 M32 32 L32 56" fill="none"/></g><g fill="#fff"><circle cx="32" cy="19" r="2.4"/><circle cx="21" cy="38" r="2.4"/><circle cx="25" cy="45" r="2.4"/><circle cx="43" cy="36" r="2.4"/><circle cx="43" cy="46" r="2.4"/><circle cx="48" cy="41" r="2.4"/></g></svg>'
  };

  private emblem(level: number, color: string) {
    return `<svg viewBox="0 0 120 134"><defs><linearGradient id="hx" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd9e6"/><stop offset=".5" stop-color="#6d7f96"/><stop offset="1" stop-color="#2b3a4f"/></linearGradient></defs>
      <path d="M60 4 L112 34 L112 100 L60 130 L8 100 L8 34 Z" fill="url(#hx)" stroke="#e9f2ff" stroke-width="3"/>
      <path d="M60 16 L100 40 L100 94 L60 118 L20 94 L20 40 Z" fill="#06141f" stroke="#10222f" stroke-width="2"/>
      <g fill="${color}" opacity=".85" font-family="monospace" font-size="9"><text x="30" y="46">1 0 1 1 0</text><text x="30" y="60">0 1 0 0 1</text><text x="30" y="74">1 1 0 1 0</text><text x="30" y="88">0 0 1 0 1</text></g>
      <path d="M60 40 L82 52 L82 80 L60 92 L38 80 L38 52 Z" fill="none" stroke="${color}" stroke-width="2.5" opacity=".9"/>
      <text x="60" y="76" text-anchor="middle" font-size="30" font-weight="900" fill="#fff" font-family="Arial">${level}</text></svg>`;
  }

  /** The terrain is built once per page load, so a map with a different layout needs a reload into it (menu state is restored). */
  private reloadIntoMap(id: MapId, rejoin?: string) {
    try {
      sessionStorage.setItem('sc2_boot_map', id);
      sessionStorage.setItem('sc2_resume_menu', JSON.stringify({ nav: this.nav, sub: this.sub, mapId: id, mode: this.mp.mode, faction: this.mp.faction, oneRandom: this.oneRandom, difficulty: this.mp.difficulty }));
      if (rejoin) sessionStorage.setItem('sc2_rejoin', rejoin);
      location.reload();
    } catch { this.status = 'Could not switch map size (storage blocked).'; }
  }

  private mapSize(id: MapId): number { return LAYOUTS[MAP_LAYOUT_OF[id] ?? 'standard']!.size; }

  /** "3D MODEL BY <author>" caption for a hero model (click opens the Attributions screen). */
  private modelBy(kind: RigKind): string {
    const c = creditForKind(kind);
    return c ? `<div class="hcredit" data-act="attrib" title="Open attributions">3D model by <b>${this.escape(c.author)}</b></div>` : '';
  }

  private render() {
    this.el.className = `main-menu sc2s ${this.screen}`;
    const bg = this.screen === 'home'
      ? '<div class="bgfx base"></div><div class="bgfx haze"></div>'
      : '<div class="bgfx base"></div><div class="bgfx stars"></div><div class="planet"></div><div class="bgfx"><div class="heroart"></div></div>';
    this.el.innerHTML = `${bg}<div class="stage">${this.screen === 'home' ? this.renderHome() : this.renderPlay()}</div>`;
    const heroEl = this.el.querySelector<HTMLElement>('.hero');
    if (heroEl && this.isOpen !== false) TitleHero.mount(heroEl); else TitleHero.unmount();
    const h3 = this.el.querySelector<HTMLElement>('.hero3d');
    if (h3 && this.isOpen !== false) { UnitHero.show(h3, h3.dataset.kind as RigKind, { zoom: Number(h3.dataset.zoom) || 1 }); UnitHero.fillPortraits(this.el); } else UnitHero.hide();
    UnitHero.fillFigures(this.el);
    this.bindHubHover();
    this.el.querySelectorAll<HTMLCanvasElement>('canvas.mappreview').forEach(c => drawMapPreview(c, c.dataset.map!));
    if (this.isMultiplayerView() && this.lobby.kind === 'browse') this.startRoomPolling();
    else this.stopRoomPolling();
    this.tickClock();
    if (this.clockTimer === null) this.clockTimer = window.setInterval(() => this.tickClock(), 20000);
  }

  private tickClock() {
    const c = this.el.querySelector('.clock');
    if (c) { const d = new Date(); c.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
  }

  // ---- HOME (title screen) ----
  private renderHome() {
    const btn = (label: string, nav: Nav, sub: Sub = 'ai') => `<button class="sbtn" data-act="go" data-nav="${nav}" data-sub="${sub}">${label}</button>`;
    const resume = this.app.hasActiveMatch();
    return `
      ${isPhone() ? '' : `<div class="hero"></div><div class="herolabels"><div class="hstack"><div class="hname"><span>${TITLE_HERO.race}</span> ${TITLE_HERO.name}</div>${this.modelBy(TITLE_HERO.kind)}</div></div>`}
      <div class="logo" role="img" aria-label="OpenSlop II"><div class="lgimg"></div></div>
      <div class="homenav">
        ${btn('Campaign', 'campaign')}
        ${btn('Single Player', 'versus', 'ai')}
        ${btn('Multiplayer', 'versus', '1v1')}
        ${btn('Co-op', 'coop')}
        ${btn('Custom Games', 'custom')}
        ${resume ? '<button class="sbtn chat green" data-act="resume">▶ Resume Match</button>' : '<button class="sbtn chat" data-act="help">? Game Guide</button>'}
        <button class="sbtn chat" data-act="parity">How Close Are We?</button>
        <button class="sbtn chat" data-act="attrib">Attributions</button>
      </div>
      <div class="news">
        <div class="nh">News &amp; Community</div>
        <div class="nbox">
          <div class="nban"><span>NEW: LOST TEMPLE</span></div>
          <div class="nbody"><b>240×240 four-corner classic</b><p>Fight across the new 2x map in Skirmish - corner high-ground mains, a ring of naturals and a central temple of mesas.</p></div>
        </div>
        <div class="nfoot">Now with touch controls for iPad - drag to pan, two fingers to box-select.</div>
      </div>
      <div class="profbar"><div class="avatar"></div><div><div class="pn">${this.escape(this.playerName)}</div><div class="ps">Ready for battle</div></div></div>
      <div class="botright"><span class="menubtn" data-act="loadgame">LOAD GAME</span><span class="menubtn" data-act="options">MENU</span></div>`;
  }

  // ---- PLAY (versus / campaign / co-op / custom ...) ----
  private renderPlay() {
    const navBtn = (n: Nav, label: string, live = true) =>
      `<button class="navbtn ${this.nav === n && live ? 'on' : ''} ${live ? '' : 'dis'}" data-act="${live ? 'nav' : 'noop'}" data-v="${n}" ${live ? '' : 'disabled aria-disabled="true" title="Not available yet"'}>${label}</button>`;
    const subBtn = (sub: Sub, label: string, live = true) =>
      `<button class="subbtn ${this.sub === sub && live ? 'on' : ''} ${live ? '' : 'dis'}" data-act="${live ? 'sub' : 'noop'}" data-v="${sub}" ${live ? '' : 'disabled aria-disabled="true" title="Not available yet"'}>${label}</button>`;
    const top = `
      <div class="topnav">
        <div class="home" data-act="screen" data-v="home" title="Back to title screen">SC</div>
        ${navBtn('campaign', 'Campaign')}${navBtn('coop', 'Co-Op')}${navBtn('versus', 'Versus')}${navBtn('custom', 'Custom')}${navBtn('collection', 'Collection', false)}${navBtn('replays', 'Replays', false)}
        <div class="sp"></div>
        ${this.app.hasActiveMatch() ? '<button class="sbtn resume green" data-act="resume">▶ Resume</button>' : ''}
        <div class="plus" data-act="options" style="cursor:pointer" title="Options">+</div>
        <div class="tavatar"><i>2</i></div>
      </div>
      <div class="subnav" ${this.nav === 'versus' ? '' : 'style="visibility:hidden"'}>
        ${subBtn('training', 'Training')}${subBtn('ai', 'A.I.')}${subBtn('teams', 'Teams', false)}${subBtn('1v1', '1v1')}${subBtn('tournaments', 'Tournaments', false)}${subBtn('testing', 'Testing', false)}
      </div>`;

    let body = '';
    if (this.nav === 'campaign') body = this.renderCampaignScreen();
    else if (this.nav === 'coop') body = this.renderCoopScreen();
    else if (this.nav === 'versus' && this.sub === '1v1') body = this.renderOneVOneScreen();
    else if (this.isMultiplayerView()) body = this.renderMpScreen();
    else if (this.nav === 'versus' && this.sub === 'ai') body = this.renderAiScreen();
    else if (this.nav === 'versus' && this.sub === 'training') body = this.renderTrainingScreen();
    else body = `<div class="ptitle">${this.nav.toUpperCase()}</div><div class="soon">Coming soon</div>`;

    const chat = `
      <div class="chatbar"><span>☺</span><span>Press Enter to chat</span></div>
      <div class="chatright"><div class="ci">👤</div><div class="ci">💬</div><div class="ci">🖥</div><div class="clock">--:--</div></div>`;
    return top + body + chat;
  }

  /** Shared Terran / Zerg / Protoss / Random picker (A.I. and 1v1 screens). */
  private raceCards(group: string, selected: FactionType | 'random') {
    const items: { id: FactionType | 'random'; label: string }[] = [
      { id: 'terran', label: 'Terran' }, { id: 'zerg', label: 'Zerg' }, { id: 'protoss', label: 'Protoss' }, { id: 'random', label: 'Random' }
    ];
    return `<div class="cards">${items.map(it =>
      `<div class="card ${it.id === selected ? 'on' : ''}" data-act="pick" data-g="${group}" data-v="${it.id}">${MainMenu.ICONS[it.id]}${it.label}</div>`).join('')}</div>`;
  }

  /** Shared emblem + details panel (A.I., 1v1, Training, Campaign). */
  private infoPanel(o: { emblem: string; title: string; sub: string; rows?: [string, string][]; desc?: string; style?: string }) {
    return `<div class="info" ${o.style ? `style="${o.style}"` : ''}>
      <div class="emb">${o.emblem}</div>
      <div class="it"><h3>${o.title}</h3><div class="isub">${o.sub}</div>
        ${(o.rows ?? []).map(([k, v]) => `<div class="irow"><span>${k}</span><b>${v}</b></div>`).join('')}
        ${o.desc ? `<div class="idesc">${o.desc}</div>` : ''}</div>
      <div class="help" title="Win games to face tougher A.I.">?</div>
    </div>`;
  }

  private mapRows() {
    return `<div class="tblscroll"><table class="tbl"><thead><tr><th style="width:8%">#</th><th>Map</th><th style="width:20%">Size</th><th style="width:22%">Players</th></tr></thead><tbody>${
      (Object.keys(MAP_CONFIGS) as MapId[]).map((id, i) => {
        const m = MAP_CONFIGS[id];
        const n = id === 'lost_temple' ? 4 : 2;
        return `<tr class="${this.skirmish.mapId === id ? 'on' : ''}" data-act="pick" data-g="skMap" data-v="${id}"><td class="mut">${i + 1}</td><td>${m.name}</td><td class="mut">${this.mapSize(id)}×${this.mapSize(id)}</td><td class="mut">${n} slots · 1v1</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  private enemyRows() {
    return `<table class="tbl"><thead><tr><th style="width:12%"></th><th>Enemy A.I. race</th><th>Style</th></tr></thead><tbody>${
      FACTIONS.map(f => {
        const t = FACTION_TECH[f];
        return `<tr class="${this.skirmish.enemyFaction === f ? 'on' : ''}" data-act="pick" data-g="skEnemy" data-v="${f}"><td class="mut">${FACTION_ICON[f]}</td><td>${t.name}</td><td class="mut">${t.blurb.slice(0, 46)}…</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  // ---- A.I. (single player skirmish) ----
  private renderAiScreen() {
    const s = this.skirmish;
    const diffIds: DifficultyLevel[] = ['easy', 'normal', 'hard', 'insane', 'elite', 'cheater'];
    const d = DIFFICULTY_CONFIGS[s.difficulty];
    const aiTraits: Record<string, string> = {
      easy: 'Basic macro and small attack waves.',
      normal: 'Scouts your base and counter-builds what it sees. Uses MULEs, Chrono Boost and Queen injects.',
      hard: 'Adds stim, upgrades, expansions and worker-line harassment squads.',
      insane: 'Uses cloak, burrow and blink; faster decisions and bigger waves.',
      elite: 'Constant harassment, three bases, fast upgrades and sharp counter-composition.',
      cheater: 'Elite play with full map knowledge and 2.4x resources.'
    };
    const map = MAP_CONFIGS[s.mapId];
    const lvl = diffIds.indexOf(s.difficulty) + 1;
    const you = this.randomPlayer ? 'Random' : FACTION_TECH[s.playerFaction].name;
    const tabs = diffIds.map(id => `<div class="dtab ${s.difficulty === id ? 'on' : ''}" data-act="pick" data-g="skDiff" data-v="${id}">${DIFFICULTY_CONFIGS[id].name.replace(/\s*\(.*\)/, '')}</div>`).join('');
    return `
      <div class="ptitle">A.I.</div>
      <div class="psub">Face off against computer opponents of increasing difficulty</div>
      ${this.raceCards('skPlayer', this.randomPlayer ? 'random' : this.skirmish.playerFaction)}
      <div class="tabstrip">${tabs}</div>
      ${this.infoPanel({ emblem: this.emblem(lvl, d.badgeColor), title: d.name.replace(/\s*\(.*\)/, ''), sub: `${you} vs ${FACTION_TECH[s.enemyFaction].name} A.I. · ${d.name.match(/\((.*)\)/)?.[1] ?? ''}`,
        rows: [['Map', map.name], ['A.I. income', `×${d.incomeMultiplier}`]], desc: `${aiTraits[s.difficulty] ?? ''} ${map.description}` })}
      <div class="botbtns"><button class="sbtn gold chev" data-act="skirmish">Play</button><button class="sbtn" data-act="rtab" data-v="maps">Maps</button></div>
      <div class="rpanel">
        <div class="rtabs"><div class="rtab ${this.rightTab === 'maps' ? 'on' : ''}" data-act="rtab" data-v="maps">Maps</div><div class="rtab ${this.rightTab === 'enemy' ? 'on' : ''}" data-act="rtab" data-v="enemy">Enemy</div></div>
        <div class="rbody">${this.rightTab === 'maps' ? this.mapRows() : this.enemyRows()}
          <div class="rdesc">${this.rightTab === 'maps' ? `<canvas class="mappreview" width="220" height="220" data-map="${s.mapId}"></canvas>` : ''}<div class="rtxt"><h4>${map.name}</h4>${map.subtitle}<br>${map.description}</div></div></div>
      </div>`;
  }

  private renderTrainingScreen() {
    return `
      <div class="ptitle">Training</div>
      <div class="psub">Learn the ropes against a gentle A.I. before you climb the ladder</div>
      <div class="info" style="top:260px; top:calc(260 * var(--u))">
        <div class="emb">${this.emblem(1, '#58e08a')}</div>
        <div class="it"><h3>Practice Match</h3><div class="isub">Terran vs Zerg A.I. · Recruit</div>
          <div class="irow"><span>Map</span><b>${MAP_CONFIGS.sector_vanguard.name}</b></div>
          <div class="idesc">A relaxed 1v1 on the standard map: secure your ramp, expand, and push out when you are ready. Open the in-game Menu (Esc) -> Tutorial for a quick-start guide.</div></div>
      </div>
      <div class="botbtns" style="top:calc(560 * var(--u))"><button class="sbtn gold chev" data-act="train">Start Practice</button></div>`;
  }

  // ---- CAMPAIGN ----
  private renderCampaignScreen() {
    if (this.campaignPath !== 'classic' && !isNarrow() && !this.campaignPicked) return this.renderCampaignHub();
    const stub = HUB.find(h => h.id === this.campaignPath && h.off);
    if (stub) return this.renderComingSoon(stub);
    const done = this.app.world.completedCampaignMissions;
    const diffIds: (DifficultyLevel | 'default')[] = ['default', 'easy', 'normal', 'hard', 'insane'];
    const label = (id: DifficultyLevel | 'default') => id === 'default' ? 'Mission Default' : DIFFICULTY_CONFIGS[id].name.replace(/\s*\(.*\)/, '');
    const race = this.campaignRace;
    const list = CAMPAIGN_MISSIONS.filter(m => m.playerFaction === race);
    if (!list.some(m => m.id === this.selMission) && list[0]) this.selMission = list[0].id;
    const path = this.campaignPath !== 'classic' ? campaignById(this.campaignPath) : undefined;
    if (path) return this.renderPathScreen(path);
    const raceCards = this.pathRaceCards('classic');
    const cards = list.map(m => {
      const unlocked = m.id === 1 || done.includes(m.id - 1) || done.includes(m.id);
      return `<div class="card ${this.selMission === m.id ? 'on' : ''} ${unlocked ? '' : 'locked'}" data-act="${unlocked ? 'msel' : 'noop'}" data-v="${m.id}"><span class="act">${m.act.split('—')[0]!.trim()}</span><span class="num">${m.id}</span><span class="nm">${m.title}</span></div>`;
    }).join('');
    const m = list.find(x => x.id === this.selMission) ?? CAMPAIGN_MISSIONS[0]!;
    const unlocked = m.id === 1 || done.includes(m.id - 1) || done.includes(m.id);
    const complete = done.includes(m.id);
    const tabs = diffIds.slice(0, 4).map(id => `<div class="dtab ${this.campaignDifficulty === id ? 'on' : ''}" data-act="pick" data-g="campaignDiff" data-v="${id}">${label(id)}</div>`).join('');
    return `
      <div class="hero3d" data-kind="${RACE_HERO[race]}" data-zoom="${RACE_ZOOM[race]}">${this.modelBy(RACE_HERO[race])}</div>
      <div class="ptitle">Campaign</div>
      <div class="psub">Choose your race, then lead its forces through the Outlands</div>
      <div class="races">${raceCards}</div>
      <div class="cards mis">${cards}</div>
      <div class="tabstrip mis">${tabs}</div>
      <div class="info mis">
        <div class="emb">${this.emblem(m.id, FACTION_TECH[m.playerFaction].color)}</div>
        <div class="it"><h3>${m.title}</h3><div class="isub">${m.act} · ${m.subtitle}</div>
          <div class="irow"><span>Status</span><b>${complete ? 'Complete' : unlocked ? 'Available' : 'Locked'}</b></div>
          <div class="irow"><span>Difficulty</span><b>${label(this.campaignDifficulty)}</b></div>
          <div class="idesc">${m.objectiveText} ${m.briefing}</div></div>
      </div>
      <div class="botbtns"><button class="sbtn gold chev" data-act="mission" data-v="${m.id}" ${unlocked ? '' : 'disabled'}>${unlocked ? (complete ? 'Replay Mission' : 'Launch Mission') : 'Locked'}</button></div>`;
  }

  /** Pixel-accurate hover for the pedestal figures: a column lights up only while the pointer is over its model's visible pixels. */
  private bindHubHover() {
    const host = this.el.querySelector<HTMLElement>('.cmpcols'); if (!host) return;
    const cols = [...host.querySelectorAll<HTMLElement>('.ccol')];
    const alpha = new Map<string, { w: number; h: number; d: Uint8ClampedArray }>();
    const load = (fig: HTMLElement) => {
      const m = /url\("?([^")]+)"?\)/.exec(fig.style.backgroundImage); const url = m?.[1];
      if (!url || alpha.has(url)) return url ? alpha.get(url) : undefined;
      const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d')!; g.drawImage(img, 0, 0); alpha.set(url, { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data }); }; img.src = url;
      return undefined;
    };
    const over = (col: HTMLElement, x: number, y: number) => {
      const fig = col.querySelector<HTMLElement>('.cfig'); if (!fig) return false;
      const a = load(fig); if (!a) return false;
      const r = fig.getBoundingClientRect();
      const s = Math.min(r.width / a.w, r.height / a.h), dw = a.w * s, dh = a.h * s;
      const u = Math.floor((x - (r.left + (r.width - dw) / 2)) / s), v = Math.floor((y - (r.bottom - dh)) / s);
      for (let dy = -3; dy <= 3; dy += 3) for (let dx = -3; dx <= 3; dx += 3) {
        const px = u + dx, py = v + dy;
        if (px >= 0 && py >= 0 && px < a.w && py < a.h && a.d[(py * a.w + px) * 4 + 3]! > 24) return true;
      }
      return false;
    };
    let cur: HTMLElement | null = null;
    const set = (c: HTMLElement | null) => { if (c === cur) return; cur?.classList.remove('hot'); cur = c; cur?.classList.add('hot'); host.style.cursor = c && !c.classList.contains('off') ? 'pointer' : ''; };
    host.addEventListener('pointermove', e => {
      // later columns paint on top, so test them first
      let hit: HTMLElement | null = null;
      for (let i = cols.length - 1; i >= 0; i--) if (over(cols[i]!, e.clientX, e.clientY)) { hit = cols[i]!; break; }
      set(hit);
    });
    host.addEventListener('pointerleave', () => set(null));
    // a click on a model that overhangs its neighbour's column still opens that model's campaign
    host.addEventListener('click', e => { if (cur && !cur.contains(e.target as Node)) { e.stopPropagation(); cur.click(); } }, true);
  }

  /** Desktop hub: four episodes standing on pedestals (static renders, so nothing heavy runs). */
  private renderCampaignHub() {
    const cols = HUB.map(h => {
      const c = campaignById(h.id);
      const pct = c && c.missions.length ? Math.round(100 * doneSet(c.id).size / c.missions.length) : 0;
      return `<div class="ccol ${h.off ? 'off dis' : ''}" data-act="${h.off ? 'noop' : 'cmphub'}" data-v="${h.id}">
        <div class="cep">${h.ep}</div><div class="cnm">${h.name}</div><div class="cach">${h.off ? 'Coming soon' : `Achievements: ${pct}%`}</div>
        <div class="cped"></div><div class="cfig" data-fig="${h.hero}" style="--fz:${HUB_FIG[h.id]?.z ?? 1};--fx:1;--fy:${HUB_FIG[h.id]?.dy ?? 0}"${HUB_FIG[h.id]?.yaw !== undefined ? ` data-yaw="${HUB_FIG[h.id]!.yaw}"` : ''}></div></div>`;
    }).join('');
    return `<div class="cmpcols">${cols}</div>${this.originsRow()}`;
  }

  private originsRow() {
    return `<div class="origrow"><span>OpenSlop II Originals</span>${FACTIONS.map(f => `<button class="osm" data-act="pick" data-g="cmpRace" data-v="${f}">${f[0]!.toUpperCase() + f.slice(1)}</button>`).join('')}</div>`;
  }

  /** The four campaign buttons (2x2 on phones, one row on desktop); greyed-out ones have no missions yet. */
  private hubButtons(active: string) {
    return `<div class="cmpbtns">${HUB.map(h => `<button class="sbtn cmpbtn ${h.id === active ? 'on' : ''} ${h.off ? 'dis' : ''}" data-act="${h.off ? 'noop' : 'pick'}" data-g="cmpRace" data-v="${h.id}">${h.name}</button>`).join('')}</div>`;
  }

  /** Phone hero carousel: the model with a left / right triangle. */
  private heroCarousel(kind: RigKind, dim = false) {
    return `<div class="herowrap"><button class="car l" data-act="ccar" data-v="-1" aria-label="Previous campaign"></button>
      <div class="hero3d ${dim ? 'dim' : ''}" data-kind="${kind}" data-zoom="1.25">${this.modelBy(kind)}</div>
      <button class="car r" data-act="ccar" data-v="1" aria-label="Next campaign"></button></div>`;
  }

  private renderComingSoon(h: (typeof HUB)[number]) {
    return `${this.heroCarousel(h.hero, true)}
      <div class="ptitle">${h.name}</div>
      <div class="psub">${h.ep} · Coming soon</div>
      ${this.hubButtons(h.id)}
      <div class="soon" style="position:static">No missions yet</div>
      ${this.originsRow()}`;
  }

  /** Pathway campaign screen (Nova Covert Ops, Wings of Liberty...): missions come from src/campaign. */
  private renderPathScreen(c: import('../campaign/types').CampaignDef) {
    const done = doneSet(c.id);
    const diffIds: (DifficultyLevel | 'default')[] = ['default', 'easy', 'normal', 'hard'];
    const label = (id: DifficultyLevel | 'default') => id === 'default' ? 'Mission Default' : DIFFICULTY_CONFIGS[id].name.replace(/\s*\(.*\)/, '');
    const chapters = [...new Set(c.missions.map(m => m.chapter))];
    const nextUp = c.missions.find(m => !done.has(m.key) && isUnlocked(c, m, done)) ?? c.missions[0]!;
    if (!chapters.includes(this.pathChapter)) this.pathChapter = nextUp.chapter;
    const list = chapters.length > 3 ? c.missions.filter(m => m.chapter === this.pathChapter) : c.missions;
    if (!c.missions.some(m => m.key === this.selPathMission)) this.selPathMission = (list.find(m => !done.has(m.key) && isUnlocked(c, m, done)) ?? list.find(m => isUnlocked(c, m, done)) ?? list[0]!).key;
    const cards = list.map(m => {
      const un = isUnlocked(c, m, done);
      return `<div class="card ${this.selPathMission === m.key ? 'on' : ''} ${un ? '' : 'locked'} ${done.has(m.key) ? 'done' : ''}" data-act="${un ? 'pmsel' : 'noop'}" data-v="${m.key}"><span class="act">${m.chapter}</span><span class="num">${m.order}</span><span class="nm">${m.title}</span></div>`;
    }).join('');
    const m = c.missions.find(x => x.key === this.selPathMission)!;
    const un = isUnlocked(c, m, done), complete = done.has(m.key);
    const tabs = diffIds.map(id => `<div class="dtab ${this.campaignDifficulty === id ? 'on' : ''}" data-act="pick" data-g="campaignDiff" data-v="${id}">${label(id)}</div>`).join('');
    const chTabs = chapters.length > 3 ? `<div class="tabstrip ch">${chapters.map(ch => `<div class="dtab ${ch === this.pathChapter ? 'on' : ''}" data-act="pchap" data-v="${ch}">${ch}</div>`).join('')}</div>` : '';
    return `
      ${this.heroCarousel(c.hero)}
      <div class="ptitle">${c.name}</div>
      <div class="psub">${c.tagline}</div>
      ${this.hubButtons(c.id)}
      ${chTabs}
      <div class="cards mis path">${cards}</div>
      <div class="tabstrip mis">${tabs}</div>
      <div class="info mis">
        <div class="emb">${this.emblem(m.order, c.color)}</div>
        <div class="it"><h3>${m.title}</h3><div class="isub">${m.chapter} · ${m.subtitle}</div>
          <div class="irow"><span>Status</span><b>${complete ? 'Complete' : un ? 'Available' : 'Locked'}</b></div>
          <div class="irow"><span>Difficulty</span><b>${label(this.campaignDifficulty)}</b></div>
          <div class="idesc">${m.objectives.filter(o => o.kind === 'primary').map(o => o.text).join(' · ')}. ${m.briefing}</div></div>
      </div>
      <div class="botbtns"><button class="sbtn gold chev" data-act="pmission" data-v="${m.key}" ${un ? '' : 'disabled'}>${un ? (complete ? 'Replay Mission' : 'Launch Mission') : 'Locked'}</button>${c.id === 'nco' ? `<span class="lo-d">${this.loadoutButtons()}</span>` : ''}</div>${c.id === 'nco' ? `<div class="loadrow">${this.loadoutButtons()}</div>` : ''}`;
  }

  /** Nova's four equipment slots (click to cycle through unlocked items). */
  private loadoutButtons() {
    const l = loadout();
    return SLOTS.map(sl => { const it = ITEMS.find(i => i.id === l[sl]); return `<button class="sbtn small" data-act="eqcycle" data-v="${sl}" title="${it?.desc ?? ''}">${sl[0]!.toUpperCase() + sl.slice(1)}: ${it?.name ?? '-'}</button>`; }).join('');
  }

  /** Real SC2 pathways first (default), then the homebrewed race campaigns, dimmed, as "Originals". */
  private pathRaceCards(activePath: string) {
    const paths = CAMPAIGNS.filter(c => c.missions.length).map(c => `<div class="rcard path ${c.id === activePath ? 'on' : ''}" style="--accent:${c.color}" data-act="pick" data-g="cmpRace" data-v="${c.id}"><div class="rport" data-pk="${c.hero}"></div><div class="rname">${c.name}</div><div class="rcount">${c.missions.length} missions</div></div>`).join('');
    const origs = FACTIONS.map(f => {
      const t = FACTION_TECH[f]; const n = CAMPAIGN_MISSIONS.filter(m => m.playerFaction === f).length;
      return `<div class="rcard orig ${activePath === 'classic' && this.campaignRace === f ? 'on' : ''}" style="--accent:${t.color}" data-act="pick" data-g="cmpRace" data-v="${f}"><div class="rport" data-pk="${RACE_HERO[f]}"></div><div class="rname">${f[0]!.toUpperCase() + f.slice(1)}</div><div class="rcount">Original · ${n}</div></div>`;
    }).join('');
    return paths + `<div class="rsep">OpenSlop II Originals</div>` + origs;
  }

  // ---- CO-OP: commander select ----
  private renderCoopScreen() {
    const c = COMMANDERS.find(x => x.id === this.cmdr) ?? COMMANDERS[0]!;
    const tabKey = this.lobby.kind !== 'browse' ? 'lobby' : this.coopTab;
    const t = FACTION_TECH[c.faction];
    const grid = COMMANDERS.map(x => `<div class="cm ${x.id === c.id ? 'on' : ''}" style="--accent:${FACTION_TECH[x.faction].color}" data-act="pick" data-g="cmdr" data-v="${x.id}" title="${x.name}"><div class="cport" data-pk="${x.kind}"></div><i>${x.level}</i></div>`).join('')
      + `<div class="cm dice" data-act="pick" data-g="cmdr" data-v="random" title="Random commander"><svg viewBox="0 0 64 64"><g fill="rgba(120,190,255,.25)" stroke="#9fd0ff" stroke-width="3" stroke-linejoin="round"><path d="M10 20 L32 8 L54 20 L54 44 L32 56 L10 44 Z"/><path d="M10 20 L32 32 L54 20 M32 32 L32 56" fill="none"/></g><g fill="#fff"><circle cx="32" cy="19" r="3"/><circle cx="21" cy="38" r="3"/><circle cx="43" cy="38" r="3"/></g></svg></div>`;
    let panel = '';
    if (tabKey === 'info') {
      panel = `<div class="cinfo"><div class="clvl"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="rgba(10,40,90,.6)" stroke="#2a7fe0" stroke-width="6"/><path d="M60 10 A50 50 0 0 1 108 44" fill="none" stroke="#9fd8ff" stroke-width="6" stroke-linecap="round"/></svg><b>${c.level}</b></div>
        <div class="ctxt"><h4>${c.title}</h4><ul>${c.bullets.map(b => `<li>${b}</li>`).join('')}</ul></div></div>`;
    } else if (tabKey === 'units') {
      panel = `<div class="cunits">${c.units.map(u => `<span>${u}</span>`).join('')}<p>${t.blurb}</p></div>`;
    } else {
      panel = `<div class="clobby">${this.lobby.kind !== 'browse' ? this.renderMultiplayer() : this.joinPane('multiplayer_coop')}</div>`;
    }
    const hosting = this.lobby.kind === 'hosting';
    const canStart = hosting && !!(this.lobby as any).guestName;
    const readyLabel = this.lobby.kind === 'guest' ? 'Waiting…' : hosting ? (canStart ? 'Start' : 'Waiting…') : 'Ready';
    const mapName = MAP_CONFIGS[this.mp.mapId].name;
    return `
      <div class="hero3d" data-kind="${c.kind}">${this.modelBy(c.kind)}</div>
      <div class="ptitle sm">Co-Op Missions</div>
      <div class="psub">Play cooperative objective based missions with an ally</div>
      <div class="cmgrid">${grid}</div>
      <div class="cname">${c.name}<small>${c.title}</small></div>
      <div class="ctabs"><div class="ctab ${tabKey === 'info' ? 'on' : ''}" data-act="ctab" data-v="info">Info</div><div class="ctab ${tabKey === 'units' ? 'on' : ''}" data-act="ctab" data-v="units">Units</div><div class="ctab ${tabKey === 'lobby' ? 'on' : ''}" data-act="ctab" data-v="lobby">Lobby</div></div>
      <div class="cpanel">${panel}</div>
      <div class="cbtns">
        <div><button class="sbtn gold" data-act="${hosting ? 'mp-start' : 'host'}" ${this.lobby.kind === 'guest' || (hosting && !canStart) ? 'disabled' : ''}>${readyLabel}</button></div>
        <div><button class="sbtn" data-act="randmission">Random Mission</button><span class="bonus">${mapName}</span></div>
        <div><button class="sbtn" data-act="cdiff">${this.mp.difficulty === 'hard' ? 'Hard' : 'Normal'}</button><span class="bonus">AI difficulty</span></div>
      </div>`;
  }

  /** Quick match / create / join-by-code / open games list for one online mode (or all modes when `mode` is null). */
  private joinPane(mode: GameModeType | null) {
    return `${this.actionRow(mode)}
      ${this.status ? `<div class="mm-status">${this.escape(this.status)}</div>` : ''}
      ${this.roomListHtml(mode)}`;
  }

  /** Top row of the Open Games area: the three actions, or - while a request is running - a spinner with Cancel. */
  private actionRow(mode: GameModeType | null) {
    if (this.busy) {
      return `<div class="rl-busy" role="status" aria-live="polite"><span class="mm-spin"></span><span class="rl-busytxt">${this.escape(this.busy)}</span>${this.busySlow ? '<span class="rl-hint">Still working - slow networks can take a few seconds.</span>' : ''}<button class="mm-btn" data-act="busy-cancel">Cancel</button></div>`;
    }
    // 1v1 has a dedicated Join Code tab; the other screens reveal an inline code row instead
    const codeBtn = mode === 'multiplayer_pvp'
      ? '<button class="mm-btn" data-act="otab" data-v="code">Join Code</button>'
      : `<button class="mm-btn ${this.codeOpen ? 'sel' : ''}" data-act="code-toggle">Join Code</button>`;
    const codeRow = mode !== 'multiplayer_pvp' && this.codeOpen
      ? '<div class="jrow code2"><input class="mm-input code" id="mm-code" maxlength="5" placeholder="CODE" /><button class="mm-btn primary" data-act="join-code">Join</button></div>' : '';
    return `<div class="jrow"><button class="mm-btn primary" data-act="quick"><span class="ico">⚡ </span>Quick Match</button><button class="mm-btn" data-act="host">Create Game</button>${codeBtn}</div>${codeRow}`;
  }

  private flag(cc?: string): string {
    if (!cc || !/^[A-Z]{2}$/.test(cc)) return '';
    return String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
  }

  private pingBadge(r: RoomInfo): string {
    if (r.status && r.status !== 'open') return '<span class="rl-mut">-</span>';
    if (r.pingMs === undefined) return this.roomsSource === 'api' ? '<span class="skel sm"></span>' : '<span class="rl-mut">-</span>';
    const cls = r.pingMs < 60 ? 'g' : r.pingMs < 130 ? 'y' : 'r';
    return `<span class="pdot ${cls}"></span>${r.pingMs} ms`;
  }

  /** Filter + sort the room list (open games first; then best ping or newest). */
  private visibleRooms(mode: GameModeType | null): RoomInfo[] {
    let list = mode ? this.rooms.filter(r => r.mode === mode) : this.rooms.slice();
    if (this.rf.map !== 'all') list = list.filter(r => (r.mapId || 'sector_vanguard') === this.rf.map);
    if (this.rf.openOnly) list = list.filter(r => !r.status || r.status === 'open');
    const isOpen = (r: RoomInfo) => (!r.status || r.status === 'open' ? 0 : 1);
    return list.sort((a, b) => {
      if (isOpen(a) !== isOpen(b)) return isOpen(a) - isOpen(b);
      if (this.rf.sort === 'ping') {
        const pa = a.pingMs ?? 1e9, pb = b.pingMs ?? 1e9;
        if (pa !== pb) return pa - pb;
      }
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
  }

  private roomListHtml(mode: GameModeType | null): string {
    const mapOpts = (Object.keys(MAP_CONFIGS) as MapId[]).map(id => `<option value="${id}" ${this.rf.map === id ? 'selected' : ''}>${this.escape(MAP_CONFIGS[id].name)}</option>`).join('');
    const bar = `<div class="rl-bar">
        <span class="rl-lbl">Sort</span>
        <button class="rl-chip ${this.rf.sort === 'ping' ? 'on' : ''}" data-act="rf-sort" data-v="ping">Best ping</button>
        <button class="rl-chip ${this.rf.sort === 'newest' ? 'on' : ''}" data-act="rf-sort" data-v="newest">Newest</button>
        <select class="rl-sel" data-chg="rf-map" aria-label="Filter by map"><option value="all">All maps</option>${mapOpts}</select>
        <label class="rl-chk"><input type="checkbox" data-act="rf-open" ${this.rf.openOnly ? 'checked' : ''} /> Open only</label>
        <span class="rl-spin" title="Refreshing"></span>
      </div>`;
    return `${bar}<div class="rl-body" data-mode="${mode ?? ''}">${this.roomListBodyHtml(mode)}</div>`;
  }

  /** The part of the list that changes on every poll. Swapped in place (see startRoomPolling) so the page never re-renders or jumps. */
  private roomListBodyHtml(mode: GameModeType | null): string {
    const note = this.roomsSource === 'slots' && useP2P()
      ? '<div class="rl-note">Live game list unavailable - using basic search (shows up to 4 nearby games).</div>' : '';
    const rooms = this.visibleRooms(mode);
    if (this.roomsPhase === 'loading' && !this.rooms.length) {
      const skel = '<div class="rl-card rl-skel"><div class="rl-main"><div class="rl-l1"><span class="skel"></span><span class="skel xs"></span></div><div class="rl-meta"><span class="skel" style="width:70%"></span></div></div></div>';
      return `<div class="rl-list" aria-busy="true">${skel.repeat(3)}</div>`;
    }
    if (this.roomsPhase === 'error' && !this.rooms.length) {
      return `<div class="rl-empty"><b>Can't reach the game list</b><span>Check your connection, then try again.</span><button class="mm-btn primary" data-act="rooms-retry">Retry</button></div>`;
    }
    if (!rooms.length) {
      const filtered = this.rooms.length > 0;
      return `${note}<div class="rl-empty"><b>${filtered ? 'No games match your filters' : 'No games right now'}</b><span>${filtered ? 'Try a different map, or show all games.' : 'Be the first: Create Game, or let Quick Match make one for you.'}</span>${filtered ? '<button class="mm-btn" data-act="rf-clear">Clear filters</button>' : ''}</div>`;
    }
    const cards = rooms.map(r => {
      const open = !r.status || r.status === 'open';
      const title = this.escape(r.name || `${r.host}'s game`);
      const region = r.country ? `<span class="rl-flag" title="${this.escape(r.country)}">${this.flag(r.country)}</span>${this.escape(r.country)} ` : '';
      const race = FACTION_TECH[(r.hostFaction || 'terran') as FactionType]?.name ?? '';
      const map = MAP_CONFIGS[(r.mapId || 'sector_vanguard') as MapId]?.name ?? '';
      const action = open
        ? `<button class="mm-btn primary" data-act="join-room" data-v="${r.code}" ${this.busy ? 'disabled' : ''}>Join</button>`
        : `<span class="rl-lock" title="${r.status === 'live' ? 'This match already started' : 'Waiting for the match to start'}">🔒 ${r.status === 'live' ? 'In game' : 'Full'}</span>`;
      // line 1: name + ping; line 2: host, race, map, players. Both lines ellipsize, so nothing ever forces a horizontal scrollbar.
      return `<div class="rl-card ${open ? '' : 'dim'}"><div class="rl-main"><div class="rl-l1"><span class="rl-name">${title}</span><span class="rl-ping">${region}${this.pingBadge(r)}</span></div><div class="rl-meta">${this.escape(r.host)} · ${race} · ${this.escape(map)} · ${open ? '1/2' : '2/2'}${r.quick ? ' · Quick' : ''}</div></div><div class="rl-act">${action}</div></div>`;
    }).join('');
    return `${note}<div class="rl-list">${cards}</div>`;
  }

  // ---- VERSUS / 1v1 ----
  private renderOneVOneScreen() {
    let wins = 0, losses = 0;
    try { wins = Number(localStorage.getItem('sc2_1v1_wins')) || 0; losses = Number(localStorage.getItem('sc2_1v1_losses')) || 0; } catch {}
    const tab = this.oneTab;
    const inLobby = this.lobby.kind !== 'browse';
    let body = '';
    if (inLobby) body = `<div class="clobby">${this.renderMultiplayer()}</div>`;
    else if (tab === 'games') body = this.joinPane('multiplayer_pvp');
    else if (tab === 'code') body = `<div class="jrow"><input class="mm-input code" id="mm-code" maxlength="5" placeholder="CODE" /><button class="mm-btn primary" data-act="join-code">Join Code</button></div><p class="mut">Ask your opponent for their room code, or share yours after you press Unranked to host a game.</p>${this.status ? `<div class="mm-status">${this.escape(this.status)}</div>` : ''}`;
    else body = this.mapRows1v1();
    const rtab = (id: typeof tab, lab: string) => `<div class="rtab ${!inLobby && tab === id ? 'on' : ''}" data-act="otab" data-v="${id}">${lab}</div>`;
    const open = this.rooms.filter(r => r.mode === 'multiplayer_pvp' && (!r.status || r.status === 'open')).length;
    const race = this.oneRandom ? 'Random' : FACTION_TECH[this.mp.faction].name;
    return `
      <div class="hero3d dim" data-kind="${RACE_HERO[this.mp.faction]}">${this.modelBy(RACE_HERO[this.mp.faction])}</div>
      <div class="ptitle">1v1</div>
      <div class="psub">Go head to head in OpenSlop II's competitive matchmaking</div>
      ${this.raceCards('oneRace', this.oneRandom ? 'random' : this.mp.faction)}
      <div class="tabstrip"><div class="dtab on">Season 1</div></div>
      ${this.infoPanel({ emblem: this.emblem(1, '#58b4ff'), title: 'Open League', sub: `${this.escape(this.playerName)} · ${race}`,
        rows: [['Wins', String(wins)], ['Losses', String(losses)], ['Map', MAP_CONFIGS[this.mp.mapId].name]], desc: `<span class="rl-count">${open} open game${open === 1 ? '' : 's'} right now.</span>` })}
      <div class="botbtns"><button class="sbtn gold chev" data-act="quick">Ranked</button><button class="sbtn" data-act="host">Unranked</button><button class="sbtn" data-act="otab" data-v="maps">Maps</button></div>
      <div class="rpanel">
        <div class="rtabs">${rtab('games', 'Open Games')}${rtab('code', 'Join Code')}${rtab('maps', 'Maps')}</div>
        <div class="rbody">${body}</div>
      </div>`;
  }

  private mapRows1v1() {
    const ids = Object.keys(MAP_CONFIGS) as MapId[];
    return `<table class="tbl"><thead><tr><th>#</th><th>Map</th><th>Size</th></tr></thead><tbody>${ids.map((id, i) => `<tr class="${this.mp.mapId === id ? 'on' : ''}" data-act="pick" data-g="mpMap" data-v="${id}"><td class="mut">${i + 1}</td><td>${MAP_CONFIGS[id].name}</td><td class="mut">${this.mapSize(id)}×${this.mapSize(id)}</td></tr>`).join('')}</tbody></table>
      <div class="rdesc"><canvas class="mappreview" width="220" height="220" data-map="${this.mp.mapId}"></canvas><div class="rtxt"><h4>${MAP_CONFIGS[this.mp.mapId].name}</h4>${MAP_CONFIGS[this.mp.mapId].description}</div></div>`;
  }

  // ---- Online (1v1 / co-op / custom) ----
  private renderMpScreen() {
    const title = this.nav === 'coop' ? 'Co-Op' : this.nav === 'custom' ? 'Custom Games' : '1v1';
    const sub = this.nav === 'coop' ? 'Team up against the A.I. with a friend' : this.nav === 'custom' ? 'Host or join a game with a code or invite link' : 'Go head to head with another commander';
    return `<div class="ptitle">${title}</div><div class="psub">${sub}</div><div class="mpwrap">${this.renderMultiplayer()}</div>`;
  }

  private factionPicker(group: string, selected: FactionType) {
    return `<div class="mm-cards">${FACTIONS.map(f => {
      const t = FACTION_TECH[f];
      return `<button class="mm-card faction ${selected === f ? 'sel' : ''}" style="--accent:${t.color}" data-act="pick" data-g="${group}" data-v="${f}">
        <div class="mm-card-icon">${FACTION_ICON[f]}</div><div class="mm-card-name">${t.name}</div>
        <div class="mm-card-desc">${t.blurb}</div></button>`;
    }).join('')}</div>`;
  }

  /** Compact race picker for the lobby (the full cards would push START out of view). */
  private factionChips(group: string, selected: FactionType) {
    return `<div class="mm-chips">${FACTIONS.map(f => `<button class="mm-chip ${selected === f ? 'sel' : ''}" style="--accent:${FACTION_TECH[f].color}" data-act="pick" data-g="${group}" data-v="${f}">${FACTION_ICON[f]} ${FACTION_TECH[f].name}</button>`).join('')}</div>`;
  }

  private mapPicker(group: string, selected: MapId) {
    // Online matches can't reload the page to change map size, so the 2x map is skirmish-only
    const ids = Object.keys(MAP_CONFIGS) as MapId[];
    return `<div class="mm-cards">${ids.map(id => {
      const m = MAP_CONFIGS[id];
      return `<button class="mm-card ${selected === id ? 'sel' : ''}" data-act="pick" data-g="${group}" data-v="${id}">
        <canvas class="mappreview" width="160" height="160" data-map="${id}"></canvas>
        <div class="mm-card-name">${m.name}</div><div class="mm-card-sub">${m.subtitle}</div>
        <div class="mm-card-desc">${m.description}</div></button>`;
    }).join('')}</div>`;
  }

  private diffPicker(group: string, selected: string, withDefault = false) {
    const items = (Object.keys(DIFFICULTY_CONFIGS) as DifficultyLevel[]).map(id => {
      const d = DIFFICULTY_CONFIGS[id];
      return `<button class="mm-chip ${selected === id ? 'sel' : ''}" style="--accent:${d.badgeColor}" data-act="pick" data-g="${group}" data-v="${id}">${d.name}</button>`;
    });
    if (withDefault) items.unshift(`<button class="mm-chip ${selected === 'default' ? 'sel' : ''}" data-act="pick" data-g="${group}" data-v="default">Mission Default</button>`);
    return `<div class="mm-chips">${items.join('')}</div>`;
  }

  // ---- Multiplayer ----
  private renderMultiplayer() {
    const l = this.lobby;
    const nameRow = `<div class="mm-row"><label>Your name</label>
      <input class="mm-input" id="mm-name" maxlength="20" value="${this.escape(this.playerName)}" /></div>`;
    const status = this.status ? `<div class="mm-status">${this.escape(this.status)}</div>` : '';

    if (l.kind === 'hosting') {
      const link = this.inviteLink(l.code);
      const ready = !!l.guestName;
      return `
        <div class="mm-lobby">
          <div class="mm-lobby-label">GAME CODE — share with your friend</div>
          <div class="mm-code">${l.code}</div>
          <div class="mm-row center">
            <button class="mm-btn" data-act="copy-code" data-v="${l.code}">📋 Copy Code</button>
            <button class="mm-btn" data-act="copy-link" data-v="${this.escape(link)}">🔗 Copy Invite Link</button>
          </div>
          <div class="mm-invite">${this.escape(link)}</div>
          ${useP2P() ? this.visibilityToggle(ready) : ''}
          <div class="mm-players">
            <div class="mm-player on">👤 ${this.escape(this.playerName)} <span>(host · ${FACTION_TECH[this.mp.faction].name})</span></div>
            <div class="mm-player ${ready ? 'on' : ''}">${ready ? '👤 ' + this.escape(l.guestName!) : '⏳ Waiting for a player to join…'}
              ${ready && this.mp.mode === 'multiplayer_pvp' ? `<span>(${FACTION_TECH[this.mp.enemyFaction].name})</span>` : ''}</div>
          </div>
          <div class="mm-card-sub">${this.mp.mode === 'multiplayer_pvp' ? '1v1 Player vs Player' : 'Co-op vs AI'} · ${MAP_CONFIGS[this.mp.mapId].name}</div>
          <div class="mm-section">Your Faction</div>${this.factionChips('hostFaction', this.mp.faction)}
          ${useP2P() ? `<div class="mm-row center"><label>Game name</label><input class="mm-input" data-chg="gname" maxlength="24" placeholder="${this.escape(this.playerName)}'s game" value="${this.escape(this.mp.gameName)}" /></div>` : ''}
          ${status}
          <div class="mm-actions">
            <button class="mm-btn primary big" data-act="mp-start" ${ready ? '' : 'disabled'}>START GAME ▶</button>
            <button class="mm-btn" data-act="mp-leave">Cancel</button>
          </div>
        </div>`;
    }

    if (l.kind === 'guest') {
      const pvp = l.config.mode === 'multiplayer_pvp';
      return `
        <div class="mm-lobby">
          <div class="mm-lobby-label">JOINED GAME</div>
          <div class="mm-code">${l.code}</div>
          <div class="mm-players">
            <div class="mm-player on">👤 ${this.escape(l.hostName)} <span>(host · ${FACTION_TECH[(l.config.playerFaction || 'terran') as FactionType].name})</span></div>
            <div class="mm-player on">👤 ${this.escape(this.playerName)} <span>(you)</span></div>
          </div>
          <div class="mm-card-sub">${pvp ? '1v1 Player vs Player' : 'Co-op vs AI'} · ${MAP_CONFIGS[(l.config.mapId || 'sector_vanguard') as MapId]?.name ?? ''}</div>
          ${pvp ? `<div class="mm-section">Your Faction</div>${this.factionChips('guestFaction', this.mp.faction)}` : ''}
          ${status || '<div class="mm-status">Waiting for the host to start the game…</div>'}
          <div class="mm-actions"><button class="mm-btn" data-act="mp-leave">Leave Game</button></div>
        </div>`;
    }

    return `
      ${nameRow}
      <div class="mm-split">
        <div class="mm-pane">
          <div class="mm-section">Find a Game</div>
          ${this.actionRow(null)}
          ${status}
          ${this.roomListHtml(null)}
        </div>
        <div class="mm-pane">
          <div class="mm-section">Host a Game</div>
          <div class="mm-chips">
            <button class="mm-chip ${this.mp.mode === 'multiplayer_pvp' ? 'sel' : ''}" data-act="pick" data-g="mpMode" data-v="multiplayer_pvp">1v1 PvP</button>
            <button class="mm-chip ${this.mp.mode === 'multiplayer_coop' ? 'sel' : ''}" data-act="pick" data-g="mpMode" data-v="multiplayer_coop">Co-op vs AI</button>
          </div>
          <div class="mm-card-sub">Your faction</div>${this.factionPicker('mpFaction', this.mp.faction)}
          ${this.mp.mode === 'multiplayer_coop' ? `<div class="mm-card-sub">AI enemy faction</div>${this.factionPicker('mpEnemy', this.mp.enemyFaction)}<div class="mm-card-sub">AI difficulty</div>${this.diffPicker('mpDiff', this.mp.difficulty)}` : ''}
          <div class="mm-card-sub">Map</div>${this.mapPicker('mpMap', this.mp.mapId)}
          ${useP2P() ? `<div class="mm-card-sub">Game name (shown in Open Games)</div><input class="mm-input" data-chg="gname" maxlength="24" placeholder="${this.escape(this.playerName)}'s game" value="${this.escape(this.mp.gameName)}" />` : ''}
          <div class="mm-actions"><button class="mm-btn primary big" data-act="host" ${this.busy ? 'disabled' : ''}>${this.busy ? '<span class="mm-spin on"></span> ' : ''}HOST GAME</button></div>
        </div>
      </div>
      ${status}`;
  }

  // ---------------------------------------------------------------------
  private onInput(e: Event) {
    const t = e.target as HTMLInputElement;
    if (t.id === 'mm-name') {
      this.playerName = t.value.trim().slice(0, 20) || 'Commander';
      try { localStorage.setItem('sc2_player_name', this.playerName); } catch {}
    } else if (t.id === 'mm-code') {
      t.value = t.value.toUpperCase().replace(/[^A-Z]/g, '');
    }
  }
  private onChange(e: Event) {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const chg = (t as HTMLElement).dataset?.chg;
    if (chg === 'rf-map') { this.rf.map = t.value; this.saveFilters(); this.render(); }
    else if (chg === 'gname') {
      this.mp.gameName = t.value.replace(/[^\p{L}\p{N} _.\-'!]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
      try { localStorage.setItem('sc2_game_name', this.mp.gameName); } catch {}
      if (this.lobby.kind === 'hosting') this.client?.send({ t: 'config', config: this.hostConfig() }); // rename the listing live (no re-render: it would swallow a click in progress)
    }
  }

  /** Keep the online lobby's mode in step with the tab the player is looking at. */
  private applyNavDefaults() {
    if (this.nav === 'coop') this.mp.mode = 'multiplayer_coop';
    else if (this.nav === 'versus' && this.sub === '1v1') this.mp.mode = 'multiplayer_pvp';
  }

  private onClick(e: MouseEvent) {
    const target = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!target) return;
    e.stopPropagation();
    if (target.classList.contains('dis') || (target as HTMLButtonElement).disabled) return; // modes we don't have yet
    const act = target.dataset.act!;
    const v = target.dataset.v || '';
    const g = target.dataset.g || '';
    this.app.sound.playCommandConfirm();

    switch (act) {
      case 'noop': break;
      case 'screen':
        this.screen = v as Screen;
        this.render();
        break;
      case 'go': // home-screen buttons jump straight to a play-screen tab
        this.screen = 'play';
        this.nav = (target.dataset.nav || 'versus') as Nav;
        if (this.nav === 'campaign') this.campaignPicked = false;
        this.sub = (target.dataset.sub || 'ai') as Sub;
        this.applyNavDefaults();
        this.render();
        break;
      case 'nav':
        this.nav = v as Nav;
        if (this.nav === 'campaign') this.campaignPicked = false;
        if (this.nav === 'versus' && !['training', 'ai', '1v1'].includes(this.sub)) this.sub = 'ai';
        this.applyNavDefaults();
        this.render();
        break;
      case 'sub':
        this.sub = v as Sub;
        this.applyNavDefaults();
        this.render();
        break;
      case 'rtab':
        this.rightTab = v as 'maps' | 'enemy';
        this.render();
        break;
      case 'ctab': this.coopTab = v as 'info' | 'units' | 'lobby'; this.render(); break;
      case 'otab': this.oneTab = v as 'games' | 'code' | 'maps'; this.render(); break;
      case 'cdiff': this.mp.difficulty = this.mp.difficulty === 'hard' ? 'normal' : 'hard'; this.render(); break;
      case 'randmission': {
        const ids = (Object.keys(MAP_CONFIGS) as MapId[]).filter(id => MAP_LAYOUT_OF[id] === LAYOUT.id);
        this.mp.mapId = ids[Math.floor(Math.random() * ids.length)]!;
        this.render();
        break;
      }
      case 'eqcycle': cycle(v as any, this.selPathMission); this.render(); break;
      case 'cmphub': this.applyPick('cmpRace', v); this.render(); break;
      case 'ccar': {
        const i = Math.max(0, HUB.findIndex(h => h.id === this.campaignPath));
        this.applyPick('cmpRace', HUB[(i + Number(v) + HUB.length) % HUB.length]!.id); this.render(); break;
      }
      case 'pmsel':
        this.selPathMission = v; this.render(); break;
      case 'pchap':
        this.pathChapter = v; this.selPathMission = ''; this.render(); break;
      case 'pmission': {
        const c = campaignById(this.campaignPath); if (!c) return;
        this.close();
        this.app.startPathMission(c.id, v, this.campaignDifficulty === 'default' ? undefined : this.campaignDifficulty);
        break;
      }
      case 'msel':
        this.selMission = Number(v);
        this.render();
        break;
      case 'options': this.app.ui.openMenuOverlay('options'); break;
      case 'loadgame': this.app.ui.openMenuOverlay('load'); break;
      case 'help': this.app.ui.openMenuOverlay('help'); break;
      case 'attrib': this.app.ui.openMenuOverlay('attributions'); break;
      case 'parity': this.app.ui.openMenuOverlay('parity'); break;
      case 'train':
        this.close();
        this.app.startMatch({ mode: 'skirmish', campaignMissionId: undefined, playerFaction: 'terran', enemyFaction: 'zerg', mapId: 'sector_vanguard', difficulty: 'easy' });
        break;
      case 'resume':
        this.close();
        this.app.resumeFromMenu();
        break;
      case 'pick':
        this.applyPick(g, v);
        this.render();
        break;
      case 'rf-sort': this.rf.sort = v === 'newest' ? 'newest' : 'ping'; this.saveFilters(); this.render(); break;
      case 'rf-open': this.rf.openOnly = !this.rf.openOnly; this.saveFilters(); this.render(); break;
      case 'rf-clear': this.rf = { sort: this.rf.sort, map: 'all', openOnly: false }; this.saveFilters(); this.render(); break;
      case 'code-toggle': this.codeOpen = !this.codeOpen; this.render(); (this.el.querySelector('#mm-code') as HTMLInputElement | null)?.focus(); break;
      case 'rooms-retry': void roomBrowser.refresh(); break;
      case 'busy-cancel': this.leaveLobby(); break;
      case 'mp-public':
        if (this.lobby.kind === 'hosting' && this.lobby.guestName) { this.render(); break; } // locked once a guest has joined
        this.mp.isPublic = !this.mp.isPublic;
        if (this.lobby.kind === 'hosting') void this.hostGame(); // re-host: public games sit on a matchmaking slot code, private ones on a random code
        else this.render();
        break;
      case 'mission': {
        const m = CAMPAIGN_MISSIONS.find(x => x.id === Number(v));
        if (!m) return;
        this.close();
        this.app.startCampaignMission(m.id, this.campaignDifficulty === 'default' ? undefined : this.campaignDifficulty);
        break;
      }
      case 'skirmish': {
        this.close();
        const cfg = { ...this.skirmish };
        if (this.randomPlayer) cfg.playerFaction = FACTIONS[Math.floor(Math.random() * FACTIONS.length)]!;
        this.app.startMatch({ mode: 'skirmish', campaignMissionId: undefined, ...cfg });
        break;
      }
      case 'host': void this.hostGame(); break;
      case 'quick': void this.quickMatch(); break;
      case 'join-code': {
        const input = this.el.querySelector('#mm-code') as HTMLInputElement | null;
        void this.joinByCode(input?.value || '');
        break;
      }
      case 'join-room': void this.joinByCode(v); break;
      case 'mp-start': this.client?.start(); break;
      case 'mp-leave': this.leaveLobby(); break;
      case 'copy-code':
      case 'copy-link':
        this.copy(v);
        break;
    }
  }

  private applyPick(g: string, v: string) {
    switch (g) {
      case 'skPlayer':
        this.randomPlayer = v === 'random';
        if (!this.randomPlayer) this.skirmish.playerFaction = v as FactionType;
        break;
      case 'cmpRace': {
        this.campaignPicked = true;
        const hub = HUB.find(h => h.id === v);
        if (hub) { this.campaignPath = v; this.campaignRace = 'terran'; this.selPathMission = ''; this.pathChapter = ''; this.app.sound.playUnitGreeting(hub.hero); break; }
        this.campaignPath = 'classic';
        this.campaignRace = v as FactionType;
        this.app.sound.playUnitGreeting(RACE_HERO[v as FactionType]); // the race's hero unit says (or growls) its own hello
        const first = CAMPAIGN_MISSIONS.find(m => m.playerFaction === this.campaignRace);
        if (first) this.selMission = first.id;
        break;
      }
      case 'cmdr': {
        const c = v === 'random' ? COMMANDERS[Math.floor(Math.random() * COMMANDERS.length)]! : COMMANDERS.find(x => x.id === v);
        if (c) { this.cmdr = c.id; this.mp.faction = c.faction; this.coopTab = 'info'; }
        break;
      }
      case 'oneRace':
        this.oneRandom = v === 'random';
        if (!this.oneRandom) this.mp.faction = v as FactionType;
        break;
      case 'skEnemy': this.skirmish.enemyFaction = v as FactionType; break;
      case 'skMap': this.skirmish.mapId = v as MapId; break;
      case 'skDiff': this.skirmish.difficulty = v as DifficultyLevel; break;
      case 'campaignDiff': this.campaignDifficulty = v as DifficultyLevel | 'default'; break;
      case 'mpMode': this.mp.mode = v as GameModeType; break;
      case 'mpFaction': this.mp.faction = v as FactionType; break;
      case 'mpEnemy': this.mp.enemyFaction = v as FactionType; break;
      case 'mpMap':
        this.mp.mapId = v as MapId;
        if (MAP_LAYOUT_OF[v] && MAP_LAYOUT_OF[v] !== LAYOUT.id) this.reloadIntoMap(v as MapId);
        break;
      case 'mpDiff': this.mp.difficulty = v as DifficultyLevel; break;
      case 'guestFaction':
        this.mp.faction = v as FactionType;
        this.client?.relay({ t: 'pick', faction: v });
        break;
      case 'hostFaction':
        this.oneRandom = false;
        this.mp.faction = v as FactionType;
        break;
    }
    // Host changed race in the lobby (lobby picker, or the 1v1 race cards above it): update the guest's view
    if ((g === 'hostFaction' || g === 'oneRace') && this.lobby.kind === 'hosting') {
      this.rollRandomRace();
      this.client?.send({ t: 'config', config: this.hostConfig() });
    }
  }

  // ---------------------------------------------------------------------
  // Multiplayer lobby plumbing
  // ---------------------------------------------------------------------
  private async ensureClient(): Promise<NetTransport | null> {
    if (this.client && this.client.connected) return this.client;
    const c: NetTransport = useP2P() ? new P2PClient() : new NetClient();
    c.name = this.playerName;
    try {
      this.status = 'Connecting to multiplayer server…';
      this.render();
      await c.connect();
    } catch (err: any) {
      this.status = err?.message || 'Could not connect to the multiplayer server.';
      this.render();
      return null;
    }
    c.name = this.playerName;
    c.on(m => this.onLobbyMessage(m));
    this.client = c;
    Chat.attach(c);
    this.status = '';
    return c;
  }

  /** 1v1 "Random" race: roll it once when the game is created, so the lobby, the guest and the match all agree. */
  private rollRandomRace() {
    if (this.oneRandom && this.nav === 'versus') this.mp.faction = FACTIONS[Math.floor(Math.random() * FACTIONS.length)]!;
  }

  private hostConfig(): Partial<MatchConfig> {
    const pvp = this.mp.mode === 'multiplayer_pvp';
    return {
      mode: this.mp.mode,
      playerFaction: this.mp.faction,
      enemyFaction: pvp ? this.mp.enemyFaction : this.mp.enemyFaction,
      mapId: this.mp.mapId,
      difficulty: this.mp.difficulty,
      isPublic: this.mp.isPublic,
      gameName: this.mp.gameName.trim() || undefined,
      syncMode: preferredSyncMode()
    };
  }

  private async hostGame() {
    if (this.busy) return;
    const rehost = this.lobby.kind === 'hosting'; // visibility toggle: swap codes quietly, the lobby is already on screen
    if (!rehost) { this.setBusy('Creating game…'); this.status = ''; this.render(); }
    const c = await this.ensureClient();
    if (!c) { this.setBusy(null); this.render(); return; }
    c.name = this.playerName;
    if (!rehost) this.rollRandomRace();
    if (this.mp.mode === 'multiplayer_pvp') {
      // Guest picks their own faction in the lobby; default to a different one for variety
      this.mp.enemyFaction = this.mp.enemyFaction === this.mp.faction ? FACTIONS.find(f => f !== this.mp.faction)! : this.mp.enemyFaction;
    }
    c.host(this.hostConfig());
  }

  private async quickMatch() {
    if (this.busy) return;
    this.setBusy('Searching for games…');
    this.status = '';
    this.render();
    const c = await this.ensureClient();
    if (!c) { this.setBusy(null); this.render(); return; }
    c.name = this.playerName;
    this.rollRandomRace();
    c.quick(this.hostConfig());
  }

  private async joinByCode(code: string) {
    const clean = code.toUpperCase().trim();
    if (clean.length < 4) {
      this.status = 'Enter the 4-letter game code.';
      this.render();
      return;
    }
    if (this.busy) return;
    this.setBusy('Joining game…');
    this.status = '';
    this.render();
    const c = await this.ensureClient();
    if (!c) { this.setBusy(null); this.render(); return; }
    c.name = this.playerName;
    c.join(clean);
  }

  private onLobbyMessage(m: any) {
    switch (m.t) {
      case 'status':
        if (this.busy) this.busy = String(m.text || this.busy); // live progress text for the spinner row
        break;
      case 'listing':
        this.listingOk = !!m.ok;
        break;
      case 'hosted':
        if (useP2P() && typeof m.public === 'boolean') this.mp.isPublic = m.public; // a Quick Match room is public even though the player never ticked the box
        this.listingOk = m.via === 'slot' ? true : null;
        this.setBusy(null);
        this.lobby = { kind: 'hosting', code: m.code, guestName: null };
        this.status = '';
        break;
      case 'guest_joined':
        if (this.lobby.kind === 'hosting') this.lobby.guestName = m.name;
        break;
      case 'guest_left':
        if (this.lobby.kind === 'hosting') this.lobby.guestName = null;
        this.status = 'The other player left.';
        break;
      case 'joined': {
        const hm = m.config?.mapId as MapId | undefined;
        if (hm && MAP_LAYOUT_OF[hm] && MAP_LAYOUT_OF[hm] !== LAYOUT.id) { this.status = 'Loading the host\'s map…'; this.reloadIntoMap(hm, m.code); return; }
        this.setBusy(null);
        this.lobby = { kind: 'guest', code: m.code, hostName: m.hostName, config: m.config || {} };
        this.mp.faction = (m.config?.enemyFaction as FactionType) || this.mp.faction;
        this.status = '';
        break;
      }
      case 'config':
        if (this.lobby.kind === 'guest') this.lobby.config = m.config;
        break;
      case 'no_rooms':
        this.setBusy(null);
        this.status = 'No open games found — host one and share the code!';
        break;
      case 'error':
        this.setBusy(null);
        this.status = m.error;
        break;
      case 'peer_left':
        this.setBusy(null);
        this.lobby = { kind: 'browse' };
        this.status = 'The host left the game.';
        break;
      case 'disconnected':
        this.setBusy(null);
        if (this.isOpen) {
          this.lobby = { kind: 'browse' };
          this.status = 'Disconnected from the multiplayer server.';
        }
        break;
      case 'start':
        this.startMultiplayerMatch();
        return;
      case 'pick':
        break;
    }
    // Host receives the guest's faction pick relayed from the other peer
    if (m.t === 'pick' && this.lobby.kind === 'hosting' && this.mp.mode === 'multiplayer_pvp') {
      this.mp.enemyFaction = m.faction as FactionType;
      this.client?.send({ t: 'config', config: this.hostConfig() });
    }
    if (this.isOpen && this.isMultiplayerView()) this.render();
  }

  private startMultiplayerMatch() {
    const client = this.client;
    if (!client) return;
    const isHost = this.lobby.kind === 'hosting';
    const cfg: Partial<MatchConfig> = isHost
      ? this.hostConfig()
      : (this.lobby.kind === 'guest' ? { ...this.lobby.config } : {});
    if (!isHost && cfg.mode === 'multiplayer_pvp') {
      cfg.enemyFaction = this.mp.faction; // guest's chosen faction; host is told via 'pick'
    }
    this.close();
    this.client = null; // ownership moves to the app / NetSync
    this.app.startMultiplayer(isHost ? 'host' : 'guest', cfg, client);
  }

  private leaveLobby() {
    this.setBusy(null);
    Chat.detach();
    this.client?.leave();
    this.lobby = { kind: 'browse' };
    this.status = '';
    this.render();
  }

  private startRoomPolling() {
    if (this.roomUnsub) return;
    this.roomUnsub = roomBrowser.subscribe(st => {
      this.rooms = st.rooms;
      this.roomsPhase = st.phase;
      this.roomsSource = st.source;
      if (!this.isOpen || !this.isMultiplayerView() || this.lobby.kind !== 'browse') return;
      // Swap just the list in place: keeps scroll position, focus and an open dropdown (a full render() would reset them)
      const body = this.el.querySelector<HTMLElement>('.rl-body');
      if (body) {
        body.innerHTML = this.roomListBodyHtml((body.dataset.mode || null) as GameModeType | null);
        const n = st.rooms.filter(r => r.mode === 'multiplayer_pvp' && (!r.status || r.status === 'open')).length;
        this.el.querySelectorAll('.rl-count').forEach(e => { e.textContent = `${n} open game${n === 1 ? '' : 's'} right now.`; });
        return;
      }
      const typing = document.activeElement && (document.activeElement as HTMLElement).tagName === 'INPUT';
      if (!typing) this.render();
    });
    // "Refreshing" spinner: toggled straight on the DOM (no re-render); CSS delays its appearance so quick refreshes stay invisible
    this.refreshUnsub = roomBrowser.onRefreshing(b => this.el.querySelectorAll('.rl-spin').forEach(e => e.classList.toggle('on', b && this.roomsPhase === 'ready')));
    this.rooms = roomBrowser.state.rooms;
    this.roomsPhase = roomBrowser.state.phase;
    this.roomsSource = roomBrowser.state.source;
    roomBrowser.start();
  }
  private stopRoomPolling() {
    if (!this.roomUnsub) return;
    this.roomUnsub();
    this.refreshUnsub?.();
    this.roomUnsub = this.refreshUnsub = null;
    roomBrowser.stop();
  }

  /** Big switch under the invite link: Public (listed in Open Games) vs Private (code / link only). Locked once a guest has joined. */
  private visibilityToggle(locked: boolean): string {
    const pub = this.mp.isPublic;
    // the second line doubles as the live listing status, so the lobby stays short enough to keep START GAME on screen
    const sub = !pub ? 'Hidden - join by code or link only'
      : this.listingOk === null ? 'Listing your game in Open Games…'
      : this.listingOk ? '✓ Visible in Open Games - anyone can join'
      : '⚠ Not visible right now - retrying (code still works)';
    const cls = pub && this.listingOk === false ? ' warn' : '';
    return `<button class="vis-toggle ${pub ? 'on' : ''}${cls}" role="switch" aria-checked="${pub}" data-act="mp-public" ${locked ? 'disabled' : ''} title="${locked ? 'Visibility is locked once a player joins' : 'Switching gives the game a new code and link'}">
        <span class="vis-text"><b>${pub ? 'Public' : 'Private'}</b><small>${this.escape(sub)}</small></span>
        <span class="vis-switch"><i></i></span>
      </button>`;
  }

  /** Start / stop the "working…" state. The spinner itself fades in after ~400ms (CSS), so quick actions never flash it. */
  private setBusy(text: string | null) {
    this.busy = text;
    this.busySlow = false;
    const seq = ++this.busySeq;
    if (text) {
      window.setTimeout(() => {
        if (seq === this.busySeq && this.busy) { this.busySlow = true; if (this.isOpen) this.render(); }
      }, 9000);
    }
  }

  private inviteLink(code: string) {
    const params = new URLSearchParams(location.search);
    const relay = params.get('relay');
    const p2p = params.has('p2p') ? `&p2p=${params.get('p2p')}` : '';
    return `${location.origin}${location.pathname}?join=${code}${relay ? '&relay=' + encodeURIComponent(relay) : ''}${p2p}`;
  }

  private copy(text: string) {
    const done = () => this.app.ui.showToast('Copied to clipboard!');
    try {
      navigator.clipboard.writeText(text).then(done, () => this.fallbackCopy(text));
    } catch {
      this.fallbackCopy(text);
    }
  }
  private fallbackCopy(text: string) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
    this.app.ui.showToast('Copied to clipboard!');
  }

  private escape(s: string) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  }
}
