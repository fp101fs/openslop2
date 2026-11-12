export type CursorKind = 'default' | 'ally' | 'enemy' | 'resource' | 'repair' | 'attack' | 'patrol' | 'snipeOk';

const OUT = '#05121a';

function ring(color: string, extra = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="10.5" fill="none" stroke="${OUT}" stroke-width="5"/>
    <circle cx="16" cy="16" r="10.5" fill="none" stroke="${color}" stroke-width="2.6"/>
    <g stroke="${OUT}" stroke-width="4.4" stroke-linecap="round"><path d="M16 1.5v5M16 25.5v5M1.5 16h5M25.5 16h5"/></g>
    <g stroke="${color}" stroke-width="2.2" stroke-linecap="round"><path d="M16 1.5v5M16 25.5v5M1.5 16h5M25.5 16h5"/></g>
    ${extra}</svg>`;
}

const SVGS: Record<CursorKind, { svg: string; x: number; y: number }> = {
  patrol: { svg: '', x: 16, y: 16 },
  // valid Snipe target: green reticle, no X inside
  snipeOk: {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="9" fill="none" stroke="${OUT}" stroke-width="5"/>
      <circle cx="16" cy="16" r="9" fill="none" stroke="#35e26b" stroke-width="2.4"/>
      <g stroke="${OUT}" stroke-width="5" stroke-linecap="round"><path d="M16 1v9M16 22v9M1 16h9M22 16h9"/></g>
      <g stroke="#35e26b" stroke-width="2.4" stroke-linecap="round"><path d="M16 1v9M16 22v9M1 16h9M22 16h9"/></g></svg>`,
    x: 16, y: 16
  },
  // Sci-fi gauntlet arrow
  default: {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <path d="M3 2 L3 23 L8.6 17.6 L12.6 27 L16.4 25.3 L12.4 16.2 L20 15.8 Z" fill="#7fe9ff" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M5.2 6.6 L5.2 17.4 L8.4 14.4" fill="none" stroke="#e6fbff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    x: 3, y: 2
  },
  ally: { svg: ring('#35e26b', `<circle cx="16" cy="16" r="2.2" fill="#35e26b" stroke="${OUT}" stroke-width="1"/>`), x: 16, y: 16 },
  enemy: {
    svg: ring('#ff3b3b', `<g stroke="${OUT}" stroke-width="4" stroke-linecap="round"><path d="M11.5 11.5l9 9M20.5 11.5l-9 9"/></g>
      <g stroke="#ff3b3b" stroke-width="2" stroke-linecap="round"><path d="M11.5 11.5l9 9M20.5 11.5l-9 9"/></g>`),
    x: 16, y: 16
  },
  resource: {
    svg: ring('#ffd23f', `<path d="M16 10.5l5 5.5-5 5.5-5-5.5z" fill="#ffd23f" stroke="${OUT}" stroke-width="1.2" stroke-linejoin="round"/>`),
    x: 16, y: 16
  },
  repair: {
    svg: ring('#35e26b', `<g stroke="${OUT}" stroke-width="4.4" stroke-linecap="round"><path d="M16 10.5v11M10.5 16h11"/></g>
      <g stroke="#35e26b" stroke-width="2.4" stroke-linecap="round"><path d="M16 10.5v11M10.5 16h11"/></g>`),
    x: 16, y: 16
  },
  attack: {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="9" fill="none" stroke="${OUT}" stroke-width="5"/>
      <circle cx="16" cy="16" r="9" fill="none" stroke="#ff3b3b" stroke-width="2.4"/>
      <g stroke="${OUT}" stroke-width="5" stroke-linecap="round"><path d="M16 1v9M16 22v9M1 16h9M22 16h9"/></g>
      <g stroke="#ff3b3b" stroke-width="2.4" stroke-linecap="round"><path d="M16 1v9M16 22v9M1 16h9M22 16h9"/></g></svg>`,
    x: 16, y: 16
  }
};

SVGS.patrol = {
  svg: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="6.5" fill="none" stroke="${OUT}" stroke-width="5"/>
      <circle cx="16" cy="16" r="6.5" fill="none" stroke="#38bdf8" stroke-width="2.2"/>
      <g stroke="${OUT}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M2 16h8M22 16h8M6 11l-4 5 4 5M26 11l4 5-4 5"/></g>
      <g stroke="#38bdf8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M2 16h8M22 16h8M6 11l-4 5 4 5M26 11l4 5-4 5"/></g></svg>`,
  x: 16, y: 16
};

const cache = new Map<CursorKind, string>();

/** CSS `cursor` value (data-URI SVG with a sensible fallback). */
export function cursorCss(kind: CursorKind): string {
  let css = cache.get(kind);
  if (!css) {
    const c = SVGS[kind];
    const uri = 'data:image/svg+xml;utf8,' + encodeURIComponent(c.svg.replace(/\s+/g, ' '));
    css = `url("${uri}") ${c.x} ${c.y}, ${kind === 'default' ? 'default' : 'crosshair'}`;
    cache.set(kind, css);
  }
  return css;
}
