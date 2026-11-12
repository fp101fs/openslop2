// Drawn SVG glyphs that replace emoji in the HUD / command card (SC2-style consistent icon language).
// Each entry: [tint, inner SVG on a 24x24 canvas]. Unmapped emoji are left as-is.
import { buttonIcon } from './IconImages';

const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const C = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const GN = '#8dffb4';
const ICONS: Record<string, [string, string]> = {
  // SC2 command-card glyphs (green line art)
  '§M': [GN, `<g ${C}><circle cx="12" cy="12" r="9.5"/><path d="M5.5 12h11M12.5 7l5 5-5 5"/></g>`],
  '§S': [GN, `<g ${C}><circle cx="12" cy="12" r="9.5"/><path d="M8 8l8 8M16 8l-8 8"/></g>`],
  '§H': [GN, `<g ${C}><circle cx="12" cy="12" r="9.5"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/><path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5"/></g>`],
  '§P': [GN, `<g ${C}><circle cx="12" cy="12" r="9.5"/><path d="M8 16L16 8M11 8h5v5M13 16H8v-5"/></g>`],
  '§Y': [GN, `<g ${C}><path d="M7 21.5V3"/><path d="M7 4h11l-3 4 3 4H7"/><path d="M3.5 21.5h7"/></g>`],
  '§A': [GN, `<g ${C}><path d="M12 2v7M12 15v7M2 12h7M15 12h7"/><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/></g>`],
  '§G': [GN, `<g ${C}><path d="M5 20l10-10M9 6l6-2 5 5-2 6"/><path d="M8 10l6 6M11 7l6 6"/></g>`],
  '§B': ['#ffffff', `<g fill="currentColor"><path d="M3 20v-4h2.5l2-6h9l2 6H21v4z"/><rect x="9" y="5" width="6" height="3" rx="1"/></g>`],
  '§V': [GN, `<g ${C}><path d="M3 20v-4h2.5l2-6h9l2 6H21v4zM9.5 7a2.5 2.5 0 015 0"/></g>`],
  '§R': [GN, `<g ${C}><path d="M4 20L14 10M20 4l-4 4M4 4l16 16M17 20l-3-3M7 4l3 3"/></g>`],
  '§X': [GN, `<g ${C}><circle cx="12" cy="12" r="9.5"/><path d="M8 8l8 8M16 8l-8 8"/></g>`],
  '➡️': ['#7dd3fc', `<path ${S} d="M4 12h14M13 6l6 6-6 6"/>`],
  '⏹️': ['#cbd5e1', `<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>`],
  '🛡️': ['#93c5fd', `<path ${S} d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>`],
  '🎯': ['#fca5a5', `<g ${S}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></g>`],
  '⚔️': ['#fca5a5', `<path ${S} d="M5 19L17 7M14 4l6-1-1 6M19 19L7 7M10 4L4 3l1 6"/>`],
  '🔄': ['#a5b4fc', `<path ${S} d="M19 8a8 8 0 00-14 0M5 4v4h4M5 16a8 8 0 0014 0M19 20v-4h-4"/>`],
  '⚡': ['#fde047', `<path d="M13 2L5 13h6l-1 9 8-12h-6z" fill="currentColor"/>`],
  '💎': ['#67e8f9', `<path ${S} d="M6 4h12l4 6-10 11L2 10zM2 10h20M9 4l-2 6 5 11 5-11-2-6"/>`],
  '🧪': ['#86efac', `<path ${S} d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M8 15h8"/>`],
  '⚗️': ['#86efac', `<path ${S} d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M8 15h8"/>`],
  '🧠': ['#f0abfc', `<path ${S} d="M9 4a3 3 0 00-3 3 3 3 0 00-2 4 3 3 0 002 4 3 3 0 003 4V4zM15 4a3 3 0 013 3 3 3 0 012 4 3 3 0 01-2 4 3 3 0 01-3 4V4z"/>`],
  '💉': ['#fb7185', `<path ${S} d="M16 3l5 5M14 5l5 5-8 8-5-5zM6 13l-3 3M9 16l-4 4"/>`],
  '🔥': ['#fb923c', `<path d="M12 2c1 4 6 6 6 12a6 6 0 01-12 0c0-3 2-4 3-6 1 2 2 2 2 0 0-2 0-4 1-6z" fill="currentColor"/>`],
  '💥': ['#fbbf24', `<path d="M12 2l2 6 6-2-3 5 5 3-6 1 1 6-5-4-5 4 1-6-6-1 5-3-3-5 6 2z" fill="currentColor"/>`],
  '👻': ['#93c5fd', `<path ${S} d="M5 21V11a7 7 0 0114 0v10l-3-2-2 2-2-2-2 2-2-2z"/><circle cx="9.5" cy="11" r="1" fill="currentColor"/><circle cx="14.5" cy="11" r="1" fill="currentColor"/>`],
  '📡': ['#7dd3fc', `<g ${S}><path d="M4 20l8-8M5 9a10 10 0 0110 10M5 4a15 15 0 0115 15"/><circle cx="4.5" cy="19.5" r="1.5"/></g>`],
  '📦': ['#fcd34d', `<path ${S} d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>`],
  '🕳️': ['#a8a29e', `<g ${S}><ellipse cx="12" cy="14" rx="9" ry="4"/><ellipse cx="12" cy="14" rx="4.5" ry="1.8"/></g>`],
  '🥚': ['#fde68a', `<path ${S} d="M12 3c4 0 7 6 7 11a7 7 0 01-14 0c0-5 3-11 7-11z"/>`],
  '💚': ['#4ade80', `<path d="M12 21s-8-5-8-11a4.5 4.5 0 018-2.5A4.5 4.5 0 0120 10c0 6-8 11-8 11z" fill="currentColor"/>`],
  '✨': ['#67e8f9', `<path d="M12 2l2 7 7 3-7 3-2 7-2-7-7-3 7-3z" fill="currentColor"/>`],
  '⏩': ['#fbbf24', `<path d="M3 5l9 7-9 7zM12 5l9 7-9 7z" fill="currentColor"/>`],
  '🔷': ['#60a5fa', `<path d="M12 2l9 10-9 10-9-10z" fill="currentColor"/>`],
  '🔰': ['#facc15', `<path ${S} d="M12 3l8 4v5c0 5-4 8-8 9-4-1-8-4-8-9V7zM9 12l2 2 4-4"/>`],
  '🔨': ['#cbd5e1', `<path ${S} d="M14 4l6 6-3 3-6-6zM13 11L4 20"/>`],
  '🔫': ['#cbd5e1', `<path ${S} d="M3 9h14l3 2v3h-7l-1 4H8l1-4H3z"/>`],
  '🚀': ['#e2e8f0', `<path ${S} d="M12 2c4 3 5 8 4 13h-8c-1-5 0-10 4-13zM8 15l-3 4 4-1M16 15l3 4-4-1M12 9.5v.1"/>`],
  '🚜': ['#fcd34d', `<g ${S}><path d="M3 15V9h8v6M11 11h5l3 4"/><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="2"/></g>`],
  '⬆️': ['#cbd5e1', `<path ${S} d="M12 20V5M6 11l6-6 6 6"/>`],
  '⬇️': ['#cbd5e1', `<path ${S} d="M12 4v15M6 13l6 6 6-6"/>`],
  '🔙': ['#cbd5e1', `<path ${S} d="M20 12H6M11 6l-6 6 6 6"/>`],
  '🎥': ['#cbd5e1', `<path ${S} d="M3 7h12v10H3zM15 11l6-3v8l-6-3"/>`],
  '⚙️': ['#cbd5e1', `<g ${S}><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></g>`],
  '🪖': ['#cbd5e1', `<path ${S} d="M4 16a8 8 0 0116 0zM3 16h18v2H3z"/>`],
};

export function svgIcon(emoji: string): string | null {
  const e = ICONS[emoji.trim()];
  if (!e) return null;
  return `<svg class="svg-ico" viewBox="0 0 24 24" aria-hidden="true" style="color:${e[0]}">${e[1]}</svg>`;
}

/**
 * Swap emoji inside every `.icon` / `.min-icon` span of an HTML string for drawn SVG glyphs. Command-card buttons whose label
 * has an SVG button icon (Move, Stimpack, Siege Mode, ...) get the image instead; `race` picks race-specific icons (Gather, Build).
 */
export function upgradeIcons(html: string, race?: string): string {
  html = html.replace(/(<span class="icon">)([^<]{1,4})(<\/span>\s*<span class="name">)([^<]*)(<\/span>)/g, (m, a, _e, mid, name, c) => {
    const img = buttonIcon(name, race);
    return img ? a + img + mid + name + c : m;
  });
  return html.replace(/(<span class="(?:icon|min-icon)">)([^<]{1,4})(<\/span>)/g, (m, a, emoji, c) => {
    const s = svgIcon(emoji);
    return s ? a + s + c : m;
  });
}
