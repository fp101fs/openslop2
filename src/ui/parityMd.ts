import parityMd from '../../docs/SC2-PARITY.md?raw';

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const inline = (t: string) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*\n]+)\*/g, '<i>$1</i>');

/** Render docs/SC2-PARITY.md (headings, tables, quotes, lists, paragraphs) as HTML for the Parity screen. The doc is the single source. */
export function parityHtml(): string {
  const lines = (parityMd as string).split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (!l.trim()) continue;
    if (l.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith('|')) { const cells = lines[i]!.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()); if (!cells.every(c => /^:?-+:?$/.test(c))) rows.push(cells); i++; }
      i--;
      const [h, ...b] = rows;
      out.push(`<div class="ptw"><table class="pt"><thead><tr>${h!.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${b.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if (/^#{1,4} /.test(l)) { const n = l.match(/^#+/)![0].length; out.push(`<h${n + 1} class="ph">${inline(l.replace(/^#+ /, ''))}</h${n + 1}>`); }
    else if (l.startsWith('---')) out.push('<hr>');
    else if (l.startsWith('>')) out.push(`<blockquote>${inline(l.replace(/^>\s?/, ''))}</blockquote>`);
    else if (/^(\d+\.|-) /.test(l)) { const ol = /^\d/.test(l); const items: string[] = []; while (i < lines.length && /^(\d+\.|-) /.test(lines[i]!)) { items.push(`<li>${inline(lines[i]!.replace(/^(\d+\.|-) /, ''))}</li>`); i++; } i--; out.push(`<${ol ? 'ol' : 'ul'}>${items.join('')}</${ol ? 'ol' : 'ul'}>`); }
    else out.push(`<p>${inline(l)}</p>`);
  }
  return out.join('');
}
