export interface ClassicalTrackInfo {
  id: string;
  title: string;
  composer: string;
  situation: string;
  url: string;
}

export const CLASSICAL_SOUNDTRACK: ClassicalTrackInfo[] = [
  {
    id: 'frontier_of_the_stars',
    title: 'Frontier of the Stars',
    composer: 'OpenSlop II Original',
    situation: 'Base Building & Expansion',
    url: '/audio/music/frontier_of_the_stars.mp3'
  },
  {
    id: 'a_new_beginning',
    title: 'A New Beginning',
    composer: 'OpenSlop II Original',
    situation: 'Exploring / Calm',
    url: '/audio/music/a_new_beginning.mp3'
  },
  {
    id: 'interstellar_conflict',
    title: 'Interstellar Conflict',
    composer: 'OpenSlop II Original',
    situation: 'Skirmishes & Major Battle',
    url: '/audio/music/interstellar_conflict.mp3'
  },
  {
    id: 'frontier_starfire_1',
    title: 'Frontier Starfire (Part 1)',
    composer: 'OpenSlop II Original',
    situation: 'Massive Assault / Large-Scale Conflict',
    url: '/audio/music/frontier_starfire_1.mp3'
  },
  {
    id: 'frontier_starfire_2',
    title: 'Frontier Starfire (Part 2)',
    composer: 'OpenSlop II Original',
    situation: 'Final Battle / Air Strike',
    url: '/audio/music/frontier_starfire_2.mp3'
  },
  {
    id: 'shadow_of_conquest',
    title: 'Shadow of Conquest',
    composer: 'OpenSlop II Original',
    situation: 'Massive Assault / Air Strike',
    url: '/audio/music/shadow_of_conquest.mp3'
  },
  {
    id: 'in_the_distance_war',
    title: 'In the Distance, War',
    composer: 'OpenSlop II Original',
    situation: 'Near Defeat',
    url: '/audio/music/in_the_distance_war.mp3'
  },
  {
    id: 'looming_shadow',
    title: 'Looming Shadow',
    composer: 'OpenSlop II Original',
    situation: 'Enemy Nearby / Near Defeat',
    url: '/audio/music/looming_shadow.mp3'
  }
];

const SFX_FILES = ['void-ray-beam', 'photon-cannon', 'machine-gun', 'deep-boom', 'marine', '8-shots-rapid-fire', 'probe', 'tempest', 'go-into-siege-mode', 'go-into-tank-mode', 'lift-off', 'land', 'larva-hatch-squish-short', 'zerg-death-splat', 'squish-fast', 'squish-fast-loud', 'futuristic-whoosh',
  'protoss-warp-in', 'zerg-building-die', 'zerg-create-bldg', 'building-collapse', 'medium-explosion', 'big-explosion',
  'terran-death1', 'terran-death2', 'terran-death3', 'terran-death4', 'terran-death5', 'deep-growl', 'ultralisk-hello',
  'cannon1', 'cannon2', 'tank-mode-attack',
  'explode', 'boom-explode', 'building-smash', 'metallic-energy', 'big-animal-attack', 'banshee', 'throw', 'fiery-swoosh', 'whoosh-pulse', 'system-active', 'ghost-attack-new', 'ghost-snipe', 'shotgun-load-sound-unit-ready',
  'growl1', 'growl2', 'growl3', 'growl4', 'growl5', 'growl6', 'growl7', 'growl8', 'growl9', 'growl10', 'growl11', 'repair', 'pr-laser', 'pr-laser-quick', 'pr-laser-short',
  'pr-activate', 'pr-comm1', 'pr-comm2', 'pr-comm3', 'pr-mechdie1', 'pr-mechdie2', 'pr-mechdie3', 'pr-move1', 'pr-move2', 'pr-probe1', 'pr-probe2', 'pr-probe3', 'pr-probe4', 'pr-probe5', 'pr-radar1', 'pr-radar2', 'pr-speech1', 'pr-talk1', 'zg-die-big', 'zg-die-muta', 'zg-flyby', 'zg-growl-trex', 'zg-roar-deep', 'zg-roar-lion', 'zg-roar-monster', 'zg-roar-muta', 'zg-roar-raptor', 'zg-roar-trex', 'zg-roar-ultra', 'zg-sniff1', 'zg-sniff2', 'zg-sniff3', 'zg-sniff4', 'zg-sniff5', 'zg-sniff6', 'zg-sniff7', 'zg-sniff8',
  'zerg-hatch-sound', 'zerg-small-death', 'zerg-slime', 'larva-egg-slime', 'zerg-fling', 'hydralisk-attack', 'zerg-attack', 'zerg-squish-pop'];
const ZERG_TYPES = ['zergling', 'roach', 'hydralisk', 'drone', 'mutalisk', 'queen', 'baneling', 'ravager', 'ultralisk', 'broodlord', 'viper', 'overlord', 'swarm_host', 'infestor', 'lurker', 'overseer', 'corruptor'];
const PROTOSS_TYPES = ['zealot', 'stalker', 'archon', 'probe', 'void_ray', 'sentry', 'immortal', 'colossus', 'carrier', 'tempest', 'adept', 'observer', 'warp_prism', 'disruptor', 'phoenix', 'oracle', 'mothership'];
const PROTOSS_MECH = ['immortal', 'colossus', 'sentry', 'tempest', 'carrier', 'void_ray', 'observer', 'warp_prism', 'disruptor', 'phoenix', 'oracle', 'mothership'];
const TERRAN_INFANTRY = ['marine', 'marauder', 'scv', 'medic', 'firebat', 'ghost', 'reaper'];

