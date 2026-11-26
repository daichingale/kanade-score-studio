import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['app/web/tests', 'tests', 'scripts'].flatMap(dir =>
  readdirSync(new URL(`../${dir}/`, import.meta.url)).filter(name => /\.test\.(mjs|js)$/.test(name)).map(name => `${dir}/${name}`));
const result = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
