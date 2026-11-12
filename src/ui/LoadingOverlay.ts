/**
 * Loading indicators, so there is never a silent wait between landing on the site and the game running:
 *  - `Loading.show(title, sub)` / `hide()`: full-screen "Preparing battlefield" card (match start, waiting for the animated models);
 *  - `Loading.badge(text)` / `badge(null)`: small non-blocking pill on the menu while the units are still downloading.
 * Both use only opacity / transform CSS animations, which keep moving while the main thread is busy.
 */
let card: HTMLDivElement | null = null;
let pill: HTMLDivElement | null = null;
let shownAt = 0;

function ensureCard(): HTMLDivElement {
  if (card) return card;
  card = document.createElement('div');
  card.className = 'ld-card';
  card.innerHTML = `<div class="ld-bg"></div><div class="ld-box"><div class="ld-title"></div><div class="ld-bar"><i></i></div><div class="ld-sub"></div></div>`;
  document.body.appendChild(card);
  return card;
}

export const Loading = {
  /** Show the card at once and resolve after it has painted, so the caller can start heavy synchronous work. */
  show(title = 'Preparing battlefield', sub = ''): Promise<void> {
    const c = ensureCard();
    (c.querySelector('.ld-title') as HTMLElement).textContent = title;
    (c.querySelector('.ld-sub') as HTMLElement).textContent = sub;
    shownAt = performance.now();
    c.classList.add('on');
    return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => res())));
  },
  /** Real progress (0..1): switches the bar from the endless shimmer to a filled bar; null goes back to the shimmer. */
  progress(frac: number | null) {
    const i = card?.querySelector('.ld-bar i') as HTMLElement | null;
    if (!i) return;
    if (frac === null) { i.style.animation = ''; i.style.width = ''; i.style.transform = ''; i.style.background = ''; return; }
    i.style.animation = 'none'; i.style.width = '100%'; i.style.background = 'linear-gradient(90deg,#1d63b8,#58b4ff)';
    i.style.transformOrigin = 'left'; i.style.transform = `scaleX(${Math.max(0.02, Math.min(1, frac))})`;
  },
  sub(text: string) { if (card) (card.querySelector('.ld-sub') as HTMLElement).textContent = text; },
  /** Hide after the next frames have rendered (no flash of an unfinished scene), but never flicker for less than 250 ms. */
  hide() {
    if (!card?.classList.contains('on')) return;
    const wait = Math.max(0, 250 - (performance.now() - shownAt));
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => card?.classList.remove('on'), wait)));
  },
  badge(text: string | null) {
    if (text === null) { pill?.classList.remove('on'); return; }
    if (!pill) { pill = document.createElement('div'); pill.className = 'ld-pill'; pill.innerHTML = '<i></i><span></span>'; document.body.appendChild(pill); }
    (pill.querySelector('span') as HTMLElement).textContent = text;
    pill.classList.add('on');
  }
};
