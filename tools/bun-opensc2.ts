/** Bun loader for `.opensc2mission` files (JSON inside). Preloaded by bunfig.toml for `bun run`, `bun test`
 *  and the Mission Builder's bundler; the game's Vite build uses the matching plugin in vite.config.ts. */
import { plugin, type BunPlugin } from 'bun';

export const opensc2: BunPlugin = {
  name: 'opensc2-json',
  setup(build) {
    build.onLoad({ filter: /\.opensc2mission$/ }, async args => ({
      contents: `export default ${JSON.stringify(JSON.parse(await Bun.file(args.path).text()))};`,
      loader: 'js',
    }));
  },
};
plugin(opensc2);
export default opensc2;