export class SoundSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private sfxDuck: GainNode | null = null;   // sfxGain -> sfxDuck -> master (voice ducking)
  private musicDuck: GainNode | null = null; // musicGain -> musicDuck -> master
  private isMuted: boolean = false;
  private lastVoiceTime: number = 0;
  private ambientOsc: OscillatorNode | null = null;

  // Classical BG Music Dual-Deck Crossfade Engine
  // Default BG music volume % is 35% (sensible RTS standard so unit voices & SFX stay clear)
  public musicVolumePercent: number = 5;
  public musicMode: 'auto' | string = 'auto';
  public currentTrackId: string = 'frontier_of_the_stars';
  public currentSituationLabel: string = 'Base Building & Expansion';
  // Music decks are routed through Web Audio (MediaElementSource -> per-deck gain -> musicGain -> master): iOS/iPadOS ignore
  // HTMLMediaElement.volume, so this is the only way volume + mute work there.
  private deckGainA: GainNode | null = null;
  private deckGainB: GainNode | null = null;
  private musicViaWebAudio = false;
  private deckBPrimed = false;
  /** Called whenever mute state changes (UI keeps its speaker icon in sync, whatever triggered the change). */
  public onMuteChange: ((muted: boolean) => void) | null = null;
  private deckA: HTMLAudioElement | null = null;
  private deckB: HTMLAudioElement | null = null;
  private activeDeck: 'A' | 'B' = 'A';
  private crossfadeProgress: number = 1.0; // 1.0 = complete
  private crossfadeDuration: number = 2.8; // 2.8s buttery smooth crossfade
  private stateHoldTimer: number = 0;
  private musicStarted: boolean = false;
  private lastLockBeepTime: number = 0;

  // Custom audio buffers for Marine and Marauder weapons
  private smgBuffer: AudioBuffer | null = null;
  private kickBuf: Record<string, AudioBuffer> = {};
  private placeBuf: AudioBuffer | null = null;
  /** One-shot samples from public/audio/sfx (see SFX_FILES), decoded on init. */
  private sfxBuf: Record<string, AudioBuffer> = {};
  private wraithBuf: (AudioBuffer | null)[] = [null, null];
  private autorifleBuffer: AudioBuffer | null = null;
  private smgOffsets = [0.47, 0.85, 1.45, 2.38, 3.05, 4.10, 5.05, 5.55, 6.20, 6.65, 7.25, 7.65];
  private autorifleOffsets = [0.035, 0.35, 0.65, 0.90, 1.10, 1.35, 1.60];

  constructor() {
    this.init();
    this.preloadSfx('confirm_beep'); // menu / countdown beep: ready before the first click
  }


  // ---------- Positional audio: pan + distance attenuation + simultaneous-sound cap ----------
  private listenerX = 0;
  private listenerZ = 0;
  private listenerRadius = 0; // 0 = no listener set yet -> sounds play flat
  private pendingPos: { x: number; y: number } | null = null;
  private pendingNode: AudioNode | null = null;
  private recentSfx: number[] = [];

  /** Camera focus (world x/z) and camera distance; sounds scale their audible radius with zoom. */
  public setListener(x: number, z: number, cameraDistance: number) {
    this.listenerX = x;
    this.listenerZ = z;
    this.listenerRadius = 28 + cameraDistance * 0.9;
  }

  /** Place the next sound (the one played synchronously after this call) at world position x,y. Chainable. */
  public at(x: number, y: number): this {
    this.pendingPos = (Number.isFinite(x) && Number.isFinite(y)) ? { x, y } : null;
    this.pendingNode = null;
    if (this.pendingPos) queueMicrotask(() => { this.pendingPos = null; this.pendingNode = null; });
    return this;
  }

  /** Output node for SFX layers: panned/attenuated when positioned via at(), the plain SFX bus otherwise. */
  private sfxDest(): AudioNode {
    const bus = this.sfxGain!;
    const pos = this.pendingPos;
    if (!pos || !this.ctx || this.listenerRadius <= 0) return bus;
    if (this.pendingNode) return this.pendingNode;
    const now = performance.now();
    this.recentSfx = this.recentSfx.filter(t => now - t < 120);
    const R = this.listenerRadius;
    const dx = pos.x - this.listenerX, dz = pos.y - this.listenerZ;
    const d = Math.hypot(dx, dz);
    const falloff = d < R * 0.35 ? 1 : Math.max(0, 1 - (d - R * 0.35) / (R * 1.5));
    const g = falloff * falloff;
    const crowded = this.recentSfx.length >= 12; // too many at once: only the closest/loudest survive
    const node = this.ctx.createGain();
    if (g < 0.03 || (crowded && g < 0.6)) {
      node.gain.value = 0; // inaudible / culled: left unconnected
    } else {
      this.recentSfx.push(now);
      node.gain.value = g * (crowded ? 0.6 : 1);
      try {
        const pan = this.ctx.createStereoPanner();
        pan.pan.value = Math.max(-0.85, Math.min(0.85, dx / R));
        node.connect(pan);
        pan.connect(bus);
      } catch { node.connect(bus); }
    }
    this.pendingNode = node;
    return node;
  }

  // ---------- Voice ducking ----------
  private duckEnd = 0;
  private duckDepth = 1;
  private duckDepthSfx = 1;

  /** Dip music + SFX for `seconds` so a voice line stays intelligible. 'adjutant' ducks harder than unit chatter. */
  public duck(seconds: number, level: 'unit' | 'adjutant' = 'unit') {
    if (!this.ctx || !this.musicDuck || !this.sfxDuck) return;
    const t = this.ctx.currentTime;
    const active = this.t() < this.duckEnd;
    const mLow = Math.min(active ? this.duckDepth : 1, level === 'adjutant' ? 0.2 : 0.38);
    const sLow = Math.min(active ? this.duckDepthSfx : 1, level === 'adjutant' ? 0.42 : 0.62);
    this.duckDepth = mLow;
    this.duckDepthSfx = sLow;
    const end = Math.max(active ? this.duckEnd : 0, this.t() + seconds);
    this.duckEnd = end;
    for (const [node, low] of [[this.musicDuck, mLow], [this.sfxDuck, sLow]] as [GainNode, number][]) {
      const g = node.gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(low, t, 0.05);
      g.setTargetAtTime(1, t + Math.max(0.05, end - this.t()), 0.4);
    }
  }

  /** End any active duck early (voice stopped / speech finished). */
  public releaseDuck() {
    if (!this.ctx || !this.musicDuck || !this.sfxDuck) return;
    const t = this.ctx.currentTime;
    this.duckEnd = 0;
    this.duckDepth = 1;
    this.duckDepthSfx = 1;
    for (const node of [this.musicDuck, this.sfxDuck]) { node.gain.cancelScheduledValues(t); node.gain.setTargetAtTime(1, t, 0.3); }
  }

  /** Play a loaded one-shot sample (positional like every other sfx). Returns false when it isn't loaded / muted so callers can fall back. */
  public playSfx(name: string, vol = 0.8, rate = 1, jitter = 0.05): boolean {
    const buf = this.sfxBuf[name];
    if (!buf || !this.ctx || !this.sfxGain || this.isMuted) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 - jitter + Math.random() * jitter * 2);
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(this.sfxDest());
    src.start();
    return true;
  }

  // ---------- Looping positional sounds (Void Ray beams) ----------
  private loops = new Map<string, { src: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode | null; vol: number; fadeEnd: number }>();

  /** Distance gain and pan for world position x,y relative to the camera listener (same falloff as sfxDest). */
  private spatial(x: number, y: number): { g: number; pan: number } {
    const R = this.listenerRadius;
    if (R <= 0) return { g: 1, pan: 0 };
    const dx = x - this.listenerX, dz = y - this.listenerZ;
    const d = Math.hypot(dx, dz);
    const falloff = d < R * 0.35 ? 1 : Math.max(0, 1 - (d - R * 0.35) / (R * 1.5));
    return { g: falloff * falloff, pan: Math.max(-0.85, Math.min(0.85, dx / R)) };
  }

  /**
   * Start (or keep alive and re-position) a looping sample under `id`, e.g. one per firing Void Ray.
   * Call every frame while the sound should play; stopLoop(id) cuts it.
   */
  public setLoop(id: string, name: string, x: number, y: number, vol = 0.6) {
    if (!this.ctx || !this.sfxGain) return;
    try {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
      let l = this.loops.get(id);
      if (!l) {
        const buf = this.sfxBuf[name];
        if (!buf) { this.loadSfx(name); return; }   // not decoded yet: fetch it now, the next frame starts the loop
        if (this.isMuted) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        // skip the mp3 encoder padding at both ends so the loop point is seamless
        src.loopStart = Math.min(0.03, buf.duration * 0.1);
        src.loopEnd = Math.max(src.loopStart + 0.1, buf.duration - 0.06);
        const gain = this.ctx.createGain();
        let pan: StereoPannerNode | null = null;
        src.connect(gain);
        try { pan = this.ctx.createStereoPanner(); gain.connect(pan); pan.connect(this.sfxGain); }
        catch { pan = null; gain.connect(this.sfxGain); }
        l = { src, gain, pan, vol, fadeEnd: 0 };
        this.loops.set(id, l);
        this.applyLoopLevel(l, x, y);
        // 30ms fade-in: starting at full volume mid-waveform clicks
        const t = this.ctx.currentTime, target = gain.gain.value;
        l.fadeEnd = t + 0.03;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(target, l.fadeEnd);
        src.start(t, src.loopStart + Math.random() * 0.5);   // random phase so several beams don't phase-stack
        return;
      }
      l.vol = vol;
      this.applyLoopLevel(l, x, y);
    } catch (e) {
      if (!this.loopWarned) { this.loopWarned = true; console.warn('[sound] loop failed:', e); }
    }
  }
  private loopWarned = false;
  private sfxLoading = new Set<string>();

  /** Start loading a sample from public/audio/sfx now, so a later playSfx(name) finds it. */
  public preloadSfx(name: string) { this.loadSfx(name); }

  /** Fetch + decode one sample from public/audio/sfx on demand (once). */
  private loadSfx(name: string) {
    if (!this.ctx || this.sfxBuf[name] || this.sfxLoading.has(name)) return;
    this.sfxLoading.add(name);
    fetch(`/audio/sfx/${name}.mp3`).then(r => (r.ok ? r.arrayBuffer() : null)).then(buf => buf && this.ctx!.decodeAudioData(buf))
      .then(ab => { if (ab) this.sfxBuf[name] = ab; else console.warn('[sound] missing sample', name); })
      .catch(e => console.warn('[sound] could not load', name, e))
      .finally(() => this.sfxLoading.delete(name));
  }

  /**
   * Loop volume + pan for its world position. Set directly (like every one-shot) rather than through
   * per-frame AudioParam automation, which Safari / iOS can leave stuck at the starting value (silence).
   */
  private applyLoopLevel(l: { gain: GainNode; pan: StereoPannerNode | null; vol: number; fadeEnd: number }, x: number, y: number) {
    if (this.ctx && this.ctx.currentTime < l.fadeEnd) return;   // let the fade-in finish
    const sp = this.spatial(x, y);
    // many beams at once: total loudness grows slowly instead of linearly
    const crowd = 1 / Math.sqrt(Math.max(1, this.loops.size));
    const g = this.isMuted ? 0 : l.vol * sp.g * crowd;
    l.gain.gain.value = Number.isFinite(g) ? g : 0;
    if (l.pan && Number.isFinite(sp.pan)) l.pan.pan.value = sp.pan;
  }

  /** Cut a loop started by setLoop. */
  public stopLoop(id: string) {
    const l = this.loops.get(id);
    if (!l || !this.ctx) return;
    this.loops.delete(id);
    try { l.src.stop(); } catch { /* already stopped */ }
    try { l.src.disconnect(); l.gain.disconnect(); l.pan?.disconnect(); } catch { /* ignore */ }
  }

  /** Ids of the loops currently playing. */
  public loopIds(): string[] { return [...this.loops.keys()]; }

  /** Play part of a loaded sample: from `offset` for `dur` seconds, fading out over the last `fade` seconds. Returns false when not loaded / muted. */
  public playSfxPart(name: string, offset: number, dur: number, fade: number, vol = 0.8, rate = 1, jitter = 0.05): boolean {
    const buf = this.sfxBuf[name];
    if (!buf || !this.ctx || !this.sfxGain || this.isMuted) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 - jitter + Math.random() * jitter * 2);
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime, real = dur / src.playbackRate.value;
    g.gain.setValueAtTime(vol, t);
    g.gain.setValueAtTime(vol, t + Math.max(0, real - fade));
    g.gain.linearRampToValueAtTime(0, t + real);
    src.connect(g); g.connect(this.sfxDest());
    src.start(t, offset, dur + 0.02);
    return true;
  }

  /**
   * Rapid-fire machine gun burst (Auto-Turret, Viking Assault-mode Gatling, Goliath autocannons).
   * The clip is an ~0.55s burst plus a long tail; `len` trims it so back-to-back attacks don't pile up.
   */
  public playMachineGun(len = 0.62, vol = 0.5, rate = 1) {
    if (!this.playSfxPart('machine-gun', 0.03, len, 0.14, vol, rate, 0.04)) this.playMarineAttack();
  }

  /** Deep cannon boom (Planetary Fortress Ibiks Cannon, Thor's Hammer). */
  public playDeepBoom(vol = 0.7, rate = 1) {
    if (!this.playSfx('deep-boom', vol, rate, 0.04)) this.playSiegeTankAttack();
  }

  /** Photon Cannon shot. Falls back to the old beam zap. */
  public playPhotonCannon() { if (!this.playSfx('photon-cannon', 0.85, 1, 0.04)) this.playHealBeam(); }

  /** Plays one random sample of `names`. */
  public playSfxOf(names: string[], vol = 0.8, rate = 1, jitter = 0.05): boolean {
    return this.playSfx(names[Math.floor(Math.random() * names.length)]!, vol, rate, jitter);
  }
  private lastGrowl = 0;
  /** Zerg growl (rate-limited): a random clip cut from growls.mp3; the big Zerg get the deep growl / Ultralisk greeting. */
  public playZergGrowl(unitType: string, vol = 0.7): boolean {
    const now = Date.now();
    if (now - this.lastGrowl < 700) return true;
    this.lastGrowl = now;
    const sn = (n: number) => Array.from({ length: n }, (_, i) => `zg-sniff${i + 1}`);
    const pool: Record<string, [string[], number]> = {
      ultralisk: [['ultralisk-hello', 'deep-growl', 'zg-roar-ultra'], 1.1], broodlord: [['deep-growl', 'zg-roar-deep'], 1],
      mutalisk: [['zg-roar-muta', 'zg-flyby'], 0.9], hydralisk: [['zg-roar-lion', 'zg-roar-raptor', 'growl1', 'growl2'], 1],
      roach: [['zg-growl-trex', 'growl3', 'growl4', 'growl5'], 1], queen: [['zg-growl-trex', 'zg-roar-monster'], 0.9],
      ravager: [['zg-roar-lion', 'zg-roar-monster'], 1], baneling: [['zg-roar-raptor', ...sn(3)], 0.7],
      zergling: [['zg-roar-raptor', ...sn(4)], 0.7], drone: [[...sn(8)], 0.8], overlord: [[...sn(8)], 0.6], viper: [['zg-roar-monster', 'zg-roar-raptor'], 0.8],
      lurker: [['zg-growl-trex', 'deep-growl', 'zg-roar-lion'], 0.9], corruptor: [['zg-roar-muta', 'zg-flyby'], 0.85], overseer: [[...sn(8)], 0.6],
    };
    const e = pool[unitType];
    if (e) { const small = unitType === 'zergling' || unitType === 'baneling'; if (this.playSfxOf(e[0], vol * e[1], small ? 1.3 : unitType === 'overlord' ? 0.8 : 1, 0.06)) return true; }
    const small = unitType === 'zergling' || unitType === 'drone' || unitType === 'baneling';
    return this.playSfxOf(['growl1', 'growl2', 'growl3', 'growl4', 'growl5', 'growl6', 'growl7', 'growl8', 'growl9', 'growl10', 'growl11'], vol, small ? 1.35 : 1, 0.06);
  }

  // ---- main menu: silent (no theme, the classical decks stay muted while the menu is open) ----
  private menuMusicOn = false;
  public startMenuMusic() {
    this.menuMusicOn = true;
    this.applyDeckVolumes();
  }
  public stopMenuMusic() {
    this.menuMusicOn = false;
    this.applyDeckVolumes();
  }

  /** The short comms "acknowledge" beep that plays before campaign dialogue: menu picks and every second of the start countdown. */
  public playAck(vol = 0.6) {
    if (this.ctx?.state === 'suspended') void this.ctx.resume().catch(() => {});
    this.preloadSfx('confirm_beep');
    this.playSfx('confirm_beep', vol, 1, 0);
  }

  private t(): number { return this.ctx ? this.ctx.currentTime : 0; }

  public init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.6;
      this.sfxDuck = this.ctx.createGain();
      this.sfxDuck.connect(this.masterGain);
      this.sfxGain.connect(this.sfxDuck);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 2.0; // x master 0.5 = unity; the user's music % is applied per deck
      this.musicDuck = this.ctx.createGain();
      this.musicDuck.connect(this.masterGain);
      this.musicGain.connect(this.musicDuck);

      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = 0.8;
      this.voiceGain.connect(this.masterGain);

      this.loadCustomWeaponAudio();
      this.initClassicalMusicSystem();
      this.installAudioUnlock();
    } catch (e) {
      console.warn('AudioContext failed to initialize:', e);
    }
  }

  private async loadCustomWeaponAudio() {
    if (!this.ctx) return;
    ['/audio/banshee_fire.mp3', '/audio/banshee_fire.mp3'].forEach((url, i) => {
      fetch(url).then(r => (r.ok ? r.arrayBuffer() : null)).then(buf => buf && this.ctx!.decodeAudioData(buf)).then(ab => { if (ab) this.wraithBuf[i] = ab; }).catch(() => {});
    });
    ['deep', 'boom', 'bass', '909'].forEach(k => {
      fetch(`/audio/kicks/${k}.wav`).then(r => (r.ok ? r.arrayBuffer() : null)).then(buf => buf && this.ctx!.decodeAudioData(buf)).then(ab => { if (ab) this.kickBuf[k] = ab; }).catch(() => {});
    });
    for (const k of SFX_FILES) {
      fetch(`/audio/sfx/${k}.mp3`).then(r => (r.ok ? r.arrayBuffer() : null)).then(buf => buf && this.ctx!.decodeAudioData(buf)).then(ab => { if (ab) this.sfxBuf[k] = ab; }).catch(() => {});
    }
    fetch('/audio/build_place.mp3').then(r => (r.ok ? r.arrayBuffer() : null)).then(buf => buf && this.ctx!.decodeAudioData(buf)).then(ab => { if (ab) this.placeBuf = ab; }).catch(() => {});
    try {
      const [smgRes, autoRes] = await Promise.all([
        fetch('/audio/smg.mp3'),
        fetch('/audio/autorifle.mp3')
      ]);

      if (smgRes.ok && this.ctx) {
        const buf = await smgRes.arrayBuffer();
        this.ctx.decodeAudioData(buf, (decoded) => {
          this.smgBuffer = decoded;
        }, (err) => console.warn('Error decoding smg.mp3:', err));
      }

      if (autoRes.ok && this.ctx) {
        const buf = await autoRes.arrayBuffer();
        this.ctx.decodeAudioData(buf, (decoded) => {
          this.autorifleBuffer = decoded;
        }, (err) => console.warn('Error decoding autorifle.mp3:', err));
      }
    } catch (e) {
      console.warn('Could not load custom weapon sounds:', e);
    }
  }

  public resume() {
    if (!this.ctx) {
      this.init();
    }
    this.loadVoiceManifest();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.ensureMusicPlaying();
  }

  public isAudioMuted(): boolean { return this.isMuted; }

  public setMuted(muted: boolean): boolean {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      const g = this.masterGain.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(this.isMuted ? 0 : 0.5, t, 0.015);
    }
    if (this.isMuted) {
      // silence anything already speaking / playing a voice clip
      if (this.voiceSource) { try { this.voiceSource.stop(); } catch { /* already stopped */ } }
      if (this.adjutantSource) { try { this.adjutantSource.stop(); } catch { /* already stopped */ } }
      this.adjutantQueue = [];
      this.releaseDuck();
      try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch { /* ignore */ }
    } else {
      this.resume();
    }
    this.applyDeckVolumes();
    this.onMuteChange?.(this.isMuted);
    return this.isMuted;
  }

  public toggleMute(): boolean {
    return this.setMuted(!this.isMuted);
  }

  /**
   * Browsers (iOS Safari above all) keep audio locked until a user gesture, and WebKit needs the AudioContext resumed from
   * a touchend/click (not touchstart). Resume on every gesture until audio is running, prime the second music deck so
   * crossfades can start without a gesture, ask iOS for the "playback" audio session (so the silent switch doesn't mute
   * Web Audio), and recover from iOS "interrupted" state when returning to the tab.
   */
  private installAudioUnlock() {
    try {
      const as = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (as) as.type = 'playback';
    } catch { /* unsupported */ }
    const unlock = () => {
      const c = this.ctx;
      if (!c) return;
      if (c.state === 'running' && this.musicStarted && this.deckBPrimed) return;
      if (c.state !== 'running') c.resume().catch(() => { /* retried on next gesture */ });
      try { // iOS: a silent one-sample buffer inside the gesture fully unlocks the context
        const src = c.createBufferSource();
        src.buffer = c.createBuffer(1, 1, 22050);
        src.connect(c.destination);
        src.start(0);
      } catch { /* ignore */ }
      this.ensureMusicPlaying();
      this.loadVoiceManifest();
      if (!this.deckBPrimed && this.deckB && this.musicStarted) {
        this.deckBPrimed = true; // touch the second element once inside a gesture so later crossfades may call play()
        this.deckB.play().then(() => { if (this.crossfadeProgress >= 1 && this.activeDeck === 'A') this.deckB!.pause(); }).catch(() => { this.deckBPrimed = false; });
      }
    };
    for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.ctx?.resume().catch(() => { /* needs gesture */ }); });
    if (this.ctx) this.ctx.onstatechange = () => { if (this.ctx && this.ctx.state === 'interrupted' as AudioContextState) this.ctx.resume().catch(() => { /* needs gesture */ }); };
  }

  // Ace Combat Missile Lock-On Audio Tone (Tracking beep -> Rapid lock tone)
  public playLockOnTone(isLocked: boolean) {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const nowMs = performance.now();
    const minInterval = isLocked ? 140 : 320;
    if (nowMs - this.lastLockBeepTime < minInterval) return;
    this.lastLockBeepTime = nowMs;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isLocked ? 1480 : 980, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(isLocked ? 0.14 : 0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isLocked ? 0.09 : 0.06));

    osc.connect(gain);
    gain.connect(this.sfxDest());
    osc.start(now);
    osc.stop(now + (isLocked ? 0.1 : 0.07));
  }

  private createNoiseBuffer(): AudioBuffer {
    if (!this.ctx) throw new Error('No audio context');
    const bufferSize = this.ctx.sampleRate * 1.5;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /** Wraith attack: vs air a pair (deep cannon thump, then bright blaster ~110 ms later = one per wing); vs ground a single blaster shot. */
  public playWraithFire(vsAir = true) {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const [a, b] = this.wraithBuf;
    if (!a || !b) { this.playMarineAttack(); return; }
    const now = this.ctx.currentTime;
    const dest = this.sfxDest();
    // vs air: Gemini Missiles = two shots, one per wing; vs ground: a single Burst Laser shot
    const shots = vsAir ? [[a, 0, 0.8], [b, 0.11, 0.65]] : [[b, 0, 0.8]];
    shots.forEach(([buf, delay, vol]) => {
      const src = this.ctx!.createBufferSource();
      src.buffer = buf as AudioBuffer;
      src.playbackRate.value = 0.97 + Math.random() * 0.06;
      const g = this.ctx!.createGain();
      g.gain.value = vol as number;
      src.connect(g); g.connect(dest);
      src.start(now + (delay as number));
    });
  }

  /** Ghost / Nova rifle shot (public/audio/sfx/ghost-attack-new.mp3); falls back to the marine rifle. */
  public playGhostAttack() {
    if (this.isMuted) return;
    if (this.playSfx('ghost-attack-new', 0.85, 1, 0.05)) return;
    this.playMarineAttack();
  }

  /** Ghost Snipe shot (public/audio/sfx/ghost-snipe.mp3); falls back to the heavy cannon. */
  public playGhostSnipe() {
    if (this.isMuted) return;
    if (this.playSfx('ghost-snipe', 1, 1, 0.02)) return;
    this.playHeavyCannonAttack?.();
  }

  // Unit Gauss Rifle Fire (Marine) - uses custom smg.mp3 with procedural fallback
  public playMarineAttack() {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    if (this.sfxBuf['marine']) {
      // marine.mp3 is the main shot; now and then the 8-shot burst
      if (Math.random() < 0.25 && this.playSfx('8-shots-rapid-fire', 0.6, 1, 0.04)) return;
      if (this.playSfx('marine', 0.85, 1, 0.06)) return;
    }

    if (this.smgBuffer) {
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = this.smgBuffer;
        // Subtle pitch variance for realistic automatic fire
        source.playbackRate.setValueAtTime(0.96 + Math.random() * 0.08, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.85, now);
        gain.gain.setValueAtTime(0.85, now + 0.22);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

        source.connect(gain);
        gain.connect(this.sfxDest());

        const offset = this.smgOffsets[Math.floor(Math.random() * this.smgOffsets.length)]!;
        source.start(now, offset, 0.34);
        return;
      } catch (e) {
        // Fallback to procedural
      }
    }

    // Fast noise burst
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.Q.setValueAtTime(3, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxDest());

    noise.start(now);
    noise.stop(now + 0.09);

    // Punch tone
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.07);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);

    osc.connect(oscGain);
    oscGain.connect(this.sfxDest());

    osc.start(now);
    osc.stop(now + 0.08);
  }

  // Heavy cannon (Solaris Immortal)
  public playHeavyCannonAttack() {
    if (this.playSfx('boom-explode', 0.85, 1, 0.04)) return;
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Heavy bass punch
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.14);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

    osc.connect(gain);
    gain.connect(this.sfxDest());

    osc.start(now);
    osc.stop(now + 0.15);

    // Twin Autocannon crack
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.Q.setValueAtTime(4, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxDest());

    noise.start(now);
    noise.stop(now + 0.13);
  }

  // Marauder Concussive Shells - uses custom autorifle.mp3 with procedural fallback
  public playMarauderAttack() {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    if (this.autorifleBuffer) {
      try {
        const source = this.ctx.createBufferSource();
        source.buffer = this.autorifleBuffer;
        // Heavy, booming concussive round pitch
        source.playbackRate.setValueAtTime(0.88 + Math.random() * 0.06, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.95, now);
        gain.gain.setValueAtTime(0.95, now + 0.28);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.40);

        source.connect(gain);
        gain.connect(this.sfxDest());

        const offset = this.autorifleOffsets[Math.floor(Math.random() * this.autorifleOffsets.length)]!;
        source.start(now, offset, 0.42);
        return;
      } catch (e) {
        // Fallback to procedural
      }
    }

    // Deep thump
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.25);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxDest());

    osc.start(now);
    osc.stop(now + 0.26);

    // Crackle
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxDest());

    noise.start(now);
    noise.stop(now + 0.22);
  }

  // Devastating Siege Cannon Artillery Blast
  /** Siege Tank: cannon1 / cannon2 in siege mode, tank-mode-attack in tank mode. */
  public playTankAttack(sieged: boolean) {
    if (sieged ? this.playSfxOf(['cannon1', 'cannon2'], 0.95, 1, 0.03) : this.playSfx('tank-mode-attack', 0.85, 1, 0.04)) return;
    if (sieged) this.playSiegeTankAttack(); else this.playMarauderAttack();
  }

  public playSiegeTankAttack() {
    if (this.playSfx('boom-explode', 0.7, 1.1, 0.05)) return;
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Heavy Sub-bass boom
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(140, now);
    sub.frequency.exponentialRampToValueAtTime(25, now + 0.8);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(1.0, now);
    subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.85);

    sub.connect(subGain);
    subGain.connect(this.sfxDest());

    sub.start(now);
    sub.stop(now + 0.9);

    // Blast wave noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + 0.7);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.9, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.75);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxDest());

    noise.start(now);
    noise.stop(now + 0.8);

    // Metallic shock resonance
    const ping = this.ctx.createOscillator();
    ping.type = 'sawtooth';
    ping.frequency.setValueAtTime(440, now);
    ping.frequency.exponentialRampToValueAtTime(80, now + 0.3);

    const pingGain = this.ctx.createGain();
    pingGain.gain.setValueAtTime(0.4, now);
    pingGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    ping.connect(pingGain);
    pingGain.connect(this.sfxDest());

    ping.start(now);
    ping.stop(now + 0.35);
  }

  // Projectile Fly-By, Launch & In-Flight Sounds
  public playBulletWhiz() {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1600, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.1);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxDest());
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playRocketWhoosh() {
    if (this.playSfx('fiery-swoosh', 0.45, 1, 0.1)) return;
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.linearRampToValueAtTime(850, now + 0.18);
    filter.Q.setValueAtTime(3, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxDest());
    noise.start(now);
    noise.stop(now + 0.3);
  }

  public playArtilleryWhistle() {
    if (this.playSfx('throw', 0.6, 1, 0.08)) return;
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2600, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.35);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.38);

    osc.connect(gain);
    gain.connect(this.sfxDest());
    osc.start(now);
    osc.stop(now + 0.4);
  }

  public playProjectileImpact(type: 'bullet' | 'shell' | 'acid' | 'spine' | 'energy' = 'bullet') {
    if (type === 'acid' && this.ctx && this.sfxGain && !this.isMuted) {
      // Roach acid splash: wet splat plus a longer corrosive sizzle
      this.noiseBurst('lowpass', 900, 0.8, 0.22, 0.12);
      this.noiseBurst('highpass', 4000, 0.7, 0.08, 0.45, 0.03, 7000);
      return;
    }
    if (type === 'spine' && this.ctx && this.sfxGain && !this.isMuted) {
      // Hydralisk spine hit: a short, dry flesh "tick"
      this.noiseBurst('bandpass', 1800, 3, 0.2, 0.06);
      this.noiseBurst('lowpass', 500, 1, 0.12, 0.08);
      return;
    }
    if (type === 'shell' && this.playSfx('explode', 0.4, 1.15, 0.12)) return;
    if (type === 'energy' && this.playSfx('metallic-energy', 0.45, 1, 0.08)) return;
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    if (type === 'shell') {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.28);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

      osc.connect(gain);
      gain.connect(this.sfxDest());
      osc.start(now);
      osc.stop(now + 0.32);
    } else if (type === 'acid') {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.createNoiseBuffer();
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600, now);
      filter.Q.setValueAtTime(4, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxDest());
      noise.start(now);
      noise.stop(now + 0.2);
    } else {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

      osc.connect(gain);
      gain.connect(this.sfxDest());
      osc.start(now);
      osc.stop(now + 0.09);
    }
  }

  // Stimpack Hiss
  public playStimpack() {
    if (this.playSfx('whoosh-pulse', 0.7, 1, 0.04)) return;
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1800, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxDest());

    noise.start(now);
    noise.stop(now + 0.45);
  }

  // Siege Tank Mode Transform (Hydraulic clank & locks)
  public playSiegeTransform(toSiege = true) {
    if (this.playSfx(toSiege ? 'go-into-siege-mode' : 'go-into-tank-mode', 0.9, 1, 0.01)) return;
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.linearRampToValueAtTime(260, now + 0.3);
    osc.frequency.linearRampToValueAtTime(180, now + 0.6);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.65);

    osc.connect(gain);
    gain.connect(this.sfxDest());

    osc.start(now);
    osc.stop(now + 0.7);
  }

  // Medivac Heal Beam
  public playHealBeam() {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(650, now);
    osc.frequency.linearRampToValueAtTime(880, now + 0.15);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxDest());

    osc.start(now);
    osc.stop(now + 0.2);
  }

  // SCV Repair / Build Sparks
  private lastWeld = 0;
  /** SCV build / repair: the repair clip, gated so it is not stacked every frame (called per tick while working). */
  public playWelding() {
    const t = Date.now();
    if (this.sfxBuf['repair']) { if (t - this.lastWeld > 1100) { this.lastWeld = t; this.playSfx('repair', 0.6, 1, 0.02); } return; }
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200, now);
    filter.Q.setValueAtTime(5, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxDest());

    noise.start(now);
    noise.stop(now + 0.14);
  }

  // Zerg Attack (Zergling scratch / bite)
  /** Melee hits are short hollow kick-drum thumps at different pitches: zergling quick/high, zealot mid, ultralisk/baneling deep. */
  private playKick(sample: string, rate: number, vol: number, dur: number): boolean {
    const buf = this.kickBuf[sample];
    if (!this.ctx || !buf) return false;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (0.9 + Math.random() * 0.2);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(g); g.connect(this.sfxDest());
    src.start(now); src.stop(now + dur + 0.02);
    return true;
  }

  public playZerglingAttack(kind: 'zergling' | 'zealot' | 'ultralisk' | 'baneling' = 'zergling') {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const k = {
      zergling: ['deep', 1.7, 0.7, 0.16],
      zealot: ['bass', 1.35, 0.7, 0.22],
      ultralisk: ['boom', 0.85, 0.9, 0.4],
      baneling: ['909', 0.7, 0.9, 0.35]
    }[kind] as [string, number, number, number];
    if (kind === 'ultralisk' && this.playSfx('big-animal-attack', 0.9, 1, 0.06)) return;
    if (kind === 'zergling' && Math.random() < 0.5 && this.playZergWeapon('zergling')) return;
    if (kind !== 'baneling' && this.playSfx(kind === 'ultralisk' ? 'squish-fast-loud' : 'squish-fast', kind === 'ultralisk' ? 0.9 : 0.7, kind === 'zealot' ? 0.9 : 1, 0.08)) return;
    if (this.playKick(k[0], k[1], k[2], k[3])) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.1);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxDest());

    osc.start(now);
    osc.stop(now + 0.11);
  }

  /** Short filtered noise burst (spits, sizzles, needle whips). `sweepTo` glides the filter frequency over the burst. */
  private noiseBurst(type: BiquadFilterType, freq: number, q: number, vol: number, dur: number, delay = 0, sweepTo?: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    noise.connect(f); f.connect(g); g.connect(this.sfxDest());
    noise.start(t0); noise.stop(t0 + dur + 0.02);
  }

  // Hydralisk Needle Spines: a quick, bright "thwip" (a high squish snap plus a whipping noise sweep), much lighter than the Roach spit
  public playHydraliskAttack(rate = 1, vol = 0.8) {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    if (this.playSfx('hydralisk-attack', vol, rate, 0.06)) return;
    this.noiseBurst('bandpass', 6500, 6, 0.22, 0.07, 0, 2600); // needle whip
    this.noiseBurst('bandpass', 2400, 8, 0.3, 0.1);
  }

  // Mutalisk Glaive Wurm launch: the mid-pitched squish the Hydralisk used to share
  public playMutaliskAttack() {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    if (this.playSfx('zerg-fling', 0.55, 1.12, 0.06)) return;
    this.noiseBurst('bandpass', 2400, 8, 0.4, 0.1);
  }

  /**
   * Zerg weapons that have no sound of their own: [clip, rate, volume].
   * Spines use the Hydralisk clip, launched spores / broodlings the fling clip, melee the zerg-attack bite.
   */
  public playZergWeapon(type: string): boolean {
    const t: Record<string, [string, number, number]> = {
      queen: ['hydralisk-attack', 1.2, 0.7], spine_crawler: ['hydralisk-attack', 0.68, 0.9], lurker: ['hydralisk-attack', 0.55, 0.9],
      broodlord: ['zerg-fling', 0.72, 0.6], spore_crawler: ['zerg-fling', 1.3, 0.5], corruptor: ['zerg-fling', 0.92, 0.5],
      drone: ['zerg-attack', 1.3, 0.45], swarm_host: ['zerg-attack', 0.85, 0.6], zergling: ['zerg-attack', 1.15, 0.55],
    };
    const e = t[type];
    return !!e && this.playSfx(e[0], e[2], e[1], 0.06);
  }

  /** Zerg structure selected: the Hatchery line gurgles, everything else is a slice of wet slime. */
  public playZergStructureSelect(type: string) {
    if (['hatchery', 'lair', 'hive'].includes(type) && this.playSfx('zerg-hatch-sound', 0.75, type === 'hive' ? 0.85 : type === 'lair' ? 0.92 : 1, 0.03)) return;
    if (this.playSlimeSlice('zerg-slime', 0.7, 0.75)) return;
    this.playCommandConfirm();
  }

  /** Zerg structure finished morphing. */
  public playZergStructureDone(type: string) {
    if (['hatchery', 'lair', 'hive'].includes(type) && this.playSfx('zerg-hatch-sound', 0.9, 0.85, 0.03)) return;
    this.playSlimeSlice('zerg-slime', 1.1, 0.8);
  }

  /** Larva / Egg selected, or a larva starting to morph: a slice of the egg slime bed. */
  public playLarvaSlime(vol = 0.7) { this.playSlimeSlice('larva-egg-slime', 1.2, vol); }

  /** A random `dur`-second piece of a longer slime clip, faded at both ends. */
  private playSlimeSlice(name: string, dur: number, vol: number): boolean {
    const buf = this.sfxBuf[name];
    if (!buf) return false;
    const off = Math.random() * Math.max(0, buf.duration - dur - 0.05);
    return this.playSfxPart(name, off, dur, Math.min(0.3, dur * 0.35), vol, 1, 0.05);
  }

  // Unit / Building Explosion
  /** Terran infantry death scream: one of five. */
  /** Terran infantry death. terran-death2 is the Wilhelm-style scream: it used to be 1 in 5 deaths, now 1 in 50 (90% rarer). */
  public playTerranDeath() {
    if (Math.random() < 0.02 && this.playSfx('terran-death2', 0.8, 1, 0.05)) return;
    if (this.playSfxOf(['terran-death1', 'terran-death3', 'terran-death4', 'terran-death5'], 0.8, 1, 0.05)) return;
    this.playExplosion(false);
  }
  /** Structure destroyed: Zerg bio-collapse, otherwise the building collapse with a big blast. */
  public playBuildingDeath(zerg: boolean) {
    if (zerg) { if (this.playSfx('zerg-building-die', 1, 1, 0.04)) return; }
    else if (this.sfxBuf['building-smash'] && Math.random() < 0.5) { this.playSfx('building-smash', 1, 1, 0.03); this.playSfx('medium-explosion', 0.5, 0.9, 0.03); return; }
    else if (this.sfxBuf['building-collapse']) { this.playSfx('building-collapse', 1, 1, 0.03); this.playSfx('medium-explosion', 0.6, 0.9, 0.03); return; }
    this.playExplosion(true);
  }
  public playBansheeAttack() { if (!this.playSfx('banshee', 0.7, 1, 0.08)) this.playMarauderAttack(); }
  public playCloak() { this.playSfx('system-active', 0.8, 1, 0); }
  /** Protoss death: mechanical collapse clips for the machines, a falling-out-of-warp whine for the rest. */
  public playProtossDeath(unitType: string): boolean {
    const mech = PROTOSS_MECH.includes(unitType);
    return this.playSfxOf(['pr-mechdie1', 'pr-mechdie2', 'pr-mechdie3'], 0.85, mech ? 0.85 : 1.3, 0.06);
  }
  private lastProtoss = 0;
  /** Protoss select / order voice: synthetic chatter for infantry, servo whirs for the machines. */
  public playProtossVoice(unitType: string, kind: 'select' | 'order' | 'move' | 'attack', escalate = false): boolean {
    const now = Date.now();
    if (now - this.lastProtoss < 700) return true;
    this.lastProtoss = now;
    if (unitType === 'probe') return this.playSfxOf(['pr-probe1', 'pr-probe2', 'pr-probe3', 'pr-probe4', 'pr-probe5', 'probe'], 0.85, 1, 0.04);
    const mech = PROTOSS_MECH.includes(unitType) || unitType === 'archon';
    if (kind === 'select') {
      if (escalate) return this.playSfxOf(['pr-talk1', 'pr-speech1'], 0.8, 1.15, 0.04);
      if (unitType === 'sentry') return this.playSfxOf(['pr-radar1', 'pr-radar2', 'pr-talk1'], 0.8, 1, 0.04);
      return this.playSfxOf(mech ? ['pr-activate', 'pr-talk1', 'pr-speech1'] : ['pr-speech1', 'pr-talk1', 'pr-activate'], 0.8, mech ? 0.85 : 1.1, 0.05);
    }
    if (kind === 'attack') return this.playSfxOf(['pr-comm1', 'pr-comm2', 'pr-comm3'], 0.6, 1.1, 0.05);
    return this.playSfxOf(mech ? ['pr-move1', 'pr-move2'] : ['pr-move1', 'pr-move2', 'pr-speech1'], 0.7, mech ? 0.9 : 1.2, 0.05);
  }
  /** Protoss weapon fire: the three laser clips, pitched per unit (small = quick and high, heavy = slow and deep). Falls back to the old marine / beam sounds. */
  public playProtossWeapon(unitType: string): boolean {
    const t: Record<string, [string, number, number]> = {
      stalker: ['pr-laser-short', 1, 0.7], sentry: ['pr-laser-quick', 1.1, 0.6], adept: ['pr-laser', 1.25, 0.65], immortal: ['pr-laser-short', 0.7, 0.8],
      colossus: ['pr-laser', 0.55, 0.9], void_ray: ['pr-laser-short', 0.8, 0.55], carrier: ['pr-laser-quick', 0.9, 0.5], tempest: ['pr-laser-short', 0.5, 0.9],
    };
    const e = t[unitType]; return !!e && this.playSfx(e[0], e[2], e[1], 0.05);
  }
  public playWarpIn() { this.playSfx('protoss-warp-in', 0.8, 1, 0.03); }
  /** Zerg unit death: wet splat. Falls back to the normal explosion. */
  public playZergDeath(big = false, unitType = '') {
    if (unitType === 'mutalisk' && this.playSfx('zg-die-muta', 0.9, 1, 0.05)) return;
    if ((unitType === 'broodlord' || unitType === 'overlord') && this.playSfx('zg-die-muta', 0.9, 0.7, 0.04)) return;
    if (big && this.playSfxOf(['zg-die-big', 'zg-roar-trex'], 0.9, 1, 0.04)) return;
    if ((unitType === 'queen') && this.playSfx('zg-die-big', 0.8, 1.25, 0.05)) return;
    if (['zergling', 'drone', 'baneling', 'larva', 'egg', 'broodling', 'locust'].includes(unitType)) {
      const rate = unitType === 'zergling' || unitType === 'larva' ? 1.12 : 1;
      if (Math.random() < 0.5 ? this.playSfx('zerg-squish-pop', 0.8, rate, 0.08) : this.playSfx('zerg-small-death', 0.85, rate, 0.08)) return;
    }
    if (this.playSfx('zerg-death-splat', big ? 1 : 0.8, big ? 0.7 : 1, 0.1)) return;
    this.playExplosion(big);
  }
  public playLiftOff() { this.playSfx('lift-off', 0.9, 1, 0.02); }
  public playLand() { this.playSfx('land', 0.9, 1, 0.02); }
  public playLarvaHatch(unitType = '') {
    if (Math.random() < 0.5 || !this.playSfx('zerg-squish-pop', 0.75, 0.95, 0.08)) this.playSfx('larva-hatch-squish-short', 0.8, 1, 0.08);
    if (unitType === 'ultralisk' || unitType === 'broodlord') this.playZergGrowl(unitType, 0.8);
  }
  public static readonly TERRAN_INFANTRY = TERRAN_INFANTRY;
  public playExplosion(isLarge: boolean = false) {
    if (this.playSfx(isLarge ? 'big-explosion' : 'medium-explosion', isLarge ? 0.9 : 0.8, 1, 0.04)) return;
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const duration = isLarge ? 1.0 : 0.5;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isLarge ? 900 : 1400, now);
    filter.frequency.exponentialRampToValueAtTime(50, now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(isLarge ? 0.9 : 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxDest());

    noise.start(now);
    noise.stop(now + duration + 0.05);
  }

  // UI Click / Order Confirmed
  /** Building placed: the door-open sample pitched down (playbackRate 0.7 = lower and slower). */
  public playBuildPlace(race: 'terran' | 'zerg' | 'protoss' = 'terran') {
    if (race === 'zerg' && this.playSfx('zerg-create-bldg', 0.9, 1, 0.02)) return;
    if (race === 'protoss' && this.playSfx('protoss-warp-in', 0.8, 1, 0.02)) return;
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    if (!this.placeBuf) { this.playCommandConfirm(); return; }
    const src = this.ctx.createBufferSource();
    src.buffer = this.placeBuf;
    src.playbackRate.value = 0.7;
    const g = this.ctx.createGain(); g.gain.value = 0.8;
    src.connect(g); g.connect(this.sfxDest());
    src.start();
  }

  public playCommandConfirm() {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.setValueAtTime(1200, now + 0.04);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxDest());

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // Error Tone (Not enough minerals / supply blocked)
  public playError() {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxDest());

    osc.start(now);
    osc.stop(now + 0.16);
  }

  // Attack Alert Siren / Klaxon
  public playUnderAttackAlert() {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(950, now + 0.18);
    osc.frequency.linearRampToValueAtTime(600, now + 0.36);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc.connect(gain);
    gain.connect(this.sfxDest());

    osc.start(now);
    osc.stop(now + 0.42);
  }

  // ============================================================================
  // CLASSICAL BACKGROUND MUSIC SYSTEM (12 Tracks + Seamless Dual-Deck Crossfade)
  // ============================================================================
  private initClassicalMusicSystem() {
    try {
      const savedVol = localStorage.getItem('sc2_bg_music_volume');
      if (savedVol !== null) {
        const parsed = Number(savedVol);
        if (!Number.isNaN(parsed)) {
          this.musicVolumePercent = Math.max(0, Math.min(100, parsed));
        }
      }
    } catch {}

    this.deckA = new Audio();
    this.deckB = new Audio();
    this.deckA.preload = 'auto';
    this.deckB.preload = 'auto';
    this.deckA.loop = false;
    this.deckB.loop = false;

    const initialTrack = CLASSICAL_SOUNDTRACK.find(t => t.id === this.currentTrackId) || CLASSICAL_SOUNDTRACK[0]!;
    this.deckA.src = initialTrack.url;
    this.deckB.src = initialTrack.url;
    if (this.ctx && this.musicGain) {
      try {
        this.deckGainA = this.ctx.createGain();
        this.deckGainB = this.ctx.createGain();
        this.ctx.createMediaElementSource(this.deckA).connect(this.deckGainA);
        this.ctx.createMediaElementSource(this.deckB).connect(this.deckGainB);
        this.deckGainA.connect(this.musicGain);
        this.deckGainB.connect(this.musicGain);
        this.deckA.volume = 1; this.deckB.volume = 1;
        this.musicViaWebAudio = true;
      } catch (e) {
        console.warn('Music could not be routed through Web Audio; falling back to element volume', e);
        this.musicViaWebAudio = false;
      }
    }
    this.applyDeckVolumes();

    // Background interval so crossfading continues smoothly even when game is paused in menu
    window.setInterval(() => {
      this.tickCrossfade(0.1);
    }, 100);
  }

  private ensureMusicPlaying() {
    if (this.musicStarted) return;
    const active = this.activeDeck === 'A' ? this.deckA : this.deckB;
    if (active) {
      active.play().then(() => {
        this.musicStarted = true;
        this.applyDeckVolumes();
      }).catch(() => {
        // Will retry on next user click/keydown
      });
    }
  }

  public setMusicVolumePercent(percent: number) {
    this.musicVolumePercent = Math.max(0, Math.min(100, Math.round(percent)));
    try {
      localStorage.setItem('sc2_bg_music_volume', String(this.musicVolumePercent));
    } catch {}
    this.ensureMusicPlaying();
    this.applyDeckVolumes();
  }

  public getMusicVolumePercent(): number {
    return this.musicVolumePercent;
  }

  public setMusicMode(mode: 'auto' | string) {
    this.musicMode = mode;
    this.ensureMusicPlaying();
    if (mode !== 'auto') {
      const track = CLASSICAL_SOUNDTRACK.find(t => t.id === mode);
      if (track) {
        this.currentSituationLabel = `Manual: ${track.situation}`;
        this.crossfadeToTrack(track.id, true);
      }
    } else {
      this.stateHoldTimer = 0; // Immediately evaluate dynamic state
    }
  }

  public skipToNextTrack() {
    this.ensureMusicPlaying();
    const idx = CLASSICAL_SOUNDTRACK.findIndex(t => t.id === this.currentTrackId);
    const next = CLASSICAL_SOUNDTRACK[(idx + 1) % CLASSICAL_SOUNDTRACK.length]!;
    this.musicMode = next.id;
    this.currentSituationLabel = next.situation;
    this.crossfadeToTrack(next.id, true);
  }

  public getCurrentTrackInfo(): ClassicalTrackInfo {
    return CLASSICAL_SOUNDTRACK.find(t => t.id === this.currentTrackId) || CLASSICAL_SOUNDTRACK[0]!;
  }

  public crossfadeToTrack(trackId: string, forceRestart: boolean = false) {
    if (!this.deckA || !this.deckB) return;
    if (this.currentTrackId === trackId && !forceRestart) return;

    const track = CLASSICAL_SOUNDTRACK.find(t => t.id === trackId);
    if (!track) return;

    this.currentTrackId = trackId;
    this.activeDeck = this.activeDeck === 'A' ? 'B' : 'A';
    const incoming = this.activeDeck === 'A' ? this.deckA : this.deckB;

    incoming.src = track.url;
    incoming.currentTime = 0;
    this.crossfadeProgress = 0.0;
    this.applyDeckVolumes();

    incoming.play().then(() => {
      this.musicStarted = true;
    }).catch(() => {});
  }

  private tickCrossfade(dt: number) {
    if (!this.deckA || !this.deckB) return;

    if (this.crossfadeProgress < 1.0) {
      this.crossfadeProgress = Math.min(1.0, this.crossfadeProgress + dt / this.crossfadeDuration);
      this.applyDeckVolumes();

      if (this.crossfadeProgress >= 1.0) {
        const outgoing = this.activeDeck === 'A' ? this.deckB : this.deckA;
        outgoing.pause();
      }
    }

    // Seamless auto-crossfade loop when active track nears its end (last 3.2 seconds)
    const active = this.activeDeck === 'A' ? this.deckA : this.deckB;
    if (
      this.musicStarted &&
      this.crossfadeProgress >= 1.0 &&
      active.duration > 10 &&
      active.currentTime >= active.duration - 3.2
    ) {
      if (this.musicMode === 'auto') {
        // Crossfade seamlessly into beginning of current situational track (or rotated battle track)
        this.crossfadeToTrack(this.currentTrackId, true);
      } else {
        this.crossfadeToTrack(this.currentTrackId, true);
      }
    }
  }

  private setDeckLevel(deck: 'A' | 'B', v: number) {
    const level = this.menuMusicOn ? 0 : Math.max(0, Math.min(1, v));
    const el = deck === 'A' ? this.deckA : this.deckB;
    const node = deck === 'A' ? this.deckGainA : this.deckGainB;
    if (this.musicViaWebAudio && node && this.ctx) {
      const t = this.ctx.currentTime;
      node.gain.cancelScheduledValues(t);
      node.gain.setTargetAtTime(level, t, 0.02);
    } else if (el) {
      el.volume = level;
    }
  }

  private applyDeckVolumes() {
    if (!this.deckA || !this.deckB) return;
    if (this.isMuted || this.musicVolumePercent <= 0) {
      this.setDeckLevel('A', 0);
      this.setDeckLevel('B', 0);
      return;
    }

    const baseVol = Math.max(0, Math.min(1, this.musicVolumePercent / 100));
    // Equal-power / smooth cosine crossfade curve
    const t = this.crossfadeProgress;
    const inGain = Math.sin(t * Math.PI * 0.5) * baseVol;
    const outGain = t >= 1.0 ? 0 : Math.cos(t * Math.PI * 0.5) * baseVol;
    this.setDeckLevel(this.activeDeck, inGain);
    this.setDeckLevel(this.activeDeck === 'A' ? 'B' : 'A', outGain);
  }

  // Evaluate RTS Gameplay Situation and smoothly crossfade to the matching classical masterpiece
  public updateDynamicMusic(dt: number, world: any) {
    const app = (window as any).gameApp;
    const isPausedMenu = app && app.isPaused;

    if (this.musicMode !== 'auto') return;

    // When Pause Menu / Archive is open, transition to the calm theme
    if (isPausedMenu) {
      this.currentSituationLabel = 'Main Menu (A New Beginning)';
      this.crossfadeToTrack('a_new_beginning');
      return;
    }

    this.stateHoldTimer -= dt;
    if (this.stateHoldTimer > 0) return;
    this.stateHoldTimer = 8.0; // Hold each musical movement for at least 8s to avoid rapid switching

    const playerUnits = world.units.filter((u: any) => u.playerId === 'player' && !u.isDead);
    const enemyUnits = world.units.filter((u: any) => u.playerId === 'enemy' && !u.isDead);
    const playerBuildings = world.buildings.filter((b: any) => b.playerId === 'player' && !b.isDead);
    const enemyBuildings = world.buildings.filter((b: any) => b.playerId === 'enemy' && !b.isDead);

    // Count units actively engaged or close to enemies
    let engagedCount = 0;
    let enemyNearPlayerBase = 0;
    let playerNearEnemyBase = 0;

    playerUnits.forEach((pu: any) => {
      if (Math.hypot(pu.pos.x - 95, pu.pos.y - 95) < 28) {
        playerNearEnemyBase++;
      }
      for (const eu of enemyUnits) {
        const d = Math.hypot(pu.pos.x - eu.pos.x, pu.pos.y - eu.pos.y);
        if (d < 14) {
          engagedCount++;
          break;
        }
      }
    });

    enemyUnits.forEach((eu: any) => {
      if (Math.hypot(eu.pos.x - 25, eu.pos.y - 25) < 28) {
        enemyNearPlayerBase++;
      }
    });

    const isPossessingAir = app && app.renderer?.isFpsMode && app.renderer?.fpsUnit?.isFlying;

    let targetTrack = 'frontier_of_the_stars';
    let situation = 'Base Building & Expansion';

    if (playerBuildings.length <= 1 && enemyNearPlayerBase >= 4) {
      targetTrack = 'in_the_distance_war';
      situation = 'Near Defeat';
    } else if (enemyBuildings.length <= 1 && playerNearEnemyBase >= 4) {
      targetTrack = 'frontier_starfire_2';
      situation = 'Final Battle';
    } else if (isPossessingAir && engagedCount >= 1) {
      targetTrack = 'shadow_of_conquest';
      situation = 'Aerial Assault';
    } else if (engagedCount >= 10 || playerNearEnemyBase >= 8) {
      targetTrack = world.gameTime > 240 ? 'shadow_of_conquest' : 'frontier_starfire_1';
      situation = 'Massive Assault';
    } else if (engagedCount >= 6 && enemyNearPlayerBase >= 5) {
      targetTrack = 'frontier_starfire_1';
      situation = 'Large-Scale Conflict';
    } else if (engagedCount >= 4) {
      targetTrack = 'interstellar_conflict';
      situation = 'Major Battle';
    } else if (engagedCount >= 1) {
      targetTrack = 'interstellar_conflict';
      situation = 'Small Skirmishes';
    } else if (enemyNearPlayerBase >= 2) {
      targetTrack = 'looming_shadow';
      situation = 'Enemy Approaching';
    } else if (enemyUnits.length >= 14) {
      targetTrack = 'looming_shadow';
      situation = 'Growing Zerg Swarm';
    } else if (playerUnits.some((u: any) => Math.hypot(u.pos.x - 25, u.pos.y - 25) > 26)) {
      targetTrack = 'a_new_beginning';
      situation = 'Exploring Sector';
    } else {
      targetTrack = 'frontier_of_the_stars';
      situation = 'Base Building';
    }

    this.currentSituationLabel = situation;
    this.crossfadeToTrack(targetTrack);
  }

  private lastUnitGreetingTime: number = 0;
  private lastUnitOrderTime: number = 0;

  private unitGreetings: Record<string, string[]> = {
    scv: [
      "Orders, cap'n?",
      'Job finished?',
      "What's the plan?"
    ],
    marine: [
      'You wanna piece of me, boy?',
      'Armed and ready!',
      'Standing by.',
      'Go, go, go!'
    ],
    firebat: ['Need a light?', 'Say the word.', 'Fight fire with fire.', 'Ready to roast!'],
    medic: ['The doctor is in!', 'Standing by.', 'Where does it hurt?', 'Need some triage?'],
    marauder: [
      'Ready for action.',
      'Kaboom, baby.',
      'Heavy armor standing by.',
      'Sound off.'
    ],
    siege_tank: [
      'Ready to roll out!',
      'Destination?',
      'Identify target.'
    ],
    siege_tank_sieged: [
      'Shock cannon armed.',
      'Target locked.',
      'Awaiting fire order.'
    ],
    medivac: [
      'Ready for pickup.',
      'Need medical attention?',
      'Standing by.'
    ],
    wraith: [
      'Wraith awaiting launch orders.',
      'Go ahead, HQ.',
      'Skies are mine.',
      'Coordinates received.'
    ],
    banshee: [
      'Engines screaming.',
      'Give me a target.',
      'Ready for strike run.'
    ]
  };

  private unitOrderConfirmations: Record<string, string[]> = {
    scv: [
      'Right away, sir.',
      'Moving out.',
      'Got it.',
      'On it.'
    ],
    marine: [
      'Rock and roll!',
      'Orders received.',
      "Movin' out!",
      'Will do!'
    ],
    firebat: ['Fueled up!', 'Ready to fry!', 'Burn, baby, burn.', 'Understood.'],
    medic: ['On my way.', 'Coming through.', 'Stand clear.', 'Understood.'],
    marauder: [
      "Hit 'em hard!",
      'Affirmative.',
      "Let's crack some shells.",
      'Understood.'
    ],
    siege_tank: [
      "Rollin' out!",
      'Right on.',
      'Setting course.'
    ],
    siege_tank_sieged: [
      'Firing coordinates locked.',
      'Bombardment initialized.'
    ],
    medivac: [
      'Inbound.',
      'On my way.',
      'Clear skies.'
    ],
    wraith: [
      'Vector locked in.',
      'Engaging afterburners!',
      'Target acquired.'
    ],
    banshee: [
      'Strike run commencing.',
      'Cleared hot!',
      'Moving to attack vector.'
    ]
  };

  // ---------- Pre-generated unit voice clips (Kokoro TTS, see tools/tts) ----------
  private voiceManifest: any = null;
  private voiceManifestPromise: Promise<void> | null = null;
  private voiceBuffers = new Map<string, AudioBuffer | Promise<AudioBuffer | null>>();
  private voiceSource: AudioBufferSourceNode | null = null;

  private voiceUrl(rel: string): string {
    const base = (import.meta as any).env?.BASE_URL || '/';
    return rel.startsWith('campaign/') ? `${base}audio/voices/${rel}` : `${base}audio/voices/terran/${rel}`;
  }

  private loadVoiceManifest() {
    if (this.voiceManifestPromise) return;
    this.voiceManifestPromise = fetch(this.voiceUrl('manifest.json'))
      .then(r => (r.ok ? r.json() : null))
      .then(m => { this.voiceManifest = m; })
      .catch(() => { this.voiceManifest = null; });
  }

  private loadVoiceBuffer(rel: string): Promise<AudioBuffer | null> {
    const hit = this.voiceBuffers.get(rel);
    if (hit) return Promise.resolve(hit as any);
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    const pr = fetch(this.voiceUrl(rel))
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then(buf => ctx.decodeAudioData(buf))
      .then(ab => { this.voiceBuffers.set(rel, ab); return ab; })
      .catch(() => { this.voiceBuffers.delete(rel); return null; });
    this.voiceBuffers.set(rel, pr);
    return pr;
  }

  private lastClipPick = new Map<string, number>();
  private static readonly EVENT_FALLBACK: Record<string, string[]> = {
    move: ['order'], attack: ['order'], pissed: ['select'], order: [], select: [], ready: ['select']
  };

  /** Pick a clip for `unit`/`event`, never repeating the previous pick when there is a choice. */
  private pickClip(unit: string, event: string): string | null {
    const clips = this.voiceManifest?.clips?.[unit];
    if (!clips) return null;
    for (const ev of [event, ...(SoundSystem.EVENT_FALLBACK[event] || [])]) {
      const list = clips[ev] as { file: string }[] | undefined;
      if (!list || !list.length) continue;
      const key = `${unit}/${ev}`;
      let idx = Math.floor(Math.random() * list.length);
      if (list.length > 1 && idx === this.lastClipPick.get(key)) idx = (idx + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
      this.lastClipPick.set(key, idx);
      return list[idx]!.file;
    }
    return null;
  }

  /**
   * Play a random pre-generated clip for `unit`/`event` (select | order | move | attack | pissed | ready).
   * Missing move/attack/pissed lists fall back to order/order/select. Music and SFX duck while it plays.
   * Returns true when a clip exists (it plays as soon as it is decoded), false so callers can fall back to browser TTS.
   */
  public playVoiceClip(unit: string, event: 'select' | 'order' | 'ready' | 'move' | 'attack' | 'pissed'): boolean {
    if (this.isMuted || !this.ctx || !this.sfxGain) return false;
    this.loadVoiceManifest();
    const file = this.pickClip(unit, event);
    if (!file) return false;
    const clips = this.voiceManifest.clips[unit];
    const ctx = this.ctx;
    this.loadVoiceBuffer(file).then(buf => {
      if (!buf || this.isMuted) return;
      if (this.voiceSource) { try { this.voiceSource.stop(); } catch {} }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      if (!this.voiceGain) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.voiceGain);
      src.start();
      this.voiceSource = src;
      this.duck(buf.duration + 0.1, 'unit');
    });
    // warm the rest of this unit's clips in the background
    for (const evList of Object.values(clips) as { file: string }[][]) for (const c of evList) this.loadVoiceBuffer(c.file);
    return true;
  }

  // ---------- Adjutant (station AI announcer) ----------
  private adjutantSource: AudioBufferSourceNode | null = null;
  private adjutantQueue: { event: string; fallback: string; priority: number; clip?: string }[] = [];
  private adjutantBusy = false;
  private adjutantLast = new Map<string, number>();
  private static readonly ADJUTANT_COOLDOWN_MS: Record<string, number> = {
    base_attack: 25000, army_attack: 18000, incoming: 30000,
    minerals: 6000, gas: 6000, supply: 8000, energy: 5000,
    construction: 400, research: 400, scan: 2000, victory: 0, defeat: 0
  };
  private static readonly ADJUTANT_PRIORITY: Record<string, number> = {
    defeat: 5, victory: 5, base_attack: 4, incoming: 3, army_attack: 3, research: 2, construction: 2, scan: 2
  };

  /**
   * Adjutant announcement. Own voice channel (unit chatter never cuts it off), per-event cooldowns, a small priority
   * queue so alerts don't talk over each other, and a hard music/SFX duck. `fallback` is spoken via browser TTS when the
   * clip is unavailable.
   */
  /** Narrated campaign line: clip public/audio/voices/campaign/<key>.mp3 if generated, else browser TTS. */
  public playMissionLine(key: string, text: string) {
    this.playAdjutant(`mission:${key}`, text, `campaign/${key}.mp3`);
  }

  public playAdjutant(event: string, fallback: string = '', clip?: string) {
    if (this.isMuted || !this.ctx) return;
    const nowMs = performance.now();
    const cd = SoundSystem.ADJUTANT_COOLDOWN_MS[event] ?? 3000;
    const last = this.adjutantLast.get(event) ?? -1e9;
    if (nowMs - last < cd) return;
    this.adjutantLast.set(event, nowMs);
    this.loadVoiceManifest();
    const priority = SoundSystem.ADJUTANT_PRIORITY[event] ?? 1;
    if (this.adjutantQueue.some(q => q.event === event)) return;
    this.adjutantQueue.push({ event, fallback, priority: clip ? 2 : priority, clip });
    this.adjutantQueue.sort((a, b) => b.priority - a.priority);
    if (this.adjutantQueue.length > 6) this.adjutantQueue.length = 6;
    if (!this.adjutantBusy) this.nextAdjutant();
  }

  private nextAdjutant() {
    const item = this.adjutantQueue.shift();
    if (!item || !this.ctx || this.isMuted) { this.adjutantBusy = false; return; }
    this.adjutantBusy = true;
    const ctx = this.ctx;
    const done = () => { setTimeout(() => this.nextAdjutant(), 180); };
    const file = item.clip ?? this.pickClip('adjutant', item.event);
    if (!file) { // no clip: browser TTS fallback
      if (item.fallback) { this.speak(item.fallback, true); setTimeout(done, Math.min(5000, 600 + item.fallback.length * 60)); } else done();
      return;
    }
    this.loadVoiceBuffer(file).then(buf => {
      if (!buf && item.clip && item.fallback && !this.isMuted) { this.speak(item.fallback, true); setTimeout(done, Math.min(5000, 600 + item.fallback.length * 60)); return; }
      if (!buf || this.isMuted || !this.voiceGain) { this.adjutantBusy = false; return; }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.voiceGain);
      src.onended = done;
      src.start();
      this.adjutantSource = src;
      this.duck(buf.duration + 0.25, 'adjutant');
    });
  }

  /** Map an error toast ("Not enough minerals!", "Additional supply required!"...) to its Adjutant line. */
  public adjutantForMessage(msg: string) {
    const m = msg.toLowerCase();
    if (m.includes('mineral')) this.playAdjutant('minerals', 'Not enough minerals.');
    else if (m.includes('gas')) this.playAdjutant('gas', 'Not enough vespene gas.');
    else if (m.includes('supply')) this.playAdjutant('supply', 'Additional supply required.');
    else if (m.includes('not enough energy')) this.playAdjutant('energy', 'Not enough energy.');
  }

  /** Unit finished training: pre-generated voice clip if available, else the supplied fallback line. */
  public playUnitReady(unitType: string, fallbackText: string) {
    if (unitType === 'probe' && this.playSfx('probe', 0.9, 1, 0.04)) return;
    if (['ghost', 'reaper', 'firebat', 'nova'].includes(unitType) && this.playSfx('shotgun-load-sound-unit-ready', 0.9, 1, 0.03)) return;
    if (PROTOSS_TYPES.includes(unitType) && this.playSfx('pr-activate', 0.85, PROTOSS_MECH.includes(unitType) ? 0.85 : 1, 0.04)) return;
    if (this.playVoiceClip(unitType, 'ready')) return;
    this.speak(fallbackText);
  }

  // Unit Selection Voice Greeting
  private greetType = '';
  private greetCount = 0;
  private greetLastClick = 0;

  public playUnitGreeting(unitType: string) {
    if (unitType === 'probe' && this.playSfx('probe', 0.9, 1, 0.04)) return;
    if (unitType === 'larva' || unitType === 'egg') { this.playLarvaSlime(); return; }
    if (ZERG_TYPES.includes(unitType) && this.playZergGrowl(unitType)) return;
    if (PROTOSS_TYPES.includes(unitType)) { if (unitType === this.greetType && Date.now() - this.greetLastClick < 2500) this.greetCount++; else { this.greetType = unitType; this.greetCount = 1; } this.greetLastClick = Date.now(); if (this.playProtossVoice(unitType, 'select', this.greetCount >= 5)) return; }
    const now = Date.now();
    // Repeatedly clicking the same unit type escalates into its annoyed ("pissed") lines, SC2-style.
    if (unitType === this.greetType && now - this.greetLastClick < 2500) this.greetCount++; else { this.greetType = unitType; this.greetCount = 1; }
    this.greetLastClick = now;
    if (now - this.lastUnitGreetingTime < 900) return;
    this.lastUnitGreetingTime = now;

    if (this.greetCount >= 5 && this.playVoiceClip(unitType, 'pissed')) return;
    if (this.playVoiceClip(unitType, 'select')) return;
    const list = this.unitGreetings[unitType] || ['Standing by.', 'Awaiting orders.', 'Ready, sir.'];
    const phrase = list[Math.floor(Math.random() * list.length)]!;
    this.speak(phrase, true);
  }

  // Unit Order Confirmation Voice Line
  public playUnitOrder(unitType: string, kind: 'order' | 'move' | 'attack' = 'order') {
    if (unitType === 'probe' && this.playSfx('probe', 0.9, 1, 0.04)) return;
    if (unitType === 'larva' || unitType === 'egg') { this.playLarvaSlime(0.5); return; }
    if (ZERG_TYPES.includes(unitType) && this.playZergGrowl(unitType, 0.55)) return;
    if (PROTOSS_TYPES.includes(unitType) && this.playProtossVoice(unitType, kind)) return;
    const now = Date.now();
    if (now - this.lastUnitOrderTime < 900) return;
    this.lastUnitOrderTime = now;

    if (this.playVoiceClip(unitType, kind)) return;
    const list = this.unitOrderConfirmations[unitType] || ['Acknowledged.', 'Moving out.', 'Right away.'];
    const phrase = list[Math.floor(Math.random() * list.length)]!;
    this.speak(phrase, true);
  }

  // Quiet, un-annoying, crystalline mineral / gas deposit chime
  public playResourceDeposit() {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1760, now); // A6
    osc1.frequency.exponentialRampToValueAtTime(1975, now + 0.08); // B6

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2637, now); // E7
    osc2.frequency.exponentialRampToValueAtTime(3136, now + 0.08); // G7

    gain.gain.setValueAtTime(0.038, now); // quieter mineral/gas chime
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxDest());

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.13);
    osc2.stop(now + 0.13);
  }

  // StarFox-style Comms Transmission Open Beep + Static Squelch
  public playStarFoxCommsOpen() {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx!.currentTime;
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1180, now);
    osc.frequency.setValueAtTime(1580, now + 0.055);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(gain);
    gain.connect(this.sfxDest());
    osc.start(now);
    osc.stop(now + 0.14);
  }

  // StarFox-style Pilot Speech Radio Syllable Blip
  public playStarFoxRadioBlip(pitchFactor: number = 1.0) {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx!.currentTime;
    const osc = this.ctx!.createOscillator();
    const filter = this.ctx!.createBiquadFilter();
    const gain = this.ctx!.createGain();

    osc.type = 'sawtooth';
    const baseFreq = 165 * pitchFactor;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.linearRampToValueAtTime(baseFreq * 1.18, now + 0.045);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(920, now);
    filter.Q.setValueAtTime(3.2, now);

    gain.gain.setValueAtTime(0.032, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxDest());
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // StarFox-style Comms Transmission Close Squelch
  public playStarFoxCommsClose() {
    if (!this.ctx || !this.sfxGain || this.isMuted) return;
    const now = this.ctx!.currentTime;
    const osc = this.ctx!.createOscillator();
    const gain = this.ctx!.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1520, now);
    osc.frequency.setValueAtTime(980, now + 0.05);

    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(this.sfxDest());
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // Voice Lines via Speech Synthesis with Terran radio filter
  public speak(text: string, force: boolean = false) {
    if (this.isMuted) return;
    const now = Date.now();
    if (!force && now - this.lastVoiceTime < 2500) return; // Prevent spamming
    this.lastVoiceTime = now;

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.15;
      utterance.pitch = 0.85;
      utterance.volume = 0.85;

      const voices = window.speechSynthesis.getVoices();
      // Try to find an English male / military style voice
      const preferred = voices.find(v => v.lang.startsWith('en') && (v.name.includes('David') || v.name.includes('Daniel') || v.name.includes('Fred') || v.name.includes('Alex')));
      if (preferred) {
        utterance.voice = preferred;
      }
      utterance.onstart = () => this.duck(Math.min(8, 0.6 + text.length * 0.07), 'unit');
      utterance.onend = utterance.onerror = () => this.releaseDuck();
      window.speechSynthesis.speak(utterance);
    }
  }
}

