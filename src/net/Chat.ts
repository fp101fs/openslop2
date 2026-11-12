import type { NetTransport } from './NetClient';

/**
 * Minimal multiplayer chat. A fixed DOM overlay (works in the lobby and in-game): Enter opens the input, Enter sends,
 * Esc cancels. Messages travel as {t:'chat', n, m} over the existing client.relay() channel; lines fade after a few seconds.
 */
let client: NetTransport | null = null;
let off: (() => void) | null = null;
let box: HTMLDivElement | null = null;
let log: HTMLDivElement | null = null;
let input: HTMLInputElement | null = null;
let keyBound = false;

function build() {
  if (box) return;
  box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:12px;bottom:12px;width:min(420px,60vw);z-index:9999;font:14px/1.35 system-ui,sans-serif;pointer-events:none;display:none';
  log = document.createElement('div');
  input = document.createElement('input');
  input.maxLength = 140;
  input.placeholder = 'Message…';
  input.style.cssText = 'display:none;width:100%;box-sizing:border-box;margin-top:4px;padding:5px 8px;background:rgba(7,16,30,.92);color:#dff;border:1px solid #2a6aa8;outline:none;pointer-events:auto';
  input.addEventListener('keydown', e => {
    e.stopPropagation(); // keep game / menu hotkeys out of the text box
    if (e.key === 'Enter') { send(input!.value); closeInput(); }
    else if (e.key === 'Escape') closeInput();
  });
  input.addEventListener('keyup', e => e.stopPropagation());
  box.append(log, input);
  document.body.appendChild(box);
}

function closeInput() {
  if (!input) return;
  input.value = '';
  input.style.display = 'none';
  input.blur();
}

function addLine(name: string, text: string, mine: boolean) {
  build();
  const line = document.createElement('div');
  line.style.cssText = 'padding:2px 6px;margin-top:2px;background:rgba(7,16,30,.7);color:#e8f4ff;text-shadow:0 1px 2px #000;transition:opacity 1s;word-break:break-word';
  const who = document.createElement('b');
  who.style.color = mine ? '#6fe0a0' : '#ffc060';
  who.textContent = name + ': ';
  line.append(who, document.createTextNode(text));
  log!.appendChild(line);
  while (log!.children.length > 6) log!.firstChild!.remove();
  setTimeout(() => { line.style.opacity = '0'; setTimeout(() => line.remove(), 1000); }, 9000);
}

function send(text: string) {
  text = text.trim().slice(0, 140);
  if (!text || !client) return;
  const n = (client.name || 'Commander').slice(0, 20);
  client.relay({ t: 'chat', n, m: text });
  addLine(n, text, true);
}

export const Chat = {
  /** Start chatting over `c` (replaces any previous connection). */
  attach(c: NetTransport) {
    this.detach();
    build();
    client = c;
    box!.style.display = 'block';
    off = c.on(m => {
      if (m?.t === 'chat' && typeof m.m === 'string') addLine(String(m.n || 'Opponent').slice(0, 20), m.m.slice(0, 140), false);
    });
    if (!keyBound) {
      keyBound = true;
      window.addEventListener('keydown', e => {
        if (!client || e.key !== 'Enter' || !input || input.style.display !== 'none') return;
        const t = e.target as HTMLElement | null;
        if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
        e.preventDefault();
        input.style.display = 'block';
        input.focus();
      });
    }
  },
  detach() {
    off?.(); off = null; client = null;
    if (box) { box.style.display = 'none'; log!.innerHTML = ''; closeInput(); }
  }
};
