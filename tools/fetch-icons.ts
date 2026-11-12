// Checks that every button icon referenced by src/ui/IconImages.ts exists in public/icons/ as SVG.
// Nothing is downloaded; this only reports gaps. Usage: bun tools/fetch-icons.ts
import { allIconNames } from '../src/ui/IconImages';

const missing: string[] = [];
for (const name of allIconNames()) {
  if (!(await Bun.file(`public/icons/btn-${name}.svg`).exists())) missing.push(name);
}
console.log(missing.length ? `Missing SVG icons: ${missing.join(', ')}` : 'All icons present.');
if (missing.length) process.exit(1);
