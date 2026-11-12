/**
 * Centre-screen reticle for 3rd-person possession. Shows a plain crosshair normally and morphs into a
 * "hot-swap" icon (ring + cycle arrows + label) when a friendly unit sits under the crosshair, plus a
 * bracket that tracks the targeted unit on screen.
 */
const CROSS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <g stroke="#05121a" stroke-width="4.2" stroke-linecap="round"><path d="M22 6v8M22 30v8M6 22h8M30 22h8"/></g>
  <g stroke="#7fe9ff" stroke-width="2" stroke-linecap="round"><path d="M22 6v8M22 30v8M6 22h8M30 22h8"/></g>
  <circle cx="22" cy="22" r="1.6" fill="#7fe9ff"/></svg>`;

const SWAP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">
  <circle cx="28" cy="28" r="20" fill="rgba(5,18,26,0.35)" stroke="#05121a" stroke-width="6"/>
  <circle cx="28" cy="28" r="20" fill="none" stroke="#35e26b" stroke-width="3"/>
  <g fill="none" stroke="#05121a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 24a12 12 0 0 1 20-5"/><path d="M39 32a12 12 0 0 1-20 5"/></g>
  <g fill="none" stroke="#b6ffcb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 24a12 12 0 0 1 20-5"/><path d="M39 32a12 12 0 0 1-20 5"/></g>
  <path d="M37 12v8h-8" fill="none" stroke="#05121a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M19 44v-8h8" fill="none" stroke="#05121a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M37 12v8h-8" fill="none" stroke="#b6ffcb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M19 44v-8h8" fill="none" stroke="#b6ffcb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export class SwapReticle {
  private root: HTMLDivElement;
  private icon: HTMLDivElement;
  private label: HTMLDivElement;
  private bracket: HTMLDivElement;
  private mode: 'hidden' | 'cross' | 'swap' = 'hidden';
  private labelText = '';

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'swap-reticle';
    this.root.style.display = 'none';
    this.icon = document.createElement('div');
    this.icon.className = 'swap-reticle-icon';
    this.label = document.createElement('div');
    this.label.className = 'swap-reticle-label';
    this.root.append(this.icon, this.label);
    this.bracket = document.createElement('div');
    this.bracket.className = 'swap-bracket';
    this.bracket.style.display = 'none';
    document.body.append(this.root, this.bracket);
  }

  public hide() {
    if (this.mode === 'hidden') return;
    this.mode = 'hidden';
    this.root.style.display = 'none';
    this.bracket.style.display = 'none';
  }

  /** Plain crosshair (no swap target). */
  public showCross() {
    if (this.mode !== 'cross') {
      this.mode = 'cross';
      this.root.style.display = 'flex';
      this.root.classList.remove('active');
      this.icon.innerHTML = CROSS_SVG;
      this.label.textContent = '';
      this.labelText = '';
    }
    this.bracket.style.display = 'none';
  }

  /** Swap icon + label, with a bracket at the target's screen position. */
  public showSwap(name: string, sx: number, sy: number) {
    if (this.mode !== 'swap') {
      this.mode = 'swap';
      this.root.style.display = 'flex';
      this.root.classList.add('active');
      this.icon.innerHTML = SWAP_SVG;
    }
    if (name !== this.labelText) {
      this.labelText = name;
      this.label.textContent = `CLICK: SWAP TO ${name}`;
    }
    this.bracket.style.display = 'block';
    this.bracket.style.transform = `translate(${sx - 24}px, ${sy - 24}px)`;
  }
}
