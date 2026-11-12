/** Bun loader for `.openslop2mission` files (JSON inside). Preloaded by bunfig.toml for `bun run`, `bun test`
 *  and the Mission Builder's bundler; the game's Vite build uses the matching plugin in vite.config.ts. */
import { plugin, type BunPlugin } from 'bun';

export const openslop2: BunPlugin = {
  name: 'openslop2-json',
  setup(build) {
    build.onLoad({ filter: /\.openslop2mission$/ }, async args => ({
      contents: `export default ${JSON.stringify(JSON.parse(await Bun.file(args.path).text()))};`,
      loader: 'js',
    }));
  },
};
plugin(openslop2);
export default openslop2;
