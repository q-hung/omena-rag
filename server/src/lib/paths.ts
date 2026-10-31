import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The `server/` folder: nearest `package.json` above this file. The same from `src/` and `dist/src/`,
 * so data files (drizzle, fixtures, eval JSON) are found whether the code runs from TS sources or the build.
 */
export const SERVER_ROOT = findServerRoot(import.meta.dirname);

function findServerRoot(from: string): string {
  let dir = from;
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`No package.json above ${from}`);
    }
    dir = parent;
  }
  return dir;
}
